import { ModuleResolutionKind, Project, ScriptTarget } from "ts-morph";
import { describe, expect, it } from "vitest";
import { nestjsExtractor } from "./extractor.js";

// Behaviour that the golden fixtures do not cover: N-M7 as the module pattern needs it, detection.

function run(text: string) {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      target: ScriptTarget.ES2022,
      moduleResolution: ModuleResolutionKind.Bundler,
    },
  });
  project.createSourceFile("/src/m.ts", text);
  return nestjsExtractor.extract({
    root: "/",
    package: { name: "p", root: ".", tsconfig: null, files: ["src/m.ts"] },
    project,
    relative: (path) => path.replace(/^\//, ""),
  }) as import("@srcatlas/core").ExtractorResult;
}

const HEAD = "import { Module } from '@nestjs/common';\n";

describe("nestjs extractor", () => {
  it("an imports item that cannot be evaluated: no edge, module unresolved, warning at its site", () => {
    const out = run(`${HEAD}
declare function pick(): unknown;
@Module({ imports: [pick()] })
export class A {}
`);
    expect(out.edges).toEqual([]);
    expect(out.nodes[0]?.confidence).toBe("unresolved");
    expect(out.report).toEqual([
      expect.objectContaining({
        code: "nest.unresolved-dynamic-module",
        level: "warning",
        site: { file: "src/m.ts", line: 4 },
      }),
    ]);
  });

  it("a class in imports that is not a module gives no edge and no report", () => {
    const out = run(`${HEAD}
class Plain {}
@Module({ imports: [Plain] })
export class A {}
`);
    expect(out.edges).toEqual([]);
    expect(out.report).toEqual([]);
    expect(out.nodes[0]?.confidence).toBe("certain");
  });

  it("same-named modules in different directories get the directory suffix on both (schema 5.2)", () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile(
      "/src/a/x.ts",
      `${HEAD}@Module({}) export class Dup {}`,
    );
    project.createSourceFile(
      "/src/b/x.ts",
      `${HEAD}@Module({}) export class Dup {}`,
    );
    const out = nestjsExtractor.extract({
      root: "/",
      package: { name: "p", root: ".", tsconfig: null, files: [] },
      project,
      relative: (path) => path.replace(/^\//, ""),
    }) as import("@srcatlas/core").ExtractorResult;
    expect(out.nodes.map((n) => n.id)).toEqual([
      "module:p/Dup@src/a",
      "module:p/Dup@src/b",
    ]);
  });

  it("detects NestJS from @nestjs/core or @nestjs/common in any dependency field", () => {
    expect(
      nestjsExtractor.detect({ dependencies: { "@nestjs/core": "1" } }),
    ).toBe(true);
    expect(
      nestjsExtractor.detect({ devDependencies: { "@nestjs/common": "1" } }),
    ).toBe(true);
    expect(
      nestjsExtractor.detect({ peerDependencies: { "@nestjs/common": "1" } }),
    ).toBe(true);
    expect(nestjsExtractor.detect({ dependencies: { express: "1" } })).toBe(
      false,
    );
    expect(nestjsExtractor.detect(null)).toBe(false);
  });
});
