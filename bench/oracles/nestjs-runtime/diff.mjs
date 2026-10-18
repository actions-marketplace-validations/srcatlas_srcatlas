// Compares an oracle graph (run.mjs) with another graph file by the rule of docs/accuracy.md section 1:
// nodes by (id, kind), edges by (from, kind, to). Only what the oracle covers is compared.
// Usage: node diff.mjs <oracle.graph.json> <other.graph.json>
// Exit code 0 when equal on the covered part, 1 otherwise. This is a check, not the scorer.
import fs from "node:fs";

const [oraclePath, otherPath] = process.argv.slice(2);
if (!otherPath) {
  console.error("usage: diff.mjs <oracle.graph.json> <other.graph.json>");
  process.exit(2);
}
const NODES = new Set(["module", "provider", "controller"]);
const EDGES = new Set(["imports", "contains", "injects"]);
const load = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const keys = (g) => ({
  nodes: new Set(g.nodes.filter((n) => NODES.has(n.kind)).map((n) => `${n.kind} ${n.id}`)),
  edges: new Set(g.edges.filter((e) => EDGES.has(e.kind)).map((e) => `${e.from} -${e.kind}-> ${e.to}`)),
});
const a = keys(load(oraclePath));
const b = keys(load(otherPath));
const only = (x, y) => [...x].filter((k) => !y.has(k)).sort();
const result = {
  nodesOnlyInOracle: only(a.nodes, b.nodes),
  nodesOnlyInOther: only(b.nodes, a.nodes),
  edgesOnlyInOracle: only(a.edges, b.edges),
  edgesOnlyInOther: only(b.edges, a.edges),
};
console.log(JSON.stringify(result, null, 2));
process.exit(Object.values(result).every((l) => l.length === 0) ? 0 : 1);
