import { ModuleResolutionKind, Project, ScriptTarget } from "ts-morph";
import { describe, expect, it } from "vitest";
import { followModuleCall, readModules } from "./modules.js";

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

// N-M5, N-M6 and the call sites that use them (nestjs.md section 4.1).

const DYN = "import { Module, DynamicModule } from '@nestjs/common';\n";

describe("readModules: dynamic modules", () => {
  it("N-M5: dynamic and global come from the returned literal, whose registrations are merged with their lines", () => {
    const [m] = modulesIn(`${DYN}
class S {}
@Module({})
export class D {
  static forRoot(): DynamicModule {
    return {
      module: D,
      providers: [S],
      global: true,
    };
  }
}
`);
    expect(m?.dynamic).toBe(true);
    expect(m?.global).toBe(true);
    expect(refs(m?.providers ?? [])).toEqual([["S", 9]]);
    expect(m?.unresolved).toBe(false);
  });

  it("a static method that is not a module factory leaves the module static", () => {
    const found = modulesIn(`${DYN}
@Module({})
export class A { static describe(): string { return 'x'; } }
@Module({})
export class B { static forRoot() { return { module: A }; } }
@Module({})
export class C { forRoot() { return { module: C }; } }
@Module({})
export class E {
  static forRoot(flag: boolean) {
    if (flag) { return { module: E }; }
    return { module: E, global: true };
  }
}
`);
    expect(found.map((m) => [m.name, m.dynamic, m.global])).toEqual([
      ["A", false, false],
      ["B", false, false],
      ["C", false, false],
      ["E", false, false],
    ]);
  });

  it("follows the returned identifier and up to two helper calls, not three", () => {
    const found = modulesIn(`${DYN}
function one(): DynamicModule { return two(); }
function two(): DynamicModule { return { module: Two, global: true }; }
@Module({}) export class Two { static forRoot() { return one(); } }

function a(): DynamicModule { return b(); }
function b(): DynamicModule { return c(); }
function c(): DynamicModule { return { module: Three }; }
@Module({}) export class Three { static forRoot() { return a(); } }

@Module({})
export class Local {
  static register() { const def = { module: Local, global: true }; return def; }
}
`);
    expect(found.map((m) => [m.name, m.dynamic, m.global])).toEqual([
      ["Two", true, true],
      ["Three", false, false],
      ["Local", true, true],
    ]);
  });

  it("N-M6: a key that cannot be evaluated makes the module unresolved at the expression; the rest is kept", () => {
    const [m] = modulesIn(`${DYN}
class S {}
@Module({})
export class Q {
  static forRootAsync(opts: { imports?: unknown[] }): DynamicModule {
    return {
      module: Q,
      imports: opts.imports ?? [],
      providers: [S],
    };
  }
}
`);
    expect(m?.dynamic).toBe(true);
    expect(m?.unresolved).toBe(true);
    expect(m?.problems).toEqual([{ file: "src/m.ts", line: 9 }]);
    expect(refs(m?.providers ?? [])).toEqual([["S", 10]]);
  });

  it("global from the decorator and from the literal are combined, never reduced", () => {
    const [m] = modulesIn(`${DYN}
import { Global } from '@nestjs/common';
@Global()
@Module({})
export class G { static forRoot() { return { module: G, global: false }; } }
`);
    expect(m?.global).toBe(true);
  });
});

describe("followModuleCall", () => {
  const follow = (callSource: string, body: string) => {
    const project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: { moduleResolution: ModuleResolutionKind.Bundler },
    });
    const sf = project.createSourceFile(
      "/src/m.ts",
      `${DYN}\n${body}\nexport const CALL = ${callSource};\n`,
    );
    const init = sf
      .getVariableDeclarationOrThrow("CALL")
      .getInitializerOrThrow();
    return followModuleCall(init, ctx);
  };

  const CACHE = `
@Module({}) export class Cache {
  static forRoot(): DynamicModule { return { module: Cache }; }
  instance() { return { module: Cache }; }
}
@Module({}) export class Other { static forRoot() { return { module: Cache }; } }
`;

  it("resolves Class.method(...) to the declaring class", () => {
    const r = follow("Cache.forRoot()", CACHE);
    expect(r.kind === "class" && r.name).toBe("Cache");
  });

  it("is unresolved when the method is missing, not static, or returns another module", () => {
    expect(follow("Cache.nope()", CACHE).kind).toBe("unresolved");
    expect(follow("Cache.instance()", CACHE).kind).toBe("unresolved");
    expect(follow("Other.forRoot()", CACHE).kind).toBe("unresolved");
  });

  it("is unresolved for plain function calls and unknown receivers", () => {
    expect(
      follow("make()", "declare function make(): DynamicModule;").kind,
    ).toBe("unresolved");
    expect(follow("Missing.forRoot()", "").kind).toBe("unresolved");
  });
});
