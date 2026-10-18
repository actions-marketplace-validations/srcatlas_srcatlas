import {
  compareEdges,
  compareNodes,
  type DiffFile,
  type Edge,
  type GraphFile,
  type Json,
  type Node,
  sortKeys,
} from "@srcatlas/core";

export class DiffError extends Error {}

// Canonical text, so meta compares by value regardless of key order.
const canon = (v: unknown): string => JSON.stringify(sortKeys(v as Json));

// Section 13: source.line alone is not a change. Same id means the ID did not
// change, so a different source.file is a change.
const nodeChanged = (a: Node, b: Node): boolean =>
  a.kind !== b.kind ||
  a.module !== b.module ||
  a.confidence !== b.confidence ||
  a.source?.file !== b.source?.file ||
  canon(a.meta) !== canon(b.meta);

// Section 13: sites are not reported as changes.
const edgeChanged = (a: Edge, b: Edge): boolean =>
  a.confidence !== b.confidence || canon(a.meta) !== canon(b.meta);

// IDs hold no control characters (schema section 5), so NUL cannot collide.
const edgeKey = (e: Edge): string => `${e.from}\0${e.kind}\0${e.to}`;
const moveKey = (n: Node): string => `${n.kind}\0${n.name}\0${n.package}`;

function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    out.set(k, [...(out.get(k) ?? []), item]);
  }
  return out;
}

/**
 * Compares two valid graphs (docs/schema.md section 13). Every list in the
 * result is sorted, so the output does not depend on the order of the inputs
 * or on map iteration order.
 */
export function diffGraphs(base: GraphFile, head: GraphFile): DiffFile {
  if (base.schemaVersion !== head.schemaVersion) {
    throw new DiffError(
      `cannot diff schemaVersion ${base.schemaVersion} against ${head.schemaVersion}`,
    );
  }

  const baseNodes = new Map(base.nodes.map((n) => [n.id, n]));
  const headNodes = new Map(head.nodes.map((n) => [n.id, n]));
  let added = head.nodes.filter((n) => !baseNodes.has(n.id));
  let removed = base.nodes.filter((n) => !headNodes.has(n.id));
  const changed = head.nodes.flatMap((after) => {
    const before = baseNodes.get(after.id);
    return before && nodeChanged(before, after) ? [{ before, after }] : [];
  });

  // Section 5.4. Only a one-to-one match is a move: with several candidates the
  // pairing would be a guess.
  const addedBy = groupBy(added, moveKey);
  const removedBy = groupBy(removed, moveKey);
  const moved: { from: Node; to: Node }[] = [];
  for (const [key, [from, ...restFrom]] of removedBy) {
    const to = addedBy.get(key);
    if (from && restFrom.length === 0 && to?.length === 1 && to[0]) {
      moved.push({ from, to: to[0] });
    }
  }
  const movedIds = new Set(moved.flatMap((m) => [m.from.id, m.to.id]));
  added = added.filter((n) => !movedIds.has(n.id));
  removed = removed.filter((n) => !movedIds.has(n.id));

  const baseEdges = new Map(base.edges.map((e) => [edgeKey(e), e]));
  const headEdges = new Map(head.edges.map((e) => [edgeKey(e), e]));

  const net = (kind: string): number =>
    added.filter((n) => n.kind === kind).length -
    removed.filter((n) => n.kind === kind).length;

  return {
    schemaVersion: head.schemaVersion,
    base: { ...(base.repo.commit && { commit: base.repo.commit }) },
    head: { ...(head.repo.commit && { commit: head.repo.commit }) },
    summary: { modules: net("module"), routes: net("route") },
    nodes: {
      added: added.sort(compareNodes),
      removed: removed.sort(compareNodes),
      changed: changed.sort((a, b) => compareNodes(a.after, b.after)),
      moved: moved.sort((a, b) => compareNodes(a.to, b.to)),
    },
    edges: {
      added: head.edges
        .filter((e) => !baseEdges.has(edgeKey(e)))
        .sort(compareEdges),
      removed: base.edges
        .filter((e) => !headEdges.has(edgeKey(e)))
        .sort(compareEdges),
      changed: head.edges
        .flatMap((after) => {
          const before = baseEdges.get(edgeKey(after));
          return before && edgeChanged(before, after)
            ? [{ before, after }]
            : [];
        })
        .sort((a, b) => compareEdges(a.after, b.after)),
    },
  };
}
