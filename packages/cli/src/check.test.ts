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

// docs/cli.md 3.5.2. rules-basic has five violations; expected.accepted.json is the
// hand-written file that accepts all of them.
describe("srcatlas check, accepted violations", () => {
  type G = {
    edges: {
      from: string;
      kind: string;
      to: string;
      sites: { file: string; line: number }[];
      extractor?: string;
      confidence?: string;
      meta?: object;
    }[];
  };
  const ACCEPTED = "srcatlas.accepted.json";
  const sortEdges = (g: G) =>
    g.edges.sort((a, b) =>
      `${a.from}\0${a.kind}\0${a.to}` < `${b.from}\0${b.kind}\0${b.to}`
        ? -1
        : 1,
    );

  /** The fixture graph, changed by `mutate`, written next to it as `name`. */
  function variant(dir: string, name: string, mutate: (g: G) => void): void {
    const g = JSON.parse(read("graph.json")) as G;
    mutate(g);
    sortEdges(g);
    writeFileSync(join(dir, name), JSON.stringify(g));
  }
  const newBadEdge = (g: G) =>
    g.edges.push({
      from: "provider:api/UsersService",
      kind: "reads",
      to: "model:api/Order",
      sites: [{ file: "src/users/users.service.ts", line: 20 }],
      extractor: "nestjs",
      confidence: "certain",
      meta: {},
    });
  const withoutWrite = (g: G) => {
    g.edges = g.edges.filter(
      (e) => !(e.from.endsWith("OrdersController") && e.kind === "writes"),
    );
  };
  const accepted = (dir: string) => readFileSync(join(dir, ACCEPTED), "utf8");

  it("--accept without a file records every violation, sorted, and exits 0", async () => {
    const dir = configured();
    const r = await cli(dir, "check", "graph.json", "--accept");
    expect(r.code).toBe(0);
    expect(accepted(dir)).toBe(canonical("expected.accepted.json"));
    expect(r.out).toBe("0 errors, 0 warnings\n");
    expect(r.err).toContain("5 added, 0 kept, 0 removed");
  });

  it("a plain run then hides accepted violations and says how many", async () => {
    const dir = configured();
    await cli(dir, "check", "graph.json", "--accept");
    const before = accepted(dir);
    const r = await cli(dir, "check", "graph.json");
    expect(r.code).toBe(0);
    expect(r.out).toBe("0 errors, 0 warnings\n");
    expect(r.err).toContain("5 accepted violations not shown");
    expect(accepted(dir)).toBe(before);
  });

  it("fails only on a violation that is not in the file", async () => {
    const dir = configured();
    await cli(dir, "check", "graph.json", "--accept");
    variant(dir, "worse.json", newBadEdge);
    const r = await cli(dir, "check", "worse.json", "--format", "json");
    expect(r.code).toBe(1);
    const v = JSON.parse(r.out);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({
      rule: "certain-provider-db",
      from: "provider:api/UsersService",
    });
  });

  it("a violation that only moved lines stays accepted", async () => {
    const dir = configured();
    await cli(dir, "check", "graph.json", "--accept");
    variant(dir, "moved.json", (g) => {
      for (const e of g.edges) for (const s of e.sites) s.line += 100;
    });
    expect((await cli(dir, "check", "moved.json")).code).toBe(0);
  });

  it("a fixed violation is a warning, and --accept shrinks the file", async () => {
    const dir = configured();
    await cli(dir, "check", "graph.json", "--accept");
    variant(dir, "better.json", withoutWrite);
    const plain = await cli(dir, "check", "better.json");
    expect(plain.code).toBe(0);
    expect(plain.err).toContain(
      "accepted violation no longer occurs: controllers-not-direct-db controller:api/OrdersController writes model:api/Order",
    );
    expect(accepted(dir)).toBe(canonical("expected.accepted.json"));

    const r = await cli(dir, "check", "better.json", "--accept");
    expect(r.code).toBe(0);
    expect(r.err).toContain("0 added, 4 kept, 1 removed");
    expect(JSON.parse(accepted(dir)).violations).toHaveLength(4);
  });

  it("--accept never adds to an existing file; --accept --add does", async () => {
    const dir = configured();
    await cli(dir, "check", "graph.json", "--accept");
    variant(dir, "worse.json", newBadEdge);
    const before = accepted(dir);

    const refused = await cli(dir, "check", "worse.json", "--accept");
    expect(refused.code).toBe(1);
    expect(accepted(dir)).toBe(before);
    expect(refused.err).toContain("--add");

    const added = await cli(dir, "check", "worse.json", "--accept", "--add");
    expect(added.code).toBe(0);
    expect(added.err).toContain("1 added, 5 kept, 0 removed");
    expect(JSON.parse(accepted(dir)).violations).toHaveLength(6);
  });

  it("--accepted names another file, which must exist unless --accept writes it", async () => {
    const dir = configured();
    const missing = await cli(
      dir,
      "check",
      "graph.json",
      "--accepted",
      "x/a.json",
    );
    expect(missing.code).toBe(2);
    const r = await cli(
      dir,
      "check",
      "graph.json",
      "--accepted",
      "x/a.json",
      "--accept",
    );
    expect(r.code).toBe(0);
    expect(existsSync(join(dir, "x", "a.json"))).toBe(true);
    expect(existsSync(join(dir, ACCEPTED))).toBe(false);
    expect(
      (await cli(dir, "check", "graph.json", "--accepted", "x/a.json")).code,
    ).toBe(0);
  });

  it("the file is identical when written twice", async () => {
    const a = configured();
    const b = configured();
    await cli(a, "check", "graph.json", "--accept");
    await cli(b, "check", "graph.json", "--accept", "--add");
    expect(accepted(a)).toBe(accepted(b));
  });

  describe("exit 2", () => {
    it("--accept with a stricter --min-confidence", async () => {
      const dir = configured();
      const r = await cli(
        dir,
        "check",
        "graph.json",
        "--accept",
        "--min-confidence",
        "certain",
      );
      expect(r.code).toBe(2);
      expect(existsSync(join(dir, ACCEPTED))).toBe(false);
    });
    it("an accepted file that is not valid", async () => {
      const dir = configured();
      for (const bad of [
        "{ nope",
        '{"version":2,"violations":[]}',
        '{"version":1,"violations":[{"rule":"x"}]}',
        '{"version":1,"violations":[],"extra":1}',
      ]) {
        writeFileSync(join(dir, ACCEPTED), bad);
        const r = await cli(dir, "check", "graph.json");
        expect(r.code).toBe(2);
        expect(r.out).toBe("");
      }
    });
  });
});
