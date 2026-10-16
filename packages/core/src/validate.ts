import {
  type Edge,
  type EdgeKind,
  type GraphFile,
  NODE_KINDS,
  Node,
  type NodeKind,
} from "./schema.js";

/** Code-unit comparison (schema section 9). Never `localeCompare`. */
export const cmp = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0;

export const compareNodes = (a: { id: string }, b: { id: string }): number =>
  cmp(a.id, b.id);

export const compareEdges = (
  a: Pick<Edge, "from" | "kind" | "to">,
  b: Pick<Edge, "from" | "kind" | "to">,
): number => cmp(a.from, b.from) || cmp(a.kind, b.kind) || cmp(a.to, b.to);

export const compareSites = (
  a: { file: string; line: number },
  b: { file: string; line: number },
): number => cmp(a.file, b.file) || a.line - b.line;

const CONTAINED: NodeKind[] = ["module", "provider", "controller", "gateway"];
const CALLERS: NodeKind[] = [
  "provider",
  "controller",
  "gateway",
  "route",
  "action",
];

/** Section 6.1. `imports` additionally requires `from` and `to` to be the same kind. */
const ALLOWED: Record<EdgeKind, { from: NodeKind[]; to: NodeKind[] }> = {
  contains: { from: ["module"], to: CONTAINED },
  imports: { from: ["module", "file"], to: ["module", "file"] },
  exports: { from: ["module"], to: ["provider"] },
  depends_on: { from: ["package"], to: ["package"] },
  injects: {
    from: ["provider", "controller", "gateway"],
    to: ["provider", "queue"],
  },
  handles: { from: ["controller"], to: ["route"] },
  calls: { from: CALLERS, to: ["provider", "action"] },
  reads: { from: CALLERS, to: ["model"] },
  writes: { from: CALLERS, to: ["model"] },
  enqueues: { from: CALLERS, to: ["queue"] },
  consumes: { from: ["provider"], to: ["queue"] },
  emits: { from: CALLERS, to: ["event"] },
  listens: { from: ["gateway", "provider"], to: ["event"] },
  uses_external: { from: CALLERS, to: ["external"] },
};

export interface Violation {
  /** Invariant number from docs/schema.md section 10. */
  invariant: number;
  message: string;
}

const badPath = (f: string): boolean =>
  f === "" ||
  f.startsWith("/") ||
  f.startsWith("./") ||
  f.includes("\\") ||
  /^[A-Za-z]:/.test(f) ||
  f.split("/").includes("..");

function inOrder<T>(xs: readonly T[], c: (a: T, b: T) => number): boolean {
  for (let i = 1; i < xs.length; i++) {
    const [a, b] = [xs[i - 1], xs[i]];
    if (a !== undefined && b !== undefined && c(a, b) > 0) return false;
  }
  return true;
}

/**
 * Checks the ten invariants of docs/schema.md section 10 on a structurally
 * valid graph. Returns every violation; an empty array means valid. Unknown
 * node and edge kinds are generic (section 12) and skip the kind checks.
 */
export function validateGraph(g: GraphFile): Violation[] {
  const out: Violation[] = [];
  const v = (invariant: number, message: string) =>
    out.push({ invariant, message });

  const kindOf = new Map<string, string>();
  for (const n of g.nodes) {
    if (kindOf.has(n.id)) v(1, `duplicate node id ${n.id}`);
    kindOf.set(n.id, n.kind);
  }

  for (const n of g.nodes) {
    if (kindOf.get(n.package) !== "package")
      v(4, `${n.id}: package ${n.package} is not a package node`);
    if (n.module !== null && kindOf.get(n.module) !== "module") {
      v(4, `${n.id}: module ${n.module} is not a module node`);
    }
    if (!Node.safeParse(n).success)
      v(6, `${n.id}: invalid or missing meta for kind ${n.kind}`);
    if (n.source && badPath(n.source.file))
      v(7, `${n.id}: bad source path ${n.source.file}`);
    if (!n.extractor) v(8, `${n.id}: empty extractor`);
  }

  const seen = new Set<string>();
  for (const e of g.edges) {
    const label = `${e.from} -${e.kind}-> ${e.to}`;
    const fk = kindOf.get(e.from);
    const tk = kindOf.get(e.to);
    if (fk === undefined) v(2, `${label}: unknown from`);
    if (tk === undefined) v(2, `${label}: unknown to`);
    const rule = ALLOWED[e.kind as EdgeKind];
    if (rule && fk && tk && isKind(fk) && isKind(tk)) {
      const ok =
        rule.from.includes(fk) &&
        rule.to.includes(tk) &&
        (e.kind !== "imports" || fk === tk);
      if (!ok) v(3, `${label}: ${fk} -> ${tk} not allowed`);
    }
    if (e.from === e.to) v(5, `${label}: self-edge`);
    for (const s of e.sites)
      if (badPath(s.file)) v(7, `${label}: bad site path ${s.file}`);
    if (!e.extractor) v(8, `${label}: empty extractor`);
    const key = `${e.from}\0${e.kind}\0${e.to}`;
    if (seen.has(key)) v(10, `${label}: duplicate edge`);
    seen.add(key);
  }

  if (!inOrder(g.nodes, compareNodes)) v(9, "nodes not sorted by id");
  if (!inOrder(g.edges, compareEdges))
    v(9, "edges not sorted by from, kind, to");
  for (const e of g.edges) {
    if (!inOrder(e.sites, compareSites))
      v(9, `${e.from} -${e.kind}-> ${e.to}: sites not sorted`);
  }
  return out;
}

const isKind = (k: string): k is NodeKind =>
  (NODE_KINDS as string[]).includes(k);
