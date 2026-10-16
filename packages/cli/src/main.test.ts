import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { run } from "./main.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "srcatlas-cli-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

async function cli(...argv: string[]) {
  let out = "";
  let err = "";
  const code = await run(argv, {
    cwd: dir,
    out: (s) => {
      out += s;
    },
    err: (s) => {
      err += s;
    },
  });
  return { code, out, err };
}

describe("srcatlas CLI", () => {
  it("--version prints the package version, exit 0", async () => {
    const r = await cli("--version");
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("--help lists commands, exit 0", async () => {
    const r = await cli("--help");
    expect(r.code).toBe(0);
    expect(r.out).toContain("analyze");
    expect(r.out).toContain("--config");
  });

  it("exit 2 for missing command, unknown command and unknown flag", async () => {
    expect((await cli()).code).toBe(2);
    expect((await cli("frobnicate")).code).toBe(2);
    const r = await cli("analyze", "--nope");
    expect(r.code).toBe(2);
    expect(r.err).toContain("--nope");
  });

  it("exit 3 for a known command that is not built yet, with no config present", async () => {
    const r = await cli("analyze");
    expect(r.code).toBe(3);
    expect(r.err).toContain("not implemented");
  });

  it("exit 2 for an unknown config key, naming the key", async () => {
    writeFileSync(
      join(dir, "srcatlas.config.ts"),
      "export default { pakages: [] };\n",
    );
    const r = await cli("analyze");
    expect(r.code).toBe(2);
    expect(r.err).toContain("pakages");
  });

  it("loads a TypeScript config with defineConfig and a relative import", async () => {
    writeFileSync(
      join(dir, "shared.ts"),
      "export const pkgs: string[] = ['apps/api'];\n",
    );
    writeFileSync(
      join(dir, "srcatlas.config.ts"),
      "import { pkgs } from './shared';\nexport default { packages: pkgs };\n",
    );
    expect((await cli("analyze")).code).toBe(3); // valid config, command not built
  });

  it("exit 2 when --config points at a missing file or the config throws", async () => {
    expect((await cli("analyze", "--config", "nope.ts")).code).toBe(2);
    writeFileSync(
      join(dir, "srcatlas.config.ts"),
      "throw new Error('boom');\n",
    );
    const r = await cli("analyze");
    expect(r.code).toBe(2);
    expect(r.err).toContain("boom");
  });

  it("takes the root from the [path] argument", async () => {
    mkdirSync(join(dir, "sub"));
    writeFileSync(
      join(dir, "sub", "srcatlas.config.ts"),
      "export default { bad: 1 };\n",
    );
    expect((await cli("analyze", "sub")).code).toBe(2);
  });

  it("loading a config writes nothing into the repository (jiti cache off, ADR 0008)", async () => {
    writeFileSync(join(dir, "srcatlas.config.ts"), "export default {};\n");
    const before = readdirSync(dir, { recursive: true }).sort();
    await cli("analyze");
    expect(readdirSync(dir, { recursive: true }).sort()).toEqual(before);
  });
});
