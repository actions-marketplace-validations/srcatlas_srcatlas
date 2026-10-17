import type { Site } from "@srcatlas/core";
import { type ClassDeclaration, Node, type Project } from "ts-morph";
import { type EvalContext, evaluate, type Result } from "./evaluate.js";
import { isFromModule } from "./origin.js";

const NEST_COMMON = "@nestjs/common";
const KEYS = ["imports", "controllers", "providers", "exports"] as const;

/** One element of a metadata array. `site` is the element, or the spread expression it came from. */
export interface ModuleRef {
  result: Result;
  site: Site;
}

export interface ModuleInfo {
  name: string;
  /** Repository-relative. */
  file: string;
  /** First decorator line of the class. */
  line: number;
  global: boolean;
  declaration: ClassDeclaration;
  imports: ModuleRef[];
  controllers: ModuleRef[];
  providers: ModuleRef[];
  exports: ModuleRef[];
  /** Sites where the metadata, or a whole key of it, could not be evaluated (N-M7). */
  problems: Site[];
  /** True when `problems` is not empty. */
  unresolved: boolean;
}

function siteOf(node: Node, ctx: EvalContext): Site {
  return {
    file: ctx.relative(node.getSourceFile().getFilePath()),
    line: node.getStartLineNumber(),
  };
}

/**
 * Reads every class decorated with `@Module` from `@nestjs/common` (matched by import origin)
 * (N-M1 to N-M4). Metadata is evaluated by the rules of nestjs.md section 2; what cannot be
 * evaluated is recorded, never guessed. Output is in file path order, then source order.
 */
export function readModules(project: Project, ctx: EvalContext): ModuleInfo[] {
  const out: ModuleInfo[] = [];
  const files = [...project.getSourceFiles()].sort((a, b) =>
    a.getFilePath() < b.getFilePath()
      ? -1
      : a.getFilePath() > b.getFilePath()
        ? 1
        : 0,
  );
  for (const sf of files) {
    for (const cls of sf.getClasses()) {
      const name = cls.getName();
      const decorators = cls.getDecorators();
      const moduleCall = decorators
        .map((d) => d.getCallExpression())
        .find(
          (c) => c && isFromModule(c.getExpression(), NEST_COMMON, "Module"),
        );
      if (!name || !moduleCall) continue;

      const info: ModuleInfo = {
        name,
        file: ctx.relative(sf.getFilePath()),
        line: cls.getStartLineNumber(),
        global: decorators.some((d) => {
          const call = d.getCallExpression();
          return (
            !!call && isFromModule(call.getExpression(), NEST_COMMON, "Global")
          );
        }),
        declaration: cls,
        imports: [],
        controllers: [],
        providers: [],
        exports: [],
        problems: [],
        unresolved: false,
      };

      const arg = moduleCall.getArguments()[0];
      if (arg) {
        const meta = evaluate(arg, ctx);
        if (meta.kind !== "object") info.problems.push(siteOf(arg, ctx));
        else {
          for (const key of KEYS) {
            const value = meta.props[key];
            if (!value) continue;
            if (value.kind === "array") {
              info[key].push(
                ...value.items.map((r) => ({
                  result: r,
                  site: siteOf(r.node, ctx),
                })),
              );
            } else info.problems.push(siteOf(value.node, ctx));
          }
        }
      }
      info.unresolved = info.problems.length > 0;
      out.push(info);
    }
  }
  return out;
}

/** `ConfigModule.forRoot()` or `forRoot()` where the receiver is imported from outside the repository. */
export function isThirdPartyCall(node: Node, ctx: EvalContext): boolean {
  if (!Node.isCallExpression(node)) return false;
  let callee: Node = node.getExpression();
  while (Node.isPropertyAccessExpression(callee))
    callee = callee.getExpression();
  return Node.isIdentifier(callee) && evaluate(callee, ctx).kind === "external";
}
