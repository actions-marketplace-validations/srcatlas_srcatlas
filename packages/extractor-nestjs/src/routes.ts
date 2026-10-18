import {
  classId,
  type Edge,
  type Node,
  normalizeRoutePath,
  type ReportEntry,
  type Site,
  withCollisionSuffix,
} from "@srcatlas/core";
import type { ClassDeclaration, Decorator, Project } from "ts-morph";
import { type EvalContext, evaluate, type Result } from "./evaluate.js";
import { type GlobalPrefix, readGlobalPrefix } from "./global-prefix.js";
import { type ModuleInfo, siteOf } from "./modules.js";
import { originOf } from "./origin.js";

// nestjs.md N-R1 to N-R5 and N-R8 to N-R10: controllers, their handlers and the routes they give.
// Decorators are matched by import origin (hard rule 1).

const NAME = "nestjs";
const COMMON = "@nestjs/common";
const MICROSERVICES = "@nestjs/microservices";

/** Supported method decorators (N-R1). `Sse` is a GET. */
const METHODS: Record<string, string> = {
  Get: "GET",
  Post: "POST",
  Put: "PUT",
  Patch: "PATCH",
  Delete: "DELETE",
  Options: "OPTIONS",
  Head: "HEAD",
  All: "ALL",
  Sse: "GET",
};
const PATTERNS = ["MessagePattern", "EventPattern"];

const byCodeUnit = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0;

/** The decorator's name when it comes from `module` and is one of `names`. */
function nameFrom(
  d: Decorator,
  module: string,
  names: readonly string[],
): string | undefined {
  const call = d.getCallExpression();
  const origin = call && originOf(call.getExpression());
  return origin?.module === module && names.includes(origin.name)
    ? origin.name
    : undefined;
}

/** A string or an array of strings; `undefined` when anything else is in it. */
function pathsOf(r: Result | undefined): string[] | undefined {
  if (!r) return [""];
  if (r.kind === "string") return [r.value];
  if (r.kind !== "array") return undefined;
  const out: string[] = [];
  for (const item of r.items) {
    if (item.kind !== "string") return undefined;
    out.push(item.value);
  }
  return out;
}

interface Handler {
  method: string;
  paths: string[];
  name: string;
  site: Site;
}

interface Controller {
  cls: ClassDeclaration;
  name: string;
  file: string;
  line: number;
  /** Declared base paths; `undefined` when they cannot be evaluated. */
  bases: string[] | undefined;
  host: string | undefined;
  handlers: Handler[];
}

function readHandlers(
  cls: ClassDeclaration,
  ctx: EvalContext,
  report: ReportEntry[],
): Handler[] {
  const out: Handler[] = [];
  for (const m of cls.getMethods()) {
    for (const d of m.getDecorators()) {
      const pattern = nameFrom(d, MICROSERVICES, PATTERNS);
      if (pattern) {
        report.push({
          level: "info",
          code: "nest.microservice-pattern-ignored",
          message: `@${pattern} on ${cls.getName()}.${m.getName()} is not an HTTP route`,
          extractor: NAME,
          site: siteOf(d, ctx),
        });
        continue;
      }
      const decorator = nameFrom(d, COMMON, Object.keys(METHODS));
      const method = decorator && METHODS[decorator];
      if (!method) continue;
      const arg = d.getCallExpression()?.getArguments()[0];
      const paths = pathsOf(arg && evaluate(arg, ctx));
      // A path that cannot be evaluated gives no route: there is nothing to name it by.
      if (paths) {
        out.push({ method, paths, name: m.getName(), site: siteOf(m, ctx) });
      }
    }
  }
  return out;
}

function readController(
  cls: ClassDeclaration,
  ctx: EvalContext,
  report: ReportEntry[],
): Controller | undefined {
  const name = cls.getName();
  const decorator = cls
    .getDecorators()
    .find((d) => nameFrom(d, COMMON, ["Controller"]));
  if (!name || !decorator) return undefined;

  const arg = decorator.getCallExpression()?.getArguments()[0];
  const value = arg && evaluate(arg, ctx);
  let bases: string[] | undefined;
  let host: string | undefined;
  if (value?.kind === "object") {
    bases = pathsOf(value.props.path);
    if (value.props.host?.kind === "string") host = value.props.host.value;
  } else bases = pathsOf(value);

  return {
    cls,
    name,
    file: ctx.relative(cls.getSourceFile().getFilePath()),
    line: cls.getStartLineNumber(),
    bases,
    host,
    handlers: readHandlers(cls, ctx, report),
  };
}

/** A controller node, for what other parts need from it (constructor injection, N-P2). */
export interface ControllerRef {
  id: string;
  declaration: ClassDeclaration;
  /** Index into the module list; absent when no module lists the controller. */
  module?: number;
}

export interface Routes {
  nodes: Node[];
  edges: Edge[];
  report: ReportEntry[];
  controllers: ControllerRef[];
}

function prefixed(
  prefix: GlobalPrefix,
  path: string,
  method: string,
): { path: string; inferred: boolean } {
  if (prefix.kind === "unresolved" || prefix.kind === "ambiguous") {
    return { path, inferred: true };
  }
  if (prefix.kind === "none") return { path, inferred: false };
  const excluded = prefix.excludes.some(
    (e) =>
      normalizeRoutePath(e.path) === path &&
      (e.method === "ALL" || e.method === method),
  );
  return {
    path: excluded ? path : normalizeRoutePath(prefix.value, path),
    inferred: false,
  };
}

export function buildRoutes(input: {
  pkg: string;
  project: Project;
  ctx: EvalContext;
  modules: ModuleInfo[];
  moduleIds: string[];
}): Routes {
  const { pkg, project, ctx, modules, moduleIds } = input;
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const report: ReportEntry[] = [];

  const files = [...project.getSourceFiles()].sort((a, b) =>
    byCodeUnit(a.getFilePath(), b.getFilePath()),
  );
  const controllers = files.flatMap((sf) =>
    sf
      .getClasses()
      .map((cls) => readController(cls, ctx, report))
      .filter((c): c is Controller => c !== undefined),
  );

  // The first module that lists a controller is its module.
  const owner = new Map<string, { module: number; site: Site }>();
  modules.forEach((m, i) => {
    for (const ref of m.controllers) {
      const r = ref.result;
      const key = r.kind === "class" ? `${r.file}#${r.name}` : undefined;
      if (key && !owner.has(key)) owner.set(key, { module: i, site: ref.site });
    }
  });

  const ids = withCollisionSuffix(
    controllers.map((c) => ({
      id: classId("controller", pkg, c.name),
      dir: c.file.slice(0, c.file.lastIndexOf("/")),
    })),
  );
  const prefix = readGlobalPrefix(project, ctx);
  if (prefix.kind === "unresolved") {
    report.push({
      level: "warning",
      code: "nest.unresolved-prefix",
      message: "the global prefix could not be evaluated statically",
      extractor: NAME,
      site: prefix.site,
    });
  } else if (prefix.kind === "ambiguous") {
    report.push({
      level: "warning",
      code: "nest.ambiguous-app",
      message: "more than one NestFactory.create in the package",
      extractor: NAME,
      site: prefix.site,
    });
  } else if (prefix.kind === "prefix") {
    for (const site of prefix.unresolved) {
      report.push({
        level: "info",
        code: "nest.unresolved-exclude",
        message: "a setGlobalPrefix exclude entry is not matched",
        extractor: NAME,
        site,
      });
    }
  }

  const refs: ControllerRef[] = [];
  const seen = new Map<string, Site>();
  controllers.forEach((c, i) => {
    const id = ids[i] ?? "";
    const own = owner.get(`${c.file}#${c.name}`);
    const moduleId = own ? (moduleIds[own.module] ?? null) : null;
    refs.push({
      id,
      declaration: c.cls,
      ...(own ? { module: own.module } : {}),
    });
    const source = { file: c.file, line: c.line };
    const normalized = (c.bases ?? [""]).map((b) => normalizeRoutePath(b));
    const sorted = [...new Set(normalized)].sort(byCodeUnit);

    nodes.push({
      id,
      kind: "controller",
      name: c.name,
      language: "typescript",
      framework: "nestjs",
      package: `package:${pkg}`,
      module: moduleId,
      source,
      extractor: NAME,
      confidence: c.bases ? "certain" : "unresolved",
      meta: {
        basePath: normalized[0] ?? "/",
        ...(sorted.length > 1 ? { "nestjs.basePaths": sorted } : {}),
        ...(c.host === undefined ? {} : { "nestjs.host": c.host }),
      },
    });
    if (own && moduleId) {
      edges.push({
        from: moduleId,
        to: id,
        kind: "contains",
        sites: [own.site],
        extractor: NAME,
        confidence: "certain",
        meta: {},
      });
    } else {
      report.push({
        level: "warning",
        code: "nest.unregistered-controller",
        message: `${c.name} is not listed in any module's controllers`,
        extractor: NAME,
        site: source,
      });
    }
    if (!c.bases) return;

    for (const base of c.bases) {
      for (const h of c.handlers) {
        for (const p of h.paths) {
          const plain = normalizeRoutePath(base, p);
          const { path, inferred } = prefixed(prefix, plain, h.method);
          const routeId = `route:${pkg}/${h.method} ${path}`;
          const confidence = inferred ? "inferred" : "certain";
          const first = seen.get(routeId);
          if (first) {
            report.push({
              level: "warning",
              code: "nest.duplicate-route",
              message: `${h.method} ${path} is also handled at ${first.file}:${first.line}`,
              extractor: NAME,
              site: h.site,
            });
          } else {
            seen.set(routeId, h.site);
            nodes.push({
              id: routeId,
              kind: "route",
              name: `${h.method} ${path}`,
              language: "typescript",
              framework: "nestjs",
              package: `package:${pkg}`,
              module: moduleId,
              source: h.site,
              extractor: NAME,
              confidence,
              meta: {
                handlerName: h.name,
                method: h.method,
                path,
                type: "handler",
              },
            });
          }
          edges.push({
            from: id,
            to: routeId,
            kind: "handles",
            sites: [h.site],
            extractor: NAME,
            confidence,
            meta: {},
          });
        }
      }
    }
  });
  return { nodes, edges, report, controllers: refs };
}
