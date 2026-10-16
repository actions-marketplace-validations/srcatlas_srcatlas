import { type Edge, type GraphFile, Node, SCHEMA_VERSION } from "./schema.js";
import { type Json, sortKeys } from "./serialize.js";
import {
  cmp,
  compareEdges,
  compareNodes,
  compareSites,
  type Violation,
  validateGraph,
} from "./validate.js";

/** A node or edge handed to the builder is malformed, or two edges disagree. A programmer mistake. */
export class GraphBuildError extends Error {}

/** `build()` found violations of docs/schema.md section 10. */
export class GraphValidationError extends Error {
  constructor(readonly violations: Violation[]) {
    super(
      `graph violates ${violations.length} invariant(s):\n${violations
        .map((x) => `  [${x.invariant}] ${x.message}`)
        .join("\n")}`,
    );
  }
}

const RANK = { certain: 2, inferred: 1, unresolved: 0 } as const;

function mergeMeta(
  a: Edge["meta"],
  b: Edge["meta"],
  label: string,
): Edge["meta"] {
  const out: Edge["meta"] = {};
  for (const k of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort(
    cmp,
  )) {
    const [x, y] = [a[k], b[k]];
    if (x === undefined || y === undefined) out[k] = (x ?? y) as Json;
    else if (Array.isArray(x) && Array.isArray(y)) {
      // Union of strings, sorted and de-duplicated (section 6).
      out[k] = [...new Set([...x, ...y].map((i) => JSON.stringify(i)))]
        .sort(cmp)
        .map((i) => JSON.parse(i) as Json);
    } else if (JSON.stringify(sortKeys(x)) === JSON.stringify(sortKeys(y)))
      out[k] = x;
    else throw new GraphBuildError(`${label}: conflicting meta.${k}`);
  }
  return out;
}

/**
 * The only way to create a graph. Merges repeated edge observations, writes
 * canonical order, and refuses to return a graph that breaks section 10.
 * Insertion order never affects the result.
 */
export class GraphBuilder {
  #nodes: Node[] = [];
  #edges = new Map<string, Edge>();

  addNode(node: Node): void {
    const r = Node.safeParse(node);
    if (!r.success)
      throw new GraphBuildError(`invalid node ${node.id}: ${r.error.message}`);
    // Duplicate ids are kept so that build() reports them (invariant 1).
    this.#nodes.push({
      ...r.data,
      meta: sortKeys(r.data.meta as Json),
    } as Node);
  }

  /** The same `(from, kind, to)` merges: sites unioned, array meta unioned, least confidence wins. */
  addEdge(edge: Edge): void {
    const label = `${edge.from} -${edge.kind}-> ${edge.to}`;
    const key = `${edge.from}\0${edge.kind}\0${edge.to}`;
    const prev = this.#edges.get(key);
    if (!prev) {
      this.#edges.set(key, {
        ...edge,
        sites: [...edge.sites],
        meta: sortKeys(edge.meta) as Edge["meta"],
      });
      return;
    }
    this.#edges.set(key, {
      ...prev,
      sites: [...prev.sites, ...edge.sites],
      // Smaller name wins so the result does not depend on insertion order.
      extractor:
        cmp(prev.extractor, edge.extractor) <= 0
          ? prev.extractor
          : edge.extractor,
      confidence:
        RANK[prev.confidence] <= RANK[edge.confidence]
          ? prev.confidence
          : edge.confidence,
      meta: mergeMeta(prev.meta, edge.meta, label),
    });
  }

  build(opts: { generatorVersion: string; commit?: string }): GraphFile {
    const edges = [...this.#edges.values()].map((e) => {
      const sites = [
        ...new Map(e.sites.map((s) => [`${s.file}\0${s.line}`, s])).values(),
      ].sort(compareSites);
      return { ...e, sites };
    });
    const graph: GraphFile = {
      schemaVersion: SCHEMA_VERSION,
      generator: { name: "srcatlas", version: opts.generatorVersion },
      repo: opts.commit === undefined ? {} : { commit: opts.commit },
      nodes: [...this.#nodes].sort(compareNodes),
      edges: edges.sort(compareEdges),
    };
    const violations = validateGraph(graph);
    if (violations.length > 0) throw new GraphValidationError(violations);
    return graph;
  }
}
