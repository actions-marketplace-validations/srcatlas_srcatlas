import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GraphFile, serializeGraph } from "@srcatlas/core";
import { fixturePath } from "@srcatlas/core/testing";
import { afterEach, describe, expect, it } from "vitest";
import { run } from "./main.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A copy of a fixture outside the repository, so git state and the working directory cannot leak in. */
function copyOf(fixture: string): string {
  const dir = mkdtempSync(join(tmpdir(), "srcatlas-analyze-"));
  dirs.push(dir);
  cpSync(fixturePath(fixture), dir, { recursive: true });
  return dir;
}

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

const version = (
  JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { version: string }
).version;

const graphPath = (dir: string) =>
  join(dir, ".srcatlas", "srcatlas.graph.json");
const reportPath = (dir: string) =>
  join(dir, ".srcatlas", "srcatlas.report.json");

describe("srcatlas analyze", () => {
  it("falls back to a file-level import graph and matches the hand-written golden file", async () => {
    const dir = copyOf("analyzer-pnpm");
    const r = await cli(dir, "analyze");
    expect(r.code).toBe(0);
    expect(r.err).toContain("import graph");

    const golden = JSON.parse(
      readFileSync(
        join(fixturePath("analyzer-pnpm"), "expected.fallback.graph.json"),
        "utf8",
      ).replace("VERSION", version),
    );
    const text = readFileSync(graphPath(dir), "utf8");
    expect(JSON.parse(text)).toEqual(golden);
    // Canonical bytes: the file is exactly what the core writer produces (schema section 9).
    expect(text).toBe(serializeGraph(GraphFile.parse(golden)));
  });

  it("writes a graph that is byte-identical when analysed from different directories", async () => {
    const a = copyOf("analyzer-pnpm");
    const b = copyOf("analyzer-pnpm");
    await cli(a, "analyze");
    await cli(b, "analyze");
    expect(readFileSync(graphPath(a), "utf8")).toBe(
      readFileSync(graphPath(b), "utf8"),
    );
  });

  it("--json prints the summary on stdout", async () => {
    const dir = copyOf("analyzer-pnpm");
    const r = await cli(dir, "analyze", "--json");
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out)).toEqual({
      schemaVersion: 1,
      counts: { nodes: { file: 2, package: 2 }, edges: { imports: 1 } },
      report: { parseErrors: 0, unresolved: 0 },
      graphFile: ".srcatlas/srcatlas.graph.json",
    });
  });

  it("-o - writes the graph to stdout and the summary to stderr, and no graph file", async () => {
    const dir = copyOf("analyzer-pnpm");
    const r = await cli(dir, "analyze", "-o", "-");
    expect(r.code).toBe(0);
    expect(GraphFile.parse(JSON.parse(r.out)).nodes).toHaveLength(4);
    expect(r.err).toContain("packages");
    expect(existsSync(graphPath(dir))).toBe(false);
    expect(existsSync(reportPath(dir))).toBe(true);
  });

  it("exit 2 when --json and -o - would both use stdout", async () => {
    const dir = copyOf("analyzer-pnpm");
    expect((await cli(dir, "analyze", "--json", "-o", "-")).code).toBe(2);
  });

  it("honours --out and --report, relative to the root", async () => {
    const dir = copyOf("analyzer-pnpm");
    const r = await cli(
      dir,
      "analyze",
      "--out",
      "out/g.json",
      "--report",
      "out/r.json",
    );
    expect(r.code).toBe(0);
    expect(existsSync(join(dir, "out", "g.json"))).toBe(true);
    expect(existsSync(join(dir, "out", "r.json"))).toBe(true);
  });

  it("skips an unparsable file: exit 0 with a report entry; --strict exits 1 but still writes", async () => {
    const dir = copyOf("analyzer-parse-error");
    const plain = await cli(dir, "analyze");
    expect(plain.code).toBe(0);
    const report = JSON.parse(readFileSync(reportPath(dir), "utf8"));
    expect(report.counts.parseErrors).toBe(1);
    expect(report.entries[0]).toMatchObject({
      code: "core.parse-error",
      site: { file: "src/broken.ts", line: 1 },
    });
    const files = GraphFile.parse(
      JSON.parse(readFileSync(graphPath(dir), "utf8")),
    )
      .nodes.filter((n) => n.kind === "file")
      .map((n) => n.id);
    expect(files).toEqual(["file:broken/src/ok.ts"]);

    const strict = await cli(dir, "analyze", "--strict");
    expect(strict.code).toBe(1);
    expect(existsSync(graphPath(dir))).toBe(true);
  });

  it("--only with a name no package uses runs nothing and does not use the fallback", async () => {
    const dir = copyOf("analyzer-pnpm");
    const r = await cli(dir, "analyze", "--only", "nestjs", "--json");
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out).counts.nodes).toEqual({ package: 2 });
  });

  it("exit 2 for an invalid --workers value", async () => {
    const dir = copyOf("analyzer-pnpm");
    expect((await cli(dir, "analyze", "--workers", "0")).code).toBe(2);
    expect((await cli(dir, "analyze", "--workers", "abc")).code).toBe(2);
  });

  it("exit 2 for a duplicate package name", async () => {
    const dir = copyOf("analyzer-dup-names");
    const r = await cli(dir, "analyze");
    expect(r.code).toBe(2);
    expect(r.err).toContain("duplicate package name");
  });
});
