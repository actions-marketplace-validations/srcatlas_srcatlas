import type {
  AccessFact,
  Edge,
  EdgeKind,
  Node,
  ReportEntry,
} from "@srcatlas/core";

// docs/extractors/prisma.md section 3 and ADR 0011: turns the access facts of all packages into
// `reads` and `writes` edges. Pure: the same facts and nodes always give the same result.

const NAME = "prisma";
const CALLERS = ["provider", "controller", "gateway", "route", "action"];

/** PR-C2. An operation outside both lists is not guessed. */
const KIND: Record<string, EdgeKind> = Object.fromEntries([
  ...[
    "findUnique",
    "findUniqueOrThrow",
    "findFirst",
    "findFirstOrThrow",
    "findMany",
    "count",
    "aggregate",
    "groupBy",
  ].map((op) => [op, "reads"]),
  ...[
    "create",
    "createMany",
    "createManyAndReturn",
    "update",
    "updateMany",
    "updateManyAndReturn",
    "upsert",
    "delete",
    "deleteMany",
  ].map((op) => [op, "writes"]),
]);

export interface Resolved {
  edges: Edge[];
  report: ReportEntry[];
  /** Counters for facts dropped on purpose (docs/report.md). */
  summary: Record<string, number>;
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const lowerFirst = (s: string): string =>
  s.charAt(0).toLowerCase() + s.slice(1);

export function resolveAccessFacts(
  facts: readonly AccessFact[],
  nodes: readonly Node[],
): Resolved {
  const edges: Edge[] = [];
  const report: ReportEntry[] = [];
  const summary: Record<string, number> = {};
  const noSchema = new Set<string>();

  const sorted = [...facts].sort(
    (a, b) =>
      cmp(a.callerFile, b.callerFile) ||
      a.site.line - b.site.line ||
      cmp(a.delegate, b.delegate) ||
      cmp(a.operation, b.operation),
  );

  for (const f of sorted) {
    const pkg = `package:${f.package}`;
    const caller = nodes.find(
      (n) =>
        CALLERS.includes(n.kind) &&
        n.package === pkg &&
        n.source?.file === f.callerFile &&
        n.name === f.callerName,
    );
    if (!caller) {
      summary["prisma.access-outside-node"] =
        (summary["prisma.access-outside-node"] ?? 0) + 1;
      continue;
    }

    const models = nodes.filter((n) => n.kind === "model" && n.package === pkg);
    if (models.length === 0) {
      if (!noSchema.has(f.package)) {
        noSchema.add(f.package);
        report.push({
          level: "info",
          code: "prisma.no-schema-found",
          message: `package ${f.package} uses a Prisma client and has no schema`,
          extractor: NAME,
          site: f.site,
        });
      }
      continue;
    }
    const matches = models.filter((m) => lowerFirst(m.name) === f.delegate);
    if (matches.length === 0) {
      report.push({
        level: "warning",
        code: "prisma.unknown-model-access",
        message: `no model matches the delegate ${f.delegate}`,
        extractor: NAME,
        site: f.site,
      });
      continue;
    }

    const kind = KIND[f.operation];
    if (!kind) {
      report.push({
        level: "info",
        code: "prisma.unknown-operation",
        message: `${f.operation} is not a known Prisma operation`,
        extractor: NAME,
        site: f.site,
      });
      continue;
    }

    const ambiguous = matches.length > 1;
    if (ambiguous) {
      report.push({
        level: "warning",
        code: "prisma.ambiguous-model",
        message: `${f.delegate} matches ${matches.length} models`,
        extractor: NAME,
        site: f.site,
      });
    }
    for (const model of matches) {
      edges.push({
        from: caller.id,
        kind,
        to: model.id,
        sites: [f.site],
        extractor: NAME,
        confidence: f.proof === "type" && !ambiguous ? "certain" : "inferred",
        meta: { operations: [f.operation] },
      });
    }
  }
  return { edges, report, summary };
}
