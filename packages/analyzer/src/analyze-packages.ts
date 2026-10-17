import { readFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import type { ReportCode } from "@srcatlas/core";
import type { PackageInfo } from "./discover-packages.js";
import { builtinExtractors } from "./registry.js";
import type { PackageResult, PackageTask } from "./run-package.js";
import { type PoolResult, runInPool } from "./worker-pool.js";

export interface AnalyzeOptions {
  /** Pool size. Default: CPU count - 1, at least 1 (docs/config.md 2.7). */
  workers?: number;
  /** Replaces the worker pool; tests use it to run in-process. */
  run?: (task: PackageTask) => Promise<PackageResult>;
}

const byCodeUnit = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0;

function packageJson(
  root: string,
  pkg: PackageInfo,
): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(
      readFileSync(join(root, pkg.root, "package.json"), "utf8"),
    );
    return typeof v === "object" && v !== null
      ? (v as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

const failed = (name: string, error: string): PackageResult => ({
  package: name,
  nodes: [],
  edges: [],
  facts: [],
  report: [
    {
      level: "error",
      code: "core.package-failed" satisfies ReportCode,
      message: `analysis of package "${name}" failed: ${error}`,
      extractor: "core",
    },
  ],
  timings: {},
});

const settleRun = (
  run: (task: PackageTask) => Promise<PackageResult>,
  task: PackageTask,
): Promise<PoolResult> =>
  run(task).then(
    (value): PoolResult => ({ ok: true, value }),
    (e: unknown): PoolResult => ({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    }),
  );

/**
 * Runs the extractors of every package in parallel, one task per package. A package that
 * crashes yields a `core.package-failed` report entry; the others are unaffected.
 * Results are sorted by package name.
 */
export async function analyzePackages(
  root: string,
  packages: PackageInfo[],
  opts: AnalyzeOptions = {},
): Promise<PackageResult[]> {
  const tasks: PackageTask[] = packages.map((pkg) => {
    const json = packageJson(root, pkg);
    return {
      root,
      package: pkg,
      extractors:
        pkg.extractors ??
        builtinExtractors.filter((x) => x.detect(json)).map((x) => x.name),
    };
  });

  const { run } = opts;
  const settled = run
    ? await Promise.all(tasks.map((t) => settleRun(run, t)))
    : await runInPool(
        new URL("./worker.js", import.meta.url),
        opts.workers ?? Math.max(1, availableParallelism() - 1),
        tasks,
      );

  return settled
    .map((r, i) =>
      r.ok
        ? (r.value as PackageResult)
        : failed(packages[i]?.name ?? "unknown", r.error),
    )
    .sort((a, b) => byCodeUnit(a.package, b.package));
}
