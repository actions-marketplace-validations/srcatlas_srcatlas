import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DiffFile } from "@srcatlas/core";
import { fixturePath } from "@srcatlas/core/testing";
import { describe, expect, it } from "vitest";
import { renderMermaid } from "./mermaid.js";

const read = (fixture: string, file: string): string =>
  readFileSync(join(fixturePath(fixture), file), "utf8");
const diffOf = (fixture: string, file: string): DiffFile =>
  DiffFile.parse(JSON.parse(read(fixture, file)));

// Inputs are the hand-written diffs of the differ fixtures; the expected text is
// written from docs/cli.md 3.4.1, not from renderer output.
describe("renderMermaid", () => {
  it("draws added, removed, changed and context nodes and the three edge styles", () => {
    expect(renderMermaid(diffOf("diff-basic", "expected.diff.json"))).toBe(
      read("diff-basic", "expected.mermaid.mmd"),
    );
  });

  it("keeps the heaviest nodes under --max-nodes and adds a +N more node", () => {
    expect(
      renderMermaid(diffOf("diff-basic", "expected.diff.json"), {
        maxNodes: 4,
      }),
    ).toBe(read("diff-basic", "expected.mermaid.max4.mmd"));
  });

  it("draws a moved node once, as its new node", () => {
    expect(renderMermaid(diffOf("diff-moves", "expected.diff.json"))).toBe(
      read("diff-moves", "expected.mermaid.mmd"),
    );
  });

  it("escapes characters that Mermaid reads as syntax", () => {
    expect(renderMermaid(diffOf("mermaid-escape", "input.diff.json"))).toBe(
      read("mermaid-escape", "expected.mmd"),
    );
  });

  it("neutralises backticks and line breaks, so a name cannot end the fenced block", () => {
    const text = renderMermaid(diffOf("mermaid-hostile", "input.diff.json"));
    expect(text).toBe(read("mermaid-hostile", "expected.mmd"));
    expect(text).not.toContain("`");
  });

  it("renders nothing for a diff without changes", () => {
    const empty = diffOf("diff-basic", "expected.diff.json");
    empty.nodes = { added: [], removed: [], changed: [], moved: [] };
    empty.edges = { added: [], removed: [], changed: [] };
    expect(renderMermaid(empty)).toBe("");
  });

  it("does not depend on the order of the lists in the diff", () => {
    const d = diffOf("diff-basic", "expected.diff.json");
    const flipped: DiffFile = {
      ...d,
      nodes: { ...d.nodes, added: [...d.nodes.added].reverse() },
      edges: { ...d.edges, added: [...d.edges.added].reverse() },
    };
    expect(renderMermaid(flipped)).toBe(renderMermaid(d));
  });

  it.each([0, -1, 1.5, Number.NaN])("rejects maxNodes %s", (maxNodes) => {
    expect(() =>
      renderMermaid(diffOf("diff-basic", "expected.diff.json"), { maxNodes }),
    ).toThrow(RangeError);
  });
});
