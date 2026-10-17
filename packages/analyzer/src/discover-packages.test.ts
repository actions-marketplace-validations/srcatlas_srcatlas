import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fixturePath } from "@srcatlas/core/testing";
import { describe, expect, it } from "vitest";
import { createProject } from "./create-project.js";
import {
  DuplicatePackageNameError,
  discoverPackages,
} from "./discover-packages.js";

const golden = (fixture: string, file = "expected.packages.json"): unknown =>
  JSON.parse(readFileSync(join(fixturePath(fixture), file), "utf8"));

describe("discoverPackages", () => {
  it("treats the root as the single package and applies default excludes", () => {
    const root = fixturePath("analyzer-single");
    expect(discoverPackages(root)).toEqual(golden("analyzer-single"));
  });

  it("re-includes test files with analysis.includeTests", () => {
    const root = fixturePath("analyzer-single");
    const result = discoverPackages(root, { analysis: { includeTests: true } });
    expect(result).toEqual(
      golden("analyzer-single", "expected.with-tests.packages.json"),
    );
  });

  it("reads pnpm-workspace.yaml, keeps the scope, falls back to tsconfig.base.json", () => {
    const root = fixturePath("analyzer-pnpm");
    expect(discoverPackages(root)).toEqual(golden("analyzer-pnpm"));
  });

  it("reads package.json#workspaces and works without a tsconfig", () => {
    const root = fixturePath("analyzer-npm");
    expect(discoverPackages(root)).toEqual(golden("analyzer-npm"));
  });

  it("uses config.packages instead of auto-detection", () => {
    const root = fixturePath("analyzer-pnpm");
    const result = discoverPackages(root, { packages: ["libs/shared"] });
    expect(result).toEqual(
      golden("analyzer-pnpm", "expected.config-packages.json"),
    );
  });

  it("rejects duplicate package names", () => {
    expect(() => discoverPackages(fixturePath("analyzer-dup-names"))).toThrow(
      DuplicatePackageNameError,
    );
  });

  it("skips files over maxFileSizeKb and reports core.file-too-large", () => {
    const root = mkdtempSync(join(tmpdir(), "srcatlas-big-"));
    try {
      writeFileSync(join(root, "package.json"), '{"name":"big"}');
      mkdirSync(join(root, "src"));
      writeFileSync(join(root, "src", "small.ts"), "export {};\n");
      writeFileSync(join(root, "src", "huge.ts"), `// ${"x".repeat(3000)}\n`);
      const { packages, report } = discoverPackages(root, {
        analysis: { maxFileSizeKb: 1 },
      });
      expect(packages[0]?.files).toEqual(["src/small.ts"]);
      expect(report).toEqual([
        { code: "core.file-too-large", file: "src/huge.ts" },
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("is independent of the working directory", () => {
    const root = fixturePath("analyzer-pnpm");
    const here = discoverPackages(root);
    const cwd = process.cwd();
    try {
      process.chdir(tmpdir());
      expect(JSON.stringify(discoverPackages(root))).toBe(JSON.stringify(here));
    } finally {
      process.chdir(cwd);
    }
  });
});

describe("createProject", () => {
  it("resolves tsconfig path aliases and loads only the discovered files", () => {
    const root = fixturePath("analyzer-pnpm");
    const api = discoverPackages(root).packages.find(
      (p) => p.name === "@acme/api",
    );
    if (!api) throw new Error("fixture package @acme/api not found");
    const project = createProject(root, api);
    const paths = project.getSourceFiles().map((f) => f.getFilePath());
    expect(
      paths.filter((p) => p.endsWith("/apps/api/src/main.ts")),
    ).toHaveLength(1);
    const main = project.getSourceFileOrThrow(
      paths.find((p) => p.endsWith("/apps/api/src/main.ts")) ?? "",
    );
    const target = main
      .getImportDeclarations()[0]
      ?.getModuleSpecifierSourceFile();
    expect(target?.getFilePath().endsWith("/libs/shared/src/greet.ts")).toBe(
      true,
    );
  });
});
