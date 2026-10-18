// First piece of the scorer of docs/accuracy.md section 6: compares an actual graph with a
// ground-truth graph by exact ids (section 1). Deterministic, no network.
// Usage: node score.mjs <truth.graph.json> <actual.graph.json> [--package <name>]
//          [--nodes module,provider,controller] [--edges imports,contains,injects]
// Prints JSON. A ratio with an empty denominator is null, never 1.
import fs from "node:fs";
import { pathToFileURL } from "node:url";

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const ratio = (n, d) => (d === 0 ? null : +(n / d).toFixed(4));

const nodeKey = (n) => `${n.kind} ${n.id}`;
const edgeKey = (e) => `${e.from} -${e.kind}-> ${e.to}`;

/** Elements of `graph` inside the scope: kinds listed, and (when given) the package. */
function scoped(graph, { package: pkg, nodes, edges }) {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const inPackage = (id) => pkg === undefined || byId.get(id)?.package === `package:${pkg}`;
  return [
    ...graph.nodes
      .filter((n) => nodes.includes(n.kind) && inPackage(n.id))
      .map((n) => ({ kind: n.kind, key: nodeKey(n), confidence: n.confidence })),
    ...graph.edges
      .filter((e) => edges.includes(e.kind) && inPackage(e.from))
      .map((e) => ({ kind: e.kind, key: edgeKey(e), confidence: e.confidence })),
  ];
}

function compare(truth, actual) {
  const want = new Set(truth.map((t) => t.key));
  const have = new Set(actual.map((a) => a.key));
  const correct = [...have].filter((k) => want.has(k));
  const missing = [...want].filter((k) => !have.has(k)).sort(cmp);
  const extra = [...have].filter((k) => !want.has(k)).sort(cmp);
  return {
    truth: want.size,
    emitted: have.size,
    correct: correct.length,
    precision: ratio(correct.length, have.size),
    recall: ratio(correct.length, want.size),
    missing,
    extra,
  };
}

/**
 * `all` counts every emitted element; `certainOnly` counts only those with confidence `certain`
 * (the headline form of accuracy.md section 4), against the same truth.
 */
export function score(truthGraph, actualGraph, opts = {}) {
  const scope = {
    package: opts.package,
    nodes: opts.nodes ?? ["module", "provider", "controller"],
    edges: opts.edges ?? ["imports", "contains", "injects"],
  };
  const truth = scoped(truthGraph, scope);
  const actual = scoped(actualGraph, scope);
  const kinds = [...new Set(truth.concat(actual).map((x) => x.kind))].sort(cmp);
  const run = (items) => ({
    total: compare(truth, items),
    byKind: Object.fromEntries(
      kinds.map((k) => [k, compare(truth.filter((t) => t.kind === k), items.filter((a) => a.kind === k))]),
    ),
  });
  return {
    scope,
    all: run(actual),
    certainOnly: run(actual.filter((a) => a.confidence === "certain")),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const flag = (name) => {
    const i = argv.indexOf(name);
    return i < 0 ? undefined : argv.splice(i, 2)[1];
  };
  const pkg = flag("--package");
  const nodes = flag("--nodes")?.split(",");
  const edges = flag("--edges")?.split(",");
  const [truthPath, actualPath] = argv;
  if (!actualPath) {
    console.error("usage: score.mjs <truth.graph.json> <actual.graph.json> [--package name] [--nodes a,b] [--edges a,b]");
    process.exit(2);
  }
  const load = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
  const result = score(load(truthPath), load(actualPath), { package: pkg, nodes, edges });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
