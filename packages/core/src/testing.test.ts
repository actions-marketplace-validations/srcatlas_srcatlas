import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GraphBuilder } from "./builder.js";
import type { GraphFile } from "./schema.js";
import {
  analyzeTwice,
  fixturePath,
  goldenPair,
  loadGolden,
} from "./testing.js";

// Stand-in analyser: reads only package.json under `root`. It exists to test
// the harness, not any extractor.
function stubAnalyze(root: string): GraphFile {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    name: string;
    version: string;
  };
  const b = new GraphBuilder();
  b.addNode({
    id: `package:${pkg.name}`,
    kind: "package",
    name: pkg.name,
    language: "typescript",
    framework: "none",
    package: `package:${pkg.name}`,
    module: null,
    source: { file: "package.json", line: 1 },
    extractor: "harness-test",
    confidence: "certain",
    meta: { root: ".", version: pkg.version },
  });
  return b.build({ generatorVersion: "0.0.0" });
}

const dir = fixturePath("harness-basic");

describe("golden harness", () => {
  it("matches the hand-written golden file", () => {
    const { expected, actual } = goldenPair(dir, stubAnalyze(dir));
    expect(actual).toBe(expected);
  });

  it("detects a differing graph", () => {
    const wrong = stubAnalyze(dir);
    wrong.nodes[0] = {
      ...wrong.nodes[0],
      name: "other",
    } as GraphFile["nodes"][number];
    const { expected, actual } = goldenPair(dir, wrong);
    expect(actual).not.toBe(expected);
  });

  it("rejects a golden file that breaks an invariant", () => {
    expect(() => loadGolden(fixturePath("harness-bad"))).toThrow(/invariants/);
  });

  it("is byte-identical when analysed from two different locations", async () => {
    const [a, b] = await analyzeTwice(dir, stubAnalyze);
    expect(a).toBe(b);
  });

  it("catches location-dependent output", async () => {
    const leaky = (root: string): GraphFile => {
      const g = stubAnalyze(root);
      g.nodes[0] = { ...g.nodes[0], name: root } as GraphFile["nodes"][number];
      return g;
    };
    const [a, b] = await analyzeTwice(dir, leaky);
    expect(a).not.toBe(b);
  });
});
