import { posix } from "node:path";
import type { AccessFact, ReportEntry, Site } from "@srcatlas/core";
import {
  type ClassDeclaration,
  type ExportDeclaration,
  type ImportDeclaration,
  Node,
  type Project,
  type SourceFile,
  SyntaxKind,
  type Symbol as TsSymbol,
} from "ts-morph";

// docs/extractors/prisma.md section 4.2: finds `<client>.<delegate>.<operation>(...)` calls and
// decides whether the receiver is a Prisma client. The decision is made from import specifiers
// and `extends`, not from the type checker, which sees only `any` when `prisma generate` has not
// been run (open question 4, note 10). Hard rule 1: never by name alone.

const NAME = "prisma";
/** Open question 14: the defaults of `clientNames`, until package config reaches the extractor. */
const CLIENT_NAMES = ["prisma", "prismaService", "db"];
const RAW_METHODS = [
  "$queryRaw",
  "$queryRawUnsafe",
  "$executeRaw",
  "$executeRawUnsafe",
];
const MAX_HOPS = 10;

/** `no` is a resolved receiver that is not a client: the name never overrides it. */
type Verdict = "client" | "no" | "unknown";

export interface ClientUsage {
  facts: AccessFact[];
  report: ReportEntry[];
}

interface Input {
  pkg: string;
  project: Project;
  relative(absolutePath: string): string;
  /** Repository-relative output directories of the schema's generators. */
  outputs: string[];
}

const byCodeUnit = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0;

const stripWrappers = (node: Node): Node => {
  let n = node;
  while (
    Node.isParenthesizedExpression(n) ||
    Node.isAsExpression(n) ||
    Node.isSatisfiesExpression(n) ||
    Node.isNonNullExpression(n)
  ) {
    n = n.getExpression();
  }
  return n;
};

/** The symbol an identifier or member names, following an import to its declaration if it resolves. */
function declarationsOf(node: Node): Node[] {
  let symbol: TsSymbol | undefined = node.getSymbol();
  if (symbol?.isAlias()) symbol = symbol.getAliasedSymbol() ?? symbol;
  return symbol?.getDeclarations() ?? [];
}

export function readClientUsage(input: Input): ClientUsage {
  const { pkg, project, relative, outputs } = input;
  const facts: AccessFact[] = [];
  const report: ReportEntry[] = [];

  const siteOf = (node: Node): Site => ({
    file: relative(node.getSourceFile().getFilePath()),
    line: node.getStartLineNumber(),
  });

  /** Whether `name` imported through `decl` is `PrismaClient` of `@prisma/client` or a generator output. */
  function isClientImport(
    decl: ImportDeclaration | ExportDeclaration,
    name: string,
    hops: number,
  ): boolean {
    const spec = decl.getModuleSpecifierValue();
    if (spec === undefined || hops > MAX_HOPS) return false;
    if (name !== "PrismaClient") {
      // A barrel can rename it; only `PrismaClient` itself is the class.
      return false;
    }
    if (spec === "@prisma/client" || spec.startsWith("@prisma/client/")) {
      return true;
    }
    const from = relative(decl.getSourceFile().getFilePath());
    if (spec.startsWith(".")) {
      const target = posix.join(posix.dirname(from), spec);
      if (outputs.some((o) => target === o || target.startsWith(`${o}/`))) {
        return true;
      }
    }
    // A repository file that re-exports it.
    const file = decl.getModuleSpecifierSourceFile();
    if (!file || file.isInNodeModules()) return false;
    return reexportsClient(file, hops + 1);
  }

  function reexportsClient(file: SourceFile, hops: number): boolean {
    return file.getExportDeclarations().some((e) => {
      if (!e.hasModuleSpecifier()) return false;
      const named = e.getNamedExports();
      if (named.length === 0) return isClientImport(e, "PrismaClient", hops);
      return named.some(
        (n) =>
          (n.getAliasNode()?.getText() ?? n.getName()) === "PrismaClient" &&
          isClientImport(e, n.getName(), hops),
      );
    });
  }

  /** `PrismaClient` as written in an `extends` clause or a `new` expression. */
  function isClientRef(expr: Node): boolean {
    const decl = expr.getSymbol()?.getDeclarations()[0];
    if (!decl || !Node.isImportSpecifier(decl)) return false;
    return isClientImport(decl.getImportDeclaration(), decl.getName(), 0);
  }

  function classVerdict(cls: ClassDeclaration, hops = 0): Verdict {
    const base = cls.getExtends()?.getExpression();
    if (!base || hops > MAX_HOPS) return "no";
    if (isClientRef(base)) return "client";
    const next = declarationsOf(base).find(Node.isClassDeclaration);
    return next ? classVerdict(next, hops + 1) : "no";
  }

  function typeVerdict(typeNode: Node): Verdict {
    if (
      typeNode.getKind() === SyntaxKind.AnyKeyword ||
      typeNode.getKind() === SyntaxKind.UnknownKeyword
    ) {
      return "unknown";
    }
    if (!Node.isTypeReference(typeNode)) return "no";
    const name = typeNode.getTypeName();
    if (isClientRef(name)) return "client";
    const cls = declarationsOf(name).find(Node.isClassDeclaration);
    if (cls) return classVerdict(cls);
    // Declared in the repository as something else: not a client. Unresolved: unknown.
    return declarationsOf(name).length > 0 ? "no" : "unknown";
  }

  function initializerVerdict(init: Node): Verdict {
    const n = stripWrappers(init);
    if (Node.isBinaryExpression(n)) {
      const op = n.getOperatorToken().getKind();
      if (
        op === SyntaxKind.QuestionQuestionToken ||
        op === SyntaxKind.BarBarToken
      ) {
        const sides = [n.getLeft(), n.getRight()].map(initializerVerdict);
        return sides.includes("client") ? "client" : "unknown";
      }
      return "unknown";
    }
    if (Node.isNewExpression(n)) {
      const callee = n.getExpression();
      if (isClientRef(callee)) return "client";
      const cls = declarationsOf(callee).find(Node.isClassDeclaration);
      return cls ? classVerdict(cls) : "unknown";
    }
    if (
      Node.isObjectLiteralExpression(n) ||
      Node.isArrayLiteralExpression(n) ||
      Node.isStringLiteral(n) ||
      Node.isNumericLiteral(n) ||
      Node.isArrowFunction(n) ||
      Node.isFunctionExpression(n)
    ) {
      return "no";
    }
    return "unknown";
  }

  /** PR-C3: the first parameter of a callback given to `$transaction` on a client. */
  function isTransactionParam(param: Node): boolean {
    if (!Node.isParameterDeclaration(param)) return false;
    const fn = param.getParent();
    if (
      !(Node.isArrowFunction(fn) || Node.isFunctionExpression(fn)) ||
      fn.getParameters()[0] !== param
    ) {
      return false;
    }
    const call = fn.getParent();
    if (!Node.isCallExpression(call) || call.getArguments()[0] !== fn) {
      return false;
    }
    const callee = call.getExpression();
    return (
      Node.isPropertyAccessExpression(callee) &&
      callee.getName() === "$transaction" &&
      verdictOf(callee.getExpression()) === "client"
    );
  }

  function declarationVerdict(decl: Node): Verdict {
    if (isTransactionParam(decl)) return "client";
    if (
      Node.isVariableDeclaration(decl) ||
      Node.isPropertyDeclaration(decl) ||
      Node.isParameterDeclaration(decl)
    ) {
      const typeNode = decl.getTypeNode();
      if (typeNode) return typeVerdict(typeNode);
      const init = decl.getInitializer();
      if (init) return initializerVerdict(init);
    }
    return "unknown";
  }

  function verdictOf(expr: Node): Verdict {
    const e = stripWrappers(expr);
    if (e.getKind() === SyntaxKind.ThisKeyword) {
      const cls = e.getFirstAncestorByKind(SyntaxKind.ClassDeclaration);
      return cls ? classVerdict(cls) : "unknown";
    }
    if (Node.isIdentifier(e) || Node.isPropertyAccessExpression(e)) {
      const decl = declarationsOf(e)[0];
      return decl ? declarationVerdict(decl) : "unknown";
    }
    return "unknown";
  }

  /** The proof for a receiver: by type, by name for an unknown one, or none. */
  function proofOf(expr: Node): "type" | "name" | undefined {
    const v = verdictOf(expr);
    if (v === "client") return "type";
    if (v === "no") return undefined;
    const e = stripWrappers(expr);
    const name =
      Node.isIdentifier(e) || Node.isPropertyAccessExpression(e)
        ? e.getText().split(".").pop()
        : undefined;
    return name !== undefined && CLIENT_NAMES.includes(name)
      ? "name"
      : undefined;
  }

  /** `x['order']` and `x[ORDER]` with `const ORDER = 'order'`; anything else is dynamic. */
  function keyOf(arg: Node): string | undefined {
    const n = stripWrappers(arg);
    if (Node.isStringLiteral(n) || Node.isNoSubstitutionTemplateLiteral(n)) {
      return n.getLiteralText();
    }
    if (Node.isIdentifier(n)) {
      const decl = declarationsOf(n)[0];
      if (
        decl &&
        Node.isVariableDeclaration(decl) &&
        decl.getVariableStatement()?.getDeclarationKind() === "const"
      ) {
        const init = decl.getInitializer();
        return init ? keyOf(init) : undefined;
      }
    }
    return undefined;
  }

  /** PR-C8: the class that contains the call, else the named function, else nothing. */
  function callerOf(node: Node): string {
    const cls = node.getFirstAncestorByKind(SyntaxKind.ClassDeclaration);
    if (cls) return cls.getName() ?? "";
    return (
      node.getFirstAncestorByKind(SyntaxKind.FunctionDeclaration)?.getName() ??
      ""
    );
  }

  const files = [...project.getSourceFiles()].sort((a, b) =>
    byCodeUnit(a.getFilePath(), b.getFilePath()),
  );
  for (const sf of files) {
    const callerFile = relative(sf.getFilePath());

    // PR-C6: raw queries are noticed, never turned into edges.
    for (const access of sf.getDescendantsOfKind(
      SyntaxKind.PropertyAccessExpression,
    )) {
      if (!RAW_METHODS.includes(access.getName())) continue;
      const parent = access.getParent();
      const used =
        (Node.isCallExpression(parent) && parent.getExpression() === access) ||
        (Node.isTaggedTemplateExpression(parent) && parent.getTag() === access);
      if (!used || !proofOf(access.getExpression())) continue;
      report.push({
        level: "info",
        code: "prisma.raw-query",
        message: `${access.getName()} is not turned into an edge`,
        extractor: NAME,
        site: siteOf(parent),
      });
    }

    for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const callee = call.getExpression();
      if (!Node.isPropertyAccessExpression(callee)) continue;
      const target = callee.getExpression();
      let delegate: string | undefined;
      let client: Node;
      let dynamic = false;
      if (Node.isPropertyAccessExpression(target)) {
        delegate = target.getName();
        client = target.getExpression();
      } else if (Node.isElementAccessExpression(target)) {
        const arg = target.getArgumentExpression();
        delegate = arg ? keyOf(arg) : undefined;
        dynamic = delegate === undefined;
        client = target.getExpression();
      } else continue;
      if (delegate?.startsWith("$")) continue; // client methods are never delegates
      const proof = proofOf(client);
      if (!proof) continue;
      if (dynamic || delegate === undefined) {
        report.push({
          level: "warning",
          code: "prisma.dynamic-model-access",
          message: "the model of this call is not a literal",
          extractor: NAME,
          site: siteOf(call),
        });
        continue;
      }
      facts.push({
        kind: "access",
        extractor: NAME,
        package: pkg,
        callerFile,
        callerName: callerOf(call),
        delegate,
        operation: callee.getName(),
        site: siteOf(call),
        proof,
      });
    }
  }
  return { facts, report };
}
