import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const text = readFileSync(
  new URL("../../../action.yml", import.meta.url),
  "utf8",
);
const lines = text.split(/\r?\n/);
// A GitHub expression; built here because Biome flags a placeholder in a plain string.
const expr = (inner: string): string => `\${{ ${inner} }}`;

// The metadata file is not parsed (no YAML dependency); these checks read its text.
describe("action.yml", () => {
  it("is a composite action with a single step that runs the script", () => {
    expect(text).toMatch(/^\s*using:\s*composite\s*$/m);
    expect(lines.filter((l) => /^ {4}- /.test(l))).toHaveLength(1);
    expect(lines.filter((l) => /^\s+run:/.test(l))).toHaveLength(1);
    expect(text).toContain("packages/action/src/run.mjs");
  });

  it("uses no other action, so there is nothing to pin", () => {
    expect(lines.filter((l) => /\buses:/.test(l))).toEqual([]);
  });

  it("reaches inputs only through env, never inside the script line", () => {
    const run = lines.find((l) => /^\s+run:/.test(l)) ?? "";
    const expressions = run.match(/\$\{\{[^}]*\}\}/g) ?? [];
    expect(expressions).toEqual([expr("github.action_path")]);
    for (const input of [
      "version",
      "fail-on",
      "max-nodes",
      "comment",
      "github-token",
    ]) {
      expect(text).toMatch(new RegExp(`^\\s{2}${input}:`, "m"));
      expect(text).toContain(expr(`inputs.${input}`));
    }
  });

  it("defaults: latest, 40 nodes, comments on, the workflow token", () => {
    expect(text).toMatch(/version:[\s\S]*?default:\s*['"]?latest['"]?/);
    expect(text).toMatch(/max-nodes:[\s\S]*?default:\s*['"]?40['"]?/);
    expect(text).toMatch(/comment:[\s\S]*?default:\s*['"]?true['"]?/);
    expect(text).toContain(`default: ${expr("github.token")}`);
  });
});
