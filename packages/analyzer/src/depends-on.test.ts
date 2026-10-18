import { analyzeTwice, fixturePath, goldenPair } from "@srcatlas/core/testing";
import { describe, expect, it } from "vitest";
import { analyzeRepo } from "./analyze-repo.js";
import { builtinExtractors } from "./registry.js";
import { runPackage } from "./run-package.js";

// docs/schema.md 6.1: `depends_on` means a package imports another workspace package.
// Fixture analyzer-depends-on, by package:
//   @acme/web  imports @acme/api by name with a subpath, and @acme/ui by name (an
//              import, a type import and `export *`: one edge, sites at lines 2 and 8).
//              Decoys that must give no edge: `lodash` (not a workspace package),
//              `@acme/api-client` (shares a prefix with @acme/api), `./util` (same package).
//   @acme/api  imports @acme/shared through a tsconfig path alias, and `./client` (same package).
const run = (task: Parameters<typeof runPackage>[0]) =>
  runPackage(task, builtinExtractors);

const analyze = (root: string) =>
  analyzeRepo(root, {}, { generatorVersion: "0.0.0", run });

describe("analyzer-depends-on", () => {
  const dir = fixturePath("analyzer-depends-on");

  it("matches the hand-written golden graph", async () => {
    const { graph } = await analyze(dir);
    const { expected, actual } = goldenPair(dir, graph);
    expect(actual).toBe(expected);
  });

  it("reports nothing for the decoys", async () => {
    const { report } = await analyze(dir);
    expect(report.entries).toEqual([]);
  });

  it("is byte-identical when analysed from different directories", async () => {
    const [a, b] = await analyzeTwice(
      dir,
      async (root) => (await analyze(root)).graph,
    );
    expect(a).toBe(b);
  });
});
