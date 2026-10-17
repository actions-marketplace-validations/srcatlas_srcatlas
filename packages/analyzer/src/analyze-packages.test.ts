import { fixturePath } from "@srcatlas/core/testing";
import { describe, expect, it } from "vitest";
import { analyzePackages } from "./analyze-packages.js";
import { discoverPackages } from "./discover-packages.js";
import type { PackageResult } from "./run-package.js";

const root = fixturePath("analyzer-pnpm");
const { packages } = discoverPackages(root);

const done = (name: string): PackageResult => ({
  package: name,
  nodes: [],
  edges: [],
  facts: [],
  report: [],
  timings: {},
});

describe("analyzePackages", () => {
  it("returns one result per package, sorted by package name", async () => {
    const out = await analyzePackages(root, [...packages].reverse(), {
      run: async (task) => done(task.package.name),
    });
    expect(out.map((r) => r.package)).toEqual(["@acme/api", "@acme/shared"]);
  });

  it("turns a crashed package into core.package-failed and still returns the others", async () => {
    const out = await analyzePackages(root, packages, {
      run: async (task) => {
        if (task.package.name === "@acme/api") throw new Error("worker died");
        return done(task.package.name);
      },
    });
    expect(out.map((r) => r.package)).toEqual(["@acme/api", "@acme/shared"]);
    expect(out[0]?.report).toEqual([
      expect.objectContaining({
        level: "error",
        code: "core.package-failed",
        extractor: "core",
        message: expect.stringContaining("worker died"),
      }),
    ]);
    expect(out[1]?.report).toEqual([]);
  });
});
