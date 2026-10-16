// Golden-file helpers (CLAUDE.md section 8). Node-only, so not exported from the
// package root: the viewer and differ import `@srcatlas/core` in a browser.
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { GraphFile } from "./schema.js";
import { serializeGraph } from "./serialize.js";
import { validateGraph } from "./validate.js";

/** Absolute path of `fixtures/<name>` in this repository. */
export function fixturePath(name: string): string {
  return fileURLToPath(new URL(`../../../fixtures/${name}`, import.meta.url));
}

/** Reads `expected.graph.json`, then checks schema and all section 10 invariants. Throws on a bad golden file. */
export function loadGolden(fixtureDir: string): GraphFile {
  const raw: unknown = JSON.parse(
    readFileSync(join(fixtureDir, "expected.graph.json"), "utf8"),
  );
  const parsed = GraphFile.parse(raw);
  const violations = validateGraph(parsed);
  if (violations.length > 0) {
    throw new Error(
      `${fixtureDir}/expected.graph.json breaks invariants:\n${violations
        .map((v) => `  [${v.invariant}] ${v.message}`)
        .join("\n")}`,
    );
  }
  return parsed;
}

/**
 * Canonical text of the golden file and of `actual`. Compare with `toBe`:
 * a failure prints a line diff. Key order in the hand-written file is free;
 * graphs are never snapshotted.
 */
export function goldenPair(
  fixtureDir: string,
  actual: GraphFile,
): { expected: string; actual: string } {
  return {
    expected: serializeGraph(loadGolden(fixtureDir)),
    actual: serializeGraph(actual),
  };
}

/**
 * Runs `analyze` on two copies of the fixture under differently named temp
 * directories and returns both serialised graphs. Equal bytes prove the output
 * holds no absolute path, cwd or other location-dependent value.
 */
export async function analyzeTwice(
  fixtureDir: string,
  analyze: (root: string) => GraphFile | Promise<GraphFile>,
): Promise<[string, string]> {
  const base = mkdtempSync(join(tmpdir(), "srcatlas-det-"));
  try {
    const outs: string[] = [];
    for (const dir of ["a-first", "second/nested-b"]) {
      const root = join(base, dir);
      cpSync(fixtureDir, root, { recursive: true });
      outs.push(serializeGraph(await analyze(root)));
    }
    return [outs[0] ?? "", outs[1] ?? ""];
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}
