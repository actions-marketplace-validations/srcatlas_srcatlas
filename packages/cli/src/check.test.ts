import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Json, sortKeys } from "@srcatlas/core";
import { fixturePath } from "@srcatlas/core/testing";
import { afterEach, describe, expect, it } from "vitest";
import { run } from "./main.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function copyOf(fixture: string): string {
  const dir = mkdtempSync(join(tmpdir(), "srcatlas-check-"));
  dirs.push(dir);
  cpSync(fixturePath(fixture), dir, { recursive: true });
  return dir;
}

const writeConfig = (dir: string, rules: unknown) =>
  writeFileSync(
    join(dir, "srcatlas.config.mjs"),
    `export default { rules: ${JSON.stringify(rules)} };\n`,
  );

async function cli(cwd: string, ...argv: string[]) {
  let out = "";
  let err = "";
  const code = await run(argv, {
    cwd,
    out: (s) => {
      out += s;
    },
    err: (s) => {
      err += s;
    },
  });
  return { code, out, err };
}

const read = (file: string): string =>
  readFileSync(join(fixturePath("rules-basic"), file), "utf8");
const rules = (): unknown[] => JSON.parse(read("rules.json"));
// The CLI prints canonical JSON; the committed file is formatted by Biome.
const canonical = (file: string): string =>
  `${JSON.stringify(sortKeys(JSON.parse(read(file)) as Json), null, 2)}
`;

// rules-basic: five violations, four of severity error, one warning, and two warnings
// (a stale exception and an unsupported rule). Expected output is hand-written from
// docs/cli.md 3.5 and 3.5.1.
function configured(): string {
  const dir = copyOf("rules-basic");
  writeConfig(dir, rules());
  return dir;
}

describe("srcatlas check", () => {
  it("--format json prints the violations and exits 1 on an error", async () => {
    const r = await cli(
      configured(),
      "check",
      "graph.json",
      "--format",
      "json",
    );
    expect(r.code).toBe(1);
    expect(r.out).toBe(canonical("expected.violations.json"));
  });

  it("--format text lists each violation with its sites and a count", async () => {
    const r = await cli(configured(), "check", "graph.json");
    expect(r.code).toBe(1);
    expect(r.out).toBe(read("expected.check.txt"));
  });

  it("--format github prints one workflow command per site", async () => {
    const r = await cli(
      configured(),
      "check",
      "graph.json",
      "--format",
      "github",
    );
    expect(r.code).toBe(1);
    expect(r.out).toBe(read("expected.check.github.txt"));
  });

  it("warnings go to stderr in every format, and --quiet keeps only errors", async () => {
    const dir = configured();
    for (const format of ["text", "json", "github"]) {
      const r = await cli(dir, "check", "graph.json", "--format", format);
      expect(r.err).toBe(
        'warning: rule controllers-not-direct-db: stale exception {"from":"controller:api/GhostController"}\n' +
          "warning: rule fan-out: type max-fan-out is not supported yet, skipped\n",
      );
    }
    const q = await cli(
      dir,
      "check",
      "graph.json",
      "--format",
      "json",
      "--quiet",
    );
    expect(q.err).toBe("");
  });

  it("a warn-severity violation alone exits 0", async () => {
    const dir = copyOf("rules-basic");
    writeConfig(
      dir,
      rules().filter(
        (r) => (r as { id: string }).id === "orders-services-not-mail",
      ),
    );
    const r = await cli(dir, "check", "graph.json", "--format", "json");
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out)).toHaveLength(1);
  });

  it("--min-confidence certain drops violations on inferred elements", async () => {
    const dir = copyOf("rules-basic");
    writeConfig(dir, [
      {
        id: "provider-reads",
        type: "forbidden-edge",
        from: { kind: "provider" },
        to: { kind: "model" },
        edgeKinds: ["reads"],
      },
    ]);
    const count = async (...flags: string[]) =>
      JSON.parse(
        (await cli(dir, "check", "graph.json", "--format", "json", ...flags))
          .out,
      ).length;
    expect(await count()).toBe(3);
    expect(await count("--min-confidence", "certain")).toBe(2);
  });

  it("no rules: says so and exits 0", async () => {
    const dir = copyOf("rules-basic");
    const r = await cli(dir, "check", "graph.json");
    expect(r.code).toBe(0);
    expect(r.err).toContain("no rules configured");
  });

  it("without a graph it analyses in memory and writes no file", async () => {
    const dir = copyOf("nest-basic");
    writeConfig(dir, [
      {
        id: "no-controller-injects",
        type: "forbidden-edge",
        from: { kind: "controller" },
        to: { kind: "provider" },
        edgeKinds: ["injects"],
      },
      { id: "no-module-cycles", type: "no-cycles", over: "modules" },
    ]);
    const r = await cli(dir, "check", "--format", "json");
    expect(r.code).toBe(1);
    const v = JSON.parse(r.out);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({
      rule: "no-controller-injects",
      from: "controller:api/OrdersController",
      to: "provider:api/OrdersService",
    });
    expect(existsSync(join(dir, ".srcatlas"))).toBe(false);
  });

  describe("exit 2", () => {
    it("bad format or level", async () => {
      const dir = configured();
      for (const flags of [
        ["--format", "html"],
        ["--min-confidence", "high"],
      ]) {
        const r = await cli(dir, "check", "graph.json", ...flags);
        expect(r.code).toBe(2);
        expect(r.err).toContain(flags[1] as string);
      }
    });
    it("a graph file that is missing, broken or of another schemaVersion", async () => {
      const dir = configured();
      writeFileSync(join(dir, "junk.json"), "{ nope");
      const future = JSON.parse(read("graph.json"));
      future.schemaVersion = 2;
      writeFileSync(join(dir, "future.json"), JSON.stringify(future));
      for (const bad of ["missing.json", "junk.json", "future.json"]) {
        const r = await cli(dir, "check", bad);
        expect(r.code).toBe(2);
        expect(r.out).toBe("");
      }
    });
    it("an invalid rule in the config", async () => {
      const dir = copyOf("rules-basic");
      writeConfig(dir, [{ id: "Bad_Id", type: "no-cycles", over: "modules" }]);
      expect((await cli(dir, "check", "graph.json")).code).toBe(2);
    });
  });
});
