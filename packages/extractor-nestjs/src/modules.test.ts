import { ModuleResolutionKind, Project, ScriptTarget } from "ts-morph";
import { describe, expect, it } from "vitest";
import { readModules } from "./modules.js";

// N-M2 and the registration model that the provider and controller patterns build their
// `contains` and `exports` edges from. Sources are in memory.

const ctx = { relative: (p: string) => p.replace(/^\//, "") };

function modulesIn(text: string, extra: Record<string, string> = {}) {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      target: ScriptTarget.ES2022,
      moduleResolution: ModuleResolutionKind.Bundler,
    },
  });
  for (const [path, src] of Object.entries(extra))
    project.createSourceFile(path, src);
  project.createSourceFile("/src/m.ts", text);
  return readModules(project, ctx);
}

const refs = (list: ReturnType<typeof modulesIn>[number]["providers"]) =>
  list.map((r) => [
    r.result.kind === "class" ? r.result.name : r.result.kind,
    r.site.line,
  ]);

const NEST = "import { Module, Global } from '@nestjs/common';\n";

describe("readModules", () => {
  it("N-M1: reads the four metadata arrays with the line of each element", () => {
    const [m] = modulesIn(`${NEST}
class A {} class B {} class C {} class D {}
@Module({
  imports: [A],
  controllers: [B],
  providers: [C],
  exports: [D],
})
export class M {}
`);
    expect(m?.name).toBe("M");
    expect(m?.line).toBe(4);
    expect(refs(m?.imports ?? [])).toEqual([["A", 5]]);
    expect(refs(m?.controllers ?? [])).toEqual([["B", 6]]);
    expect(refs(m?.providers ?? [])).toEqual([["C", 7]]);
    expect(refs(m?.exports ?? [])).toEqual([["D", 8]]);
  });

  it("N-M2: items that come from a spread have the spread expression as their site", () => {
    const [m] = modulesIn(`${NEST}
class L {} class K {} class O {}
const SHARED = [L, K];
@Module({
  providers: [
    ...SHARED,
    O,
  ],
})
export class M {}
`);
    expect(refs(m?.providers ?? [])).toEqual([
      ["L", 7],
      ["K", 7],
      ["O", 8],
    ]);
  });

  it("N-M1 notes: a non-literal argument is evaluated; one that cannot be is reported as unresolved", () => {
    const [a, b] = modulesIn(`${NEST}
class A {}
const META = { providers: [A] };
declare const OTHER: object;
@Module(META)
export class WithConst {}
@Module(OTHER)
export class WithUnknown {}
`);
    expect(refs(a?.providers ?? [])).toEqual([["A", 4]]);
    expect(a?.unresolved).toBe(false);
    expect(b?.unresolved).toBe(true);
  });

  it("N-M4: global comes from @Global() imported from @nestjs/common only", () => {
    const [real, local] = modulesIn(`${NEST}
function Fake(): ClassDecorator { return () => undefined; }
@Global()
@Module({})
export class Real {}
@Fake()
@Module({})
export class NotGlobal {}
`);
    expect(real?.global).toBe(true);
    expect(real?.line).toBe(4);
    expect(local?.global).toBe(false);
  });

  it("decoys: @Module from another library or defined locally is not a module", () => {
    const found = modulesIn(
      `import { Module as ForeignModule } from 'some-other-lib';
function Module(_m: object) { return (t: unknown) => t; }
@Module({})
export class Local {}
@ForeignModule({})
export class Foreign {}
`,
    );
    expect(found).toEqual([]);
  });

  it("matches @Module by import origin when renamed or imported through a barrel", () => {
    const found = modulesIn(
      `import { Module as NestModule } from '@nestjs/common';
import { Module } from './barrel';
@NestModule({}) export class Renamed {}
@Module({}) export class ViaBarrel {}
`,
      { "/src/barrel.ts": "export { Module } from '@nestjs/common';" },
    );
    expect(found.map((m) => m.name)).toEqual(["Renamed", "ViaBarrel"]);
  });
});
