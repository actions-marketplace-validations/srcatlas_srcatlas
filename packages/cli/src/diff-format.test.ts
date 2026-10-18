import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DiffFile } from "@srcatlas/core";
import { fixturePath } from "@srcatlas/core/testing";
import { describe, expect, it } from "vitest";
import { formatMarkdown } from "./diff-format.js";

const read = (fixture: string, file: string): string =>
  readFileSync(join(fixturePath(fixture), file), "utf8");
const diffOf = (fixture: string, file: string): DiffFile =>
  DiffFile.parse(JSON.parse(read(fixture, file)));

// docs/cli.md 3.4.2: names from analysed code are untrusted. The expected text is hand-written.
describe("formatMarkdown", () => {
  it("shows hostile names only in code spans and the Mermaid block", () => {
    const md = formatMarkdown(diffOf("mermaid-hostile", "input.diff.json"), 40);
    expect(md).toBe(read("mermaid-hostile", "expected.markdown.md"));
    // The only fence is the one around the Mermaid block.
    expect(md.match(/^```/gm)).toHaveLength(2);
  });

  it("caps each list at 50 items and says how many are left", () => {
    const d = diffOf("diff-cross-module", "expected.diff.json");
    const edge = d.crossModuleEdges[0];
    if (!edge) throw new Error("fixture has a cross-module edge");
    const many = Array.from({ length: 63 }, (_, i) => ({
      ...edge,
      to: `provider:api/T${String(i).padStart(2, "0")}`,
    }));
    const cycles = Array.from({ length: 52 }, (_, i) => ({
      kind: "modules" as const,
      members: [`module:api/A${i}`, `module:api/B${i}`],
    }));
    const md = formatMarkdown({ ...d, crossModuleEdges: many, cycles }, 40);
    const section = (title: string) =>
      md.split(`${title}\n\n`)[1]?.split("\n\n")[0]?.split("\n") ?? [];
    const edges = section("New cross-module edges:");
    expect(edges).toHaveLength(51);
    expect(edges.at(-1)).toBe("- and 13 more");
    const cyc = section("New cycles:");
    expect(cyc).toHaveLength(51);
    expect(cyc.at(-1)).toBe("- and 2 more");
  });

  it("a list of exactly 50 has no 'and more' line", () => {
    const d = diffOf("diff-cross-module", "expected.diff.json");
    const edge = d.crossModuleEdges[0];
    if (!edge) throw new Error("fixture has a cross-module edge");
    const fifty = Array.from({ length: 50 }, (_, i) => ({
      ...edge,
      to: `provider:api/T${i}`,
    }));
    const md = formatMarkdown({ ...d, crossModuleEdges: fifty }, 40);
    expect(md).not.toContain("and 0 more");
    expect(md).not.toMatch(/- and \d+ more/);
  });
});
