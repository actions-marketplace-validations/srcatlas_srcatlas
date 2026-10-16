import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  GraphBuildError,
  GraphBuilder,
  GraphValidationError,
} from "./builder.js";
import type { Edge, GraphFile, Node } from "./schema.js";
import { validateGraph } from "./validate.js";

const doc = readFileSync(
  new URL("../../../docs/schema.md", import.meta.url),
  "utf8",
);
const example = JSON.parse(
  /```json\n([\s\S]*?)\n```/.exec(doc)?.[1] ?? "null",
) as GraphFile;
const fresh = () => structuredClone(example);
const invariants = (g: GraphFile) => [
  ...new Set(validateGraph(g).map((v) => v.invariant)),
];

function rebuild(nodes: Node[], edges: Edge[]): GraphFile {
  const b = new GraphBuilder();
  for (const n of nodes) b.addNode(n);
  for (const e of edges) b.addEdge(e);
  return b.build({
    generatorVersion: example.generator.version,
    ...(example.repo.commit && { commit: example.repo.commit }),
  });
}

describe("validateGraph", () => {
  it("accepts the worked example", () => {
    expect(validateGraph(fresh())).toEqual([]);
  });

  it("1: duplicate id", () => {
    const g = fresh();
    g.nodes.splice(1, 0, structuredClone(g.nodes[0] as Node));
    expect(invariants(g)).toContain(1);
  });
  it("2: dangling edge", () => {
    const g = fresh();
    (g.edges[0] as Edge).to = "provider:api/Nope";
    expect(invariants(g)).toContain(2);
  });
  it("3: edge kind not allowed between endpoint kinds", () => {
    const g = fresh();
    const e = g.edges.find((x) => x.kind === "injects") as Edge;
    e.kind = "handles";
    expect(invariants(g)).toContain(3);
  });
  it("3: unknown edge kinds are generic and pass", () => {
    const g = fresh();
    (g.edges[0] as Edge).kind = "future_kind";
    g.edges.sort((a, b) =>
      a.from + a.kind + a.to < b.from + b.kind + b.to ? -1 : 1,
    );
    expect(invariants(g)).not.toContain(3);
  });
  it("4: package and module must point at the right kinds", () => {
    const g = fresh();
    const n = g.nodes.find((x) => x.kind === "provider") as Node;
    n.package = n.id;
    n.module = n.id;
    expect(validateGraph(g).filter((v) => v.invariant === 4)).toHaveLength(2);
  });
  it("5: self-edge", () => {
    const g = fresh();
    (g.edges[0] as Edge).to = (g.edges[0] as Edge).from;
    expect(invariants(g)).toContain(5);
  });
  it("6: missing required meta", () => {
    const g = fresh();
    (g.nodes.find((x) => x.kind === "provider") as Node).meta = {};
    expect(invariants(g)).toContain(6);
  });
  it.each([
    "/abs/x.ts",
    "../x.ts",
    "a/../x.ts",
    "./x.ts",
    "a\\b.ts",
    "C:/x.ts",
    "",
  ])("7: bad path %j", (file) => {
    const g = fresh();
    const n = g.nodes.find((x) => x.source) as Node;
    n.source = { file, line: 1 };
    expect(invariants(g)).toContain(7);
  });
  it("8: empty extractor", () => {
    const g = fresh();
    (g.edges[0] as Edge).extractor = "";
    expect(invariants(g)).toContain(8);
  });
  it("9: order", () => {
    const g = fresh();
    g.nodes.reverse();
    expect(invariants(g)).toContain(9);
    const h = fresh();
    h.edges.reverse();
    expect(invariants(h)).toContain(9);
  });
  it("10: duplicate edge", () => {
    const g = fresh();
    g.edges.splice(1, 0, structuredClone(g.edges[0] as Edge));
    expect(invariants(g)).toContain(10);
  });
});

describe("GraphBuilder", () => {
  it("reproduces the worked example from shuffled input", () => {
    const rev = <T>(a: T[]) => [...a].reverse();
    expect(rebuild(rev(example.nodes), rev(example.edges))).toEqual(example);
  });

  it("sorts by code unit, not locale", () => {
    const g = fresh();
    const base = g.nodes.find((x) => x.kind === "model") as Node;
    const mk = (id: string) => ({ ...structuredClone(base), id });
    const nodes = [
      ...g.nodes,
      mk("model:api/b"),
      mk("model:api/B"),
      mk("model:api/a"),
    ];
    const ids = rebuild(nodes, g.edges).nodes.map((n) => n.id);
    expect(ids.indexOf("model:api/B")).toBeLessThan(ids.indexOf("model:api/a"));
    expect(ids.indexOf("model:api/a")).toBeLessThan(ids.indexOf("model:api/b"));
  });

  it("merges repeated edges: sites, array meta, least confidence", () => {
    const g = fresh();
    const base = g.edges.find((e) => e.kind === "calls") as Edge;
    const a: Edge = {
      ...base,
      sites: [{ file: "b.ts", line: 2 }],
      meta: { methods: ["z"] },
      confidence: "certain",
    };
    const b: Edge = {
      ...base,
      sites: [
        { file: "a.ts", line: 9 },
        { file: "b.ts", line: 2 },
      ],
      meta: { methods: ["a", "z"] },
      confidence: "inferred",
    };
    const others = g.edges.filter((e) => e !== base);
    for (const order of [
      [a, b],
      [b, a],
    ]) {
      const out = rebuild(g.nodes, [...others, ...order]).edges.find(
        (e) => e.kind === "calls" && e.from === base.from && e.to === base.to,
      );
      expect(out?.sites).toEqual([
        { file: "a.ts", line: 9 },
        { file: "b.ts", line: 2 },
      ]);
      expect(out?.meta).toEqual({ methods: ["a", "z"] });
      expect(out?.confidence).toBe("inferred");
    }
  });

  it("rejects conflicting scalar meta", () => {
    const g = fresh();
    const base = g.edges[0] as Edge;
    const b = new GraphBuilder();
    b.addEdge({ ...base, meta: { x: 1 } });
    expect(() => b.addEdge({ ...base, meta: { x: 2 } })).toThrow(
      GraphBuildError,
    );
  });

  it("rejects a malformed node on add", () => {
    const b = new GraphBuilder();
    const bad = {
      ...(example.nodes.find((n) => n.kind === "provider") as Node),
      meta: {},
    };
    expect(() => b.addNode(bad)).toThrow(GraphBuildError);
  });

  it("build() throws on duplicate ids (two same-named classes in one directory)", () => {
    const b = new GraphBuilder();
    for (const n of example.nodes) b.addNode(n);
    b.addNode(structuredClone(example.nodes[0] as Node));
    expect(() => b.build({ generatorVersion: "0.0.0" })).toThrow(
      GraphValidationError,
    );
  });

  it("omits repo.commit when absent", () => {
    const b = new GraphBuilder();
    for (const n of example.nodes) b.addNode(n);
    expect(b.build({ generatorVersion: "0.0.0" }).repo).toEqual({});
  });
});
