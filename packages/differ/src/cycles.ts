import { cmp, type GraphFile } from "@srcatlas/core";

export type CycleKind = "modules" | "packages";

const CYCLE_EDGES: Record<CycleKind, { edge: string; node: string }> = {
  modules: { edge: "imports", node: "module" },
  packages: { edge: "depends_on", node: "package" },
};

/**
 * Strongly connected components with more than one member (Tarjan), members
 * sorted. Recursion depth is the longest path in the graph, which for module
 * or package graphs stays far below the engine's stack limit.
 */
function components(edges: [string, string][]): string[][] {
  const next = new Map<string, string[]>();
  for (const [from, to] of edges)
    next.set(from, [...(next.get(from) ?? []), to]);

  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const out: string[][] = [];

  const visit = (v: string): void => {
    index.set(v, index.size);
    low.set(v, index.get(v) ?? 0);
    stack.push(v);
    onStack.add(v);
    for (const w of next.get(v) ?? []) {
      if (!index.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v) ?? 0, low.get(w) ?? 0));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v) ?? 0, index.get(w) ?? 0));
      }
    }
    if (low.get(v) !== index.get(v)) return;
    const members: string[] = [];
    for (let w = stack.pop(); w !== undefined; w = stack.pop()) {
      onStack.delete(w);
      members.push(w);
      if (w === v) break;
    }
    if (members.length > 1) out.push(members.sort(cmp));
  };
  for (const v of next.keys()) if (!index.has(v)) visit(v);
  return out;
}

/** Cycles of one kind in a graph (docs/schema.md section 13.1). */
export function cyclesOf(g: GraphFile, kind: CycleKind): string[][] {
  const { edge, node } = CYCLE_EDGES[kind];
  const ids = new Set(g.nodes.filter((n) => n.kind === node).map((n) => n.id));
  return components(
    g.edges
      .filter((e) => e.kind === edge && ids.has(e.from) && ids.has(e.to))
      .map((e): [string, string] => [e.from, e.to]),
  );
}

/** Head cycles that are not already inside one base cycle (section 13.1). */
export function newCycles(
  base: GraphFile,
  head: GraphFile,
): { kind: CycleKind; members: string[] }[] {
  return (["modules", "packages"] as const).flatMap((kind) => {
    const owner = new Map<string, number>();
    cyclesOf(base, kind).forEach((c, i) => {
      for (const m of c) owner.set(m, i);
    });
    return cyclesOf(head, kind)
      .filter((c) => {
        const first = owner.get(c[0] ?? "");
        return first === undefined || c.some((m) => owner.get(m) !== first);
      })
      .map((members) => ({ kind, members }));
  });
}
