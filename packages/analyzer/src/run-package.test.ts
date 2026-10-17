import type { Extractor, Fact } from "@srcatlas/core";
import { fixturePath } from "@srcatlas/core/testing";
import type { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import { discoverPackages } from "./discover-packages.js";
import { runPackage } from "./run-package.js";

const root = fixturePath("analyzer-parse-error");
const pkg = discoverPackages(root).packages[0];
if (!pkg) throw new Error("fixture package missing");

const fact: Fact = {
  kind: "access",
  extractor: "prisma",
  package: "broken",
  callerFile: "src/ok.ts",
  callerName: "A",
  delegate: "order",
  operation: "findMany",
  site: { file: "src/ok.ts", line: 1 },
  proof: "type",
};

const fake = (
  name: string,
  extract: Extractor<Project>["extract"],
): Extractor<Project> => ({ name, detect: () => true, extract });

const empty = { nodes: [], edges: [], facts: [], report: [] };

describe("runPackage", () => {
  it("skips a file that does not parse and reports core.parse-error", async () => {
    let seen: string[] = [];
    const spy = fake("spy", (ctx) => {
      seen = ctx.project
        .getSourceFiles()
        .map((f) => ctx.relative(f.getFilePath()));
      return empty;
    });
    const result = await runPackage(
      { root, package: pkg, extractors: ["spy"] },
      [spy],
    );
    expect(seen).toEqual(["src/ok.ts"]);
    expect(result.report).toEqual([
      expect.objectContaining({
        level: "error",
        code: "core.parse-error",
        extractor: "core",
        site: { file: "src/broken.ts", line: 1 },
      }),
    ]);
  });

  it("keeps other extractors' output when one throws", async () => {
    const good = fake("good", () => ({ ...empty, facts: [fact] }));
    const bad = fake("bad", () => {
      throw new Error("kaput");
    });
    const result = await runPackage(
      { root, package: pkg, extractors: ["bad", "good"] },
      [bad, good],
    );
    expect(result.facts).toEqual([fact]);
    expect(result.report).toContainEqual(
      expect.objectContaining({
        level: "error",
        code: "core.extractor-failed",
        extractor: "bad",
        message: expect.stringContaining("kaput"),
      }),
    );
  });

  it("passes through extractor report entries and records a timing per extractor", async () => {
    const entry = {
      level: "info" as const,
      code: "x.note",
      message: "m",
      extractor: "noisy",
    };
    const noisy = fake("noisy", async () => ({ ...empty, report: [entry] }));
    const result = await runPackage(
      { root, package: pkg, extractors: ["noisy"] },
      [noisy],
    );
    expect(result.report).toContainEqual(entry);
    expect(typeof result.timings.noisy).toBe("number");
  });

  it("warns about a requested extractor that is not available", async () => {
    const result = await runPackage(
      { root, package: pkg, extractors: ["nestjs"] },
      [],
    );
    expect(result.report).toContainEqual(
      expect.objectContaining({
        level: "warning",
        code: "core.unknown-extractor",
        message: expect.stringContaining("nestjs"),
      }),
    );
  });
});
