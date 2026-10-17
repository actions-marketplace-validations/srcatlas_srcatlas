import { describe, expect, it } from "vitest";
import {
  buildTokenTable,
  type ModuleRegistration,
  resolveToken,
} from "./tokens.js";

// docs/extractors/nestjs.md section 3. Tokens are opaque keys here (see tokenKeyOf in evaluate.ts).

const mod = (
  id: string,
  over: Partial<ModuleRegistration> = {},
): ModuleRegistration => ({
  id,
  global: false,
  imports: [],
  providers: [],
  ...over,
});

const reg = (token: string, provider: string) => ({ token, provider });

describe("resolveToken: order of the steps", () => {
  it("(a) the injecting class's own module, certain", () => {
    const table = buildTokenTable([
      mod("M", { providers: [reg("T", "p-own")] }),
      mod("X", { providers: [reg("T", "p-other")] }),
    ]);
    expect(
      resolveToken(table, { token: "T", module: "M", origin: "repo" }),
    ).toEqual({
      found: true,
      step: "own",
      providers: ["p-own"],
      confidence: "certain",
    });
  });

  it("(b) a directly imported module beats a global module", () => {
    const table = buildTokenTable([
      mod("M", { imports: ["N"] }),
      mod("N", { providers: [reg("T", "p-imported")] }),
      mod("G", { global: true, providers: [reg("T", "p-global")] }),
    ]);
    expect(
      resolveToken(table, { token: "T", module: "M", origin: "repo" }),
    ).toMatchObject({
      step: "imported",
      providers: ["p-imported"],
      confidence: "certain",
    });
  });

  it("(c) a global module the injecting module does not import, certain", () => {
    const table = buildTokenTable([
      mod("M"),
      mod("G", { global: true, providers: [reg("T", "p-global")] }),
      mod("X", { providers: [reg("T", "p-elsewhere")] }),
    ]);
    expect(
      resolveToken(table, { token: "T", module: "M", origin: "repo" }),
    ).toMatchObject({
      step: "global",
      providers: ["p-global"],
      confidence: "certain",
    });
  });

  it("(d) anywhere in the package, inferred", () => {
    const table = buildTokenTable([
      mod("M"),
      mod("X", { providers: [reg("T", "p-elsewhere")] }),
    ]);
    expect(
      resolveToken(table, { token: "T", module: "M", origin: "repo" }),
    ).toEqual({
      found: true,
      step: "anywhere",
      providers: ["p-elsewhere"],
      confidence: "inferred",
    });
  });

  it("does not look through imports of imports", () => {
    const table = buildTokenTable([
      mod("M", { imports: ["N"] }),
      mod("N", { imports: ["O"] }),
      mod("O", { providers: [reg("T", "p-deep")] }),
    ]);
    expect(
      resolveToken(table, { token: "T", module: "M", origin: "repo" }),
    ).toMatchObject({
      step: "anywhere",
      confidence: "inferred",
    });
  });

  it("an unknown injecting module skips (a) and (b) but still uses (c) and (d)", () => {
    const table = buildTokenTable([
      mod("G", { global: true, providers: [reg("T", "p-global")] }),
    ]);
    expect(
      resolveToken(table, {
        token: "T",
        module: "NOT-A-MODULE",
        origin: "repo",
      }),
    ).toMatchObject({ step: "global" });
  });
});

describe("resolveToken: ambiguity (step 4)", () => {
  it("several candidates at one step: all of them, inferred, nest.ambiguous-token", () => {
    const table = buildTokenTable([
      mod("M", { imports: ["N1", "N2"] }),
      mod("N1", { providers: [reg("T", "p1")] }),
      mod("N2", { providers: [reg("T", "p2")] }),
    ]);
    expect(
      resolveToken(table, { token: "T", module: "M", origin: "repo" }),
    ).toEqual({
      found: true,
      step: "imported",
      providers: ["p1", "p2"],
      confidence: "inferred",
      code: "nest.ambiguous-token",
    });
  });

  it("the same provider registered in two modules at one step is still ambiguous", () => {
    const table = buildTokenTable([
      mod("M", { imports: ["N1", "N2"] }),
      mod("N1", { providers: [reg("T", "p")] }),
      mod("N2", { providers: [reg("T", "p")] }),
    ]);
    expect(
      resolveToken(table, { token: "T", module: "M", origin: "repo" }),
    ).toMatchObject({
      providers: ["p"],
      confidence: "inferred",
      code: "nest.ambiguous-token",
    });
  });

  it("the same registration listed twice is one candidate", () => {
    const table = buildTokenTable([
      mod("M", { providers: [reg("T", "p"), reg("T", "p")] }),
    ]);
    expect(
      resolveToken(table, { token: "T", module: "M", origin: "repo" }),
    ).toEqual({
      found: true,
      step: "own",
      providers: ["p"],
      confidence: "certain",
    });
  });

  it("is ambiguous at the last step too, and provider order is code-unit order", () => {
    const table = buildTokenTable([
      mod("M"),
      mod("Z", { providers: [reg("T", "provider:api/b")] }),
      mod("Y", { providers: [reg("T", "provider:api/B")] }),
    ]);
    expect(
      resolveToken(table, { token: "T", module: "M", origin: "repo" }),
    ).toMatchObject({
      step: "anywhere",
      providers: ["provider:api/B", "provider:api/b"],
      code: "nest.ambiguous-token",
    });
  });
});

describe("resolveToken: no candidate (step 5)", () => {
  const table = buildTokenTable([mod("M")]);

  it("a class from node_modules: no edge, no report entry", () => {
    expect(
      resolveToken(table, {
        token: "external:@nestjs/config#ConfigService",
        module: "M",
        origin: "external",
      }),
    ).toEqual({ found: false });
  });

  it("a token declared in the repository: nest.unresolved-provider-token", () => {
    expect(
      resolveToken(table, {
        token: "class:src/a.ts#A",
        module: "M",
        origin: "repo",
      }),
    ).toEqual({
      found: false,
      code: "nest.unresolved-provider-token",
    });
  });

  it("a token that could not be evaluated: nest.unresolved-provider-token", () => {
    expect(
      resolveToken(table, { token: undefined, module: "M", origin: "repo" }),
    ).toEqual({
      found: false,
      code: "nest.unresolved-provider-token",
    });
  });
});
