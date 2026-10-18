import {
  type Confidence,
  CYCLE_EDGES,
  cmp,
  compareEdges,
  compareSites,
  cyclesOf,
  type Edge,
  type GraphFile,
  type Node,
  type Rule,
  type Site,
} from "@srcatlas/core";
import picomatch from "picomatch";

export type Violation = {
  rule: string;
  severity: "error" | "warn";
  message: string;
  sites: Site[];
} & (
  | { from: string; to: string; edgeKind: string }
  | { over: "modules" | "packages"; members: string[] }
);

export interface Evaluation {
  violations: Violation[];
  /** Stale exceptions and rules that are not evaluated yet (docs/config.md 2.4). */
  warnings: string[];
}

type ForbiddenEdge = Extract<Rule, { type: "forbidden-edge" }>;
type Selector = ForbiddenEdge["from"];

const RANK: Record<Confidence, number> = {
  certain: 2,
  inferred: 1,
  unresolved: 0,
};

const PACKAGE_PREFIX = "package:";

/** A node matcher for a selector (docs/config.md 2.4, "Selector semantics"). */
function matcher(
  sel: Selector,
  nodes: Map<string, Node>,
): (n: Node) => boolean {
  const glob = (pattern: string | undefined) =>
    pattern === undefined ? undefined : picomatch(pattern, { dot: true });
  const kinds = sel.kind === undefined ? undefined : [sel.kind].flat();
  const pkg = glob(sel.package);
  const mod = glob(sel.module);
  const file = glob(sel.file);
  return (n) => {
    if (kinds && !kinds.includes(n.kind)) return false;
    if (pkg && !pkg(n.package.slice(PACKAGE_PREFIX.length))) return false;
    if (mod) {
      const name = n.module === null ? undefined : nodes.get(n.module)?.name;
      if (name === undefined || !mod(name)) return false;
    }
    if (file && (n.source === null || !file(n.source.file))) return false;
    if (sel.role !== undefined && n.meta.role !== sel.role) return false;
    return true;
  };
}

function forbiddenEdge(
  rule: ForbiddenEdge,
  graph: GraphFile,
  nodes: Map<string, Node>,
  min: number,
  out: Evaluation,
): void {
  const from = matcher(rule.from, nodes);
  const to = matcher(rule.to, nodes);
  const kinds = rule.edgeKinds as string[] | undefined;
  const except = rule.except ?? [];
  const used = new Set<number>();
  const taking = (c: Confidence) => RANK[c] >= min;

  const candidates = graph.edges
    .filter((e) => !kinds || kinds.includes(e.kind))
    .filter((e) => taking(e.confidence))
    .filter((e) => {
      const a = nodes.get(e.from);
      const b = nodes.get(e.to);
      return (
        a &&
        b &&
        taking(a.confidence) &&
        taking(b.confidence) &&
        from(a) &&
        to(b)
      );
    })
    .sort(compareEdges);

  for (const e of candidates) {
    // An entry with neither field excuses nothing.
    const excusing = except.flatMap((x, i) =>
      (x.from !== undefined || x.to !== undefined) &&
      (x.from === undefined || x.from === e.from) &&
      (x.to === undefined || x.to === e.to)
        ? [i]
        : [],
    );
    if (excusing.length > 0) {
      for (const i of excusing) used.add(i);
      continue;
    }
    out.violations.push({
      rule: rule.id,
      severity: rule.severity ?? "error",
      message: rule.message ?? `${e.from} ${e.kind} ${e.to} is not allowed`,
      from: e.from,
      to: e.to,
      edgeKind: e.kind,
      sites: e.sites,
    });
  }
  except.forEach((x, i) => {
    if (!used.has(i)) {
      out.warnings.push(
        `rule ${rule.id}: stale exception ${JSON.stringify(x)}`,
      );
    }
  });
}

function noCycles(
  rule: Extract<Rule, { type: "no-cycles" }>,
  graph: GraphFile,
  min: number,
  out: Evaluation,
): void {
  const taking = (c: Confidence) => RANK[c] >= min;
  const nodes = graph.nodes.filter((n) => taking(n.confidence));
  const edges = graph.edges.filter((e) => taking(e.confidence));
  const taken = { ...graph, nodes, edges };
  const edgeKind = CYCLE_EDGES[rule.over].edge;

  const components = cyclesOf(taken, rule.over).sort((a, b) =>
    cmp(a[0] ?? "", b[0] ?? ""),
  );
  for (const members of components) {
    const inside = new Set(members);
    const within = edges.filter(
      (e: Edge) =>
        e.kind === edgeKind && inside.has(e.from) && inside.has(e.to),
    );
    out.violations.push({
      rule: rule.id,
      severity: rule.severity ?? "error",
      message: rule.message ?? `cycle over ${rule.over}: ${members.join(", ")}`,
      over: rule.over,
      members,
      sites: within.flatMap((e) => e.sites).sort(compareSites),
    });
  }
}

/**
 * Evaluates rules against a graph (docs/config.md 2.4). `minConfidence` is the
 * `check --min-confidence` level; the higher of it and a rule's own level applies.
 */
export function evaluateRules(
  graph: GraphFile,
  rules: Rule[],
  opts: { minConfidence?: Confidence } = {},
): Evaluation {
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  const out: Evaluation = { violations: [], warnings: [] };
  for (const rule of rules) {
    const min = Math.max(
      RANK[rule.minConfidence ?? "inferred"],
      RANK[opts.minConfidence ?? "inferred"],
    );
    if (rule.type === "forbidden-edge") {
      forbiddenEdge(rule, graph, nodes, min, out);
    } else if (rule.type === "no-cycles") {
      noCycles(rule, graph, min, out);
    } else {
      out.warnings.push(
        `rule ${rule.id}: type ${rule.type} is not supported yet, skipped`,
      );
    }
  }
  return out;
}
