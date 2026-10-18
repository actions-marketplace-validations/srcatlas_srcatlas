import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DiffFile,
  GraphFile,
  serializeDiff,
  validateGraph,
} from "@srcatlas/core";
import { fixturePath } from "@srcatlas/core/testing";
import { describe, expect, it } from "vitest";
import { diffGraphs } from "./diff.js";
import { formatSummary } from "./summary.js";

const read = (fixture: string, file: string): unknown =>
  JSON.parse(readFileSync(join(fixturePath(fixture), file), "utf8"));

function load(fixture: string) {
  const base = GraphFile.parse(read(fixture, "base.graph.json"));
  const head = GraphFile.parse(read(fixture, "head.graph.json"));
  for (const g of [base, head]) expect(validateGraph(g)).toEqual([]);
  const expected = DiffFile.parse(read(fixture, "expected.diff.json"));
  return { base, head, expected };
}

// diff-basic: added, removed and changed nodes and edges, plus two decoys
// (a line-only change and a sites-only change) that must report nothing.
// diff-moves: one move (docs/schema.md 5.4) and a same-name node in another
// package that must not become one.
// diff-moves-ambiguous: two removed and two added with one (kind, name,
// package); the differ must not pair them.
describe.each(["diff-basic", "diff-moves", "diff-moves-ambiguous"])(
  "diffGraphs %s",
  (fixture) => {
    it("matches the hand-written diff", () => {
      const { base, head, expected } = load(fixture);
      expect(serializeDiff(diffGraphs(base, head))).toBe(
        serializeDiff(expected),
      );
    });
  },
);

describe("diffGraphs", () => {
  it("diffing a graph with itself is empty", () => {
    const { base } = load("diff-basic");
    const d = diffGraphs(base, base);
    expect(d.nodes).toEqual({ added: [], removed: [], changed: [], moved: [] });
    expect(d.edges).toEqual({ added: [], removed: [], changed: [] });
    expect(d.summary).toEqual({ modules: 0, routes: 0 });
  });

  it("swapping the inputs swaps added and removed", () => {
    const { base, head } = load("diff-basic");
    const fwd = diffGraphs(base, head);
    const rev = diffGraphs(head, base);
    expect(rev.nodes.added).toEqual(fwd.nodes.removed);
    expect(rev.nodes.removed).toEqual(fwd.nodes.added);
    expect(rev.edges.removed).toEqual(fwd.edges.added);
    expect(rev.summary).toEqual({ modules: -1, routes: -1 });
  });

  it("is independent of input order", () => {
    const { base, head } = load("diff-basic");
    const shuffled = (g: GraphFile): GraphFile => ({
      ...g,
      nodes: [...g.nodes].reverse(),
      edges: [...g.edges].reverse(),
    });
    expect(serializeDiff(diffGraphs(shuffled(base), shuffled(head)))).toBe(
      serializeDiff(diffGraphs(base, head)),
    );
  });

  it("refuses graphs with different schema versions", () => {
    const { base, head } = load("diff-basic");
    const future = { ...head, schemaVersion: 2 } as unknown as GraphFile;
    expect(() => diffGraphs(base, future)).toThrow(/schemaVersion/);
  });
});

describe("formatSummary", () => {
  it("renders the fixed line", () => {
    expect(
      formatSummary({
        modules: 1,
        routes: 4,
        crossModuleEdges: 2,
        newCycles: 0,
      }),
    ).toBe("+1 module, +4 routes, +2 cross-module edges, 0 new cycles");
  });
  it("signs net counts and pluralises on the absolute value", () => {
    expect(formatSummary({ modules: 0, routes: -1 })).toBe(
      "0 modules, -1 route",
    );
    expect(formatSummary({ modules: -2, routes: 1 })).toBe(
      "-2 modules, +1 route",
    );
  });
  it("adds the cross-module and cycle segments only when present", () => {
    expect(
      formatSummary({
        modules: 0,
        routes: 0,
        crossModuleEdges: 1,
        newCycles: 1,
      }),
    ).toBe("0 modules, 0 routes, +1 cross-module edge, 1 new cycle");
    expect(formatSummary({ modules: 0, routes: 0, newCycles: 2 })).toBe(
      "0 modules, 0 routes, 2 new cycles",
    );
  });
});
