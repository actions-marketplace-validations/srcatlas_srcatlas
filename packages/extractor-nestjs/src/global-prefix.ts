import type { Site } from "@srcatlas/core";
import { Node, type Project, SyntaxKind } from "ts-morph";
import { type EvalContext, evaluate, type Result } from "./evaluate.js";
import { siteOf } from "./modules.js";
import { originOf } from "./origin.js";

// nestjs.md N-R5: the global prefix of the application and the paths it leaves alone.

const NEST_COMMON = "@nestjs/common";
const TEST_FILE =
  /(^|\/)(__tests__|tests?|e2e)\/|\.(spec|test|e2e-spec)\.[cm]?[jt]sx?$/;

/** A path with a pattern or wildcard is never matched (open question 11). */
const isPattern = (path: string): boolean => /[*(:]/.test(path);

export interface Exclude {
  path: string;
  /** `ALL` when the entry names no method. */
  method: string;
}

export type GlobalPrefix =
  | { kind: "none" }
  | { kind: "prefix"; value: string; excludes: Exclude[]; unresolved: Site[] }
  /** `process.env.PREFIX` and the like: the route is emitted without it. */
  | { kind: "unresolved"; site: Site }
  /** More than one `NestFactory.create` in the package: no prefix is applied. */
  | { kind: "ambiguous"; site: Site };

function requestMethod(r: Result | undefined): string | undefined {
  if (!r) return "ALL";
  if (r.kind === "enum" && r.enumName === "RequestMethod") return r.member;
  if (
    r.kind === "externalMember" &&
    r.module === NEST_COMMON &&
    r.owner === "RequestMethod"
  ) {
    return r.member;
  }
  return undefined;
}

function readExcludes(
  result: Result | undefined,
  at: Node,
  ctx: EvalContext,
): Pick<Extract<GlobalPrefix, { kind: "prefix" }>, "excludes" | "unresolved"> {
  const excludes: Exclude[] = [];
  const unresolved: Site[] = [];
  if (!result) return { excludes, unresolved };
  if (result.kind !== "array") {
    unresolved.push(siteOf(at, ctx));
    return { excludes, unresolved };
  }
  for (const item of result.items) {
    const path = item.kind === "object" ? item.props.path : undefined;
    const method =
      item.kind === "object" ? requestMethod(item.props.method) : undefined;
    if (
      path?.kind !== "string" ||
      method === undefined ||
      isPattern(path.value)
    ) {
      unresolved.push(siteOf(item.node, ctx));
    } else excludes.push({ path: path.value, method });
  }
  return { excludes, unresolved };
}

/**
 * Finds `NestFactory.create(...)` (matched by import origin, tests excluded) and the
 * `setGlobalPrefix` call on the application it returns, in the same function.
 */
export function readGlobalPrefix(
  project: Project,
  ctx: EvalContext,
): GlobalPrefix {
  const files = project
    .getSourceFiles()
    .filter((sf) => !TEST_FILE.test(ctx.relative(sf.getFilePath())))
    .sort((a, b) => (a.getFilePath() < b.getFilePath() ? -1 : 1));
  const creates = files.flatMap((sf) =>
    sf.getDescendantsOfKind(SyntaxKind.CallExpression).filter((call) => {
      const callee = call.getExpression();
      if (!Node.isPropertyAccessExpression(callee)) return false;
      const origin = originOf(callee.getExpression());
      return (
        callee.getName() === "create" &&
        origin?.module === "@nestjs/core" &&
        origin.name === "NestFactory"
      );
    }),
  );
  const [only, second] = creates;
  if (!only) return { kind: "none" };
  if (second) return { kind: "ambiguous", site: siteOf(only, ctx) };

  const declaration = only
    .getAncestors()
    .find((a) => Node.isVariableDeclaration(a));
  const name = declaration
    ?.asKind(SyntaxKind.VariableDeclaration)
    ?.getNameNode();
  if (!name || !Node.isIdentifier(name)) return { kind: "none" };
  const scope =
    only.getFirstAncestor(Node.isFunctionLikeDeclaration) ??
    only.getSourceFile();
  const symbol = name.getSymbol();
  const call = scope
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .find((c) => {
      const callee = c.getExpression();
      return (
        Node.isPropertyAccessExpression(callee) &&
        callee.getName() === "setGlobalPrefix" &&
        symbol !== undefined &&
        callee.getExpression().getSymbol() === symbol
      );
    });
  if (!call) return { kind: "none" };

  const [prefixArg, options] = call.getArguments();
  const value = prefixArg ? evaluate(prefixArg, ctx) : undefined;
  if (value?.kind !== "string")
    return { kind: "unresolved", site: siteOf(call, ctx) };

  const opts = options ? evaluate(options, ctx) : undefined;
  const exclude = opts?.kind === "object" ? opts.props.exclude : undefined;
  return {
    kind: "prefix",
    value: value.value,
    ...readExcludes(exclude, exclude?.node ?? call, ctx),
  };
}
