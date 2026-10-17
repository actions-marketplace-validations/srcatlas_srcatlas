import { execFileSync } from "node:child_process";
import { relative, resolve } from "node:path";
import {
  analyzeRepo,
  DuplicatePackageNameError,
  writeOutputs,
} from "@srcatlas/analyzer";
import { type Config, serializeGraph } from "@srcatlas/core";
import { UsageError } from "./errors.js";

export interface AnalyzeFlags {
  out?: string | undefined;
  report?: string | undefined;
  strict?: boolean | undefined;
  workers?: string | undefined;
  only?: string[] | undefined;
  json?: boolean | undefined;
  quiet?: boolean | undefined;
}

interface Io {
  out: (s: string) => void;
  err: (s: string) => void;
  env?: Record<string, string | undefined> | undefined;
}

/** The HEAD commit, or undefined outside git. Local only: no network. */
function headCommit(root: string): string | undefined {
  try {
    const sha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    return /^[0-9a-f]{40}$/.test(sha) ? sha : undefined;
  } catch {
    return undefined;
  }
}

function parseWorkers(flag: string | undefined, env: string | undefined) {
  const raw = flag ?? env;
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw new UsageError(`--workers must be a positive integer, got "${raw}"`);
  }
  return n;
}

const posix = (p: string): string => p.replaceAll("\\", "/");

function humanSummary(
  version: string,
  counts: Record<string, number>,
  edgeTotal: number,
  unresolved: number,
  reportFile: string,
  seconds: number,
): string {
  const cells = Object.entries(counts).map(
    ([k, n]) => `${`${k}s`.padEnd(10)} ${String(n).padEnd(5)}`,
  );
  const rows: string[] = [];
  for (let i = 0; i < cells.length; i += 3)
    rows.push(
      cells
        .slice(i, i + 3)
        .join(" ")
        .trimEnd(),
    );
  return [
    `srcatlas ${version} · schema 1`,
    ...rows,
    `${"edges".padEnd(10)} ${String(edgeTotal).padEnd(5)} unresolved ${unresolved} (see ${reportFile})`,
    `done in ${seconds.toFixed(1)} s`,
    "",
  ].join("\n");
}

/** `srcatlas analyze` (docs/cli.md 3.2). Returns the exit code. */
export async function analyzeCommand(
  root: string,
  config: Config,
  flags: AnalyzeFlags,
  version: string,
  io: Io,
): Promise<number> {
  const toStdout = flags.out === "-";
  if (toStdout && flags.json) {
    throw new UsageError("--json and -o - both write to stdout; use one");
  }
  const workers = parseWorkers(flags.workers, io.env?.SRCATLAS_WORKERS);
  const outDir = config.outDir ?? ".srcatlas";
  const graphPath = toStdout
    ? undefined
    : resolve(root, flags.out ?? `${outDir}/srcatlas.graph.json`);
  const reportPath = resolve(
    root,
    flags.report ?? `${outDir}/srcatlas.report.json`,
  );

  const started = performance.now();
  const commit = headCommit(root);
  let result: Awaited<ReturnType<typeof analyzeRepo>>;
  try {
    result = await analyzeRepo(root, config, {
      generatorVersion: version,
      ...(commit ? { commit } : {}),
      ...(workers ? { workers } : {}),
      ...(flags.only?.length ? { only: flags.only } : {}),
    });
  } catch (e) {
    if (e instanceof DuplicatePackageNameError) throw new UsageError(e.message);
    throw e;
  }
  const { graph, report, fallbackPackages } = result;

  const graphText = serializeGraph(graph);
  writeOutputs([
    ...(graphPath ? [{ path: graphPath, content: graphText }] : []),
    { path: reportPath, content: `${JSON.stringify(report, null, 2)}\n` },
  ]);
  if (toStdout) io.out(graphText);

  const nodeCounts: Record<string, number> = {};
  for (const n of graph.nodes)
    nodeCounts[n.kind] = (nodeCounts[n.kind] ?? 0) + 1;
  const edgeCounts: Record<string, number> = {};
  for (const e of graph.edges)
    edgeCounts[e.kind] = (edgeCounts[e.kind] ?? 0) + 1;
  const sorted = (o: Record<string, number>) =>
    Object.fromEntries(
      Object.entries(o).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    );

  if (flags.json) {
    io.out(
      `${JSON.stringify({
        schemaVersion: graph.schemaVersion,
        counts: { nodes: sorted(nodeCounts), edges: sorted(edgeCounts) },
        report: {
          parseErrors: report.counts.parseErrors,
          unresolved: report.counts.unresolved,
        },
        ...(graphPath ? { graphFile: posix(relative(root, graphPath)) } : {}),
      })}\n`,
    );
  }
  if (!flags.quiet) {
    if (fallbackPackages.length > 0) {
      io.err(
        `no framework extractor matched ${fallbackPackages.join(", ")}: using a file-level import graph\n`,
      );
    }
    io.err(
      humanSummary(
        version,
        sorted(nodeCounts),
        graph.edges.length,
        report.counts.unresolved,
        posix(relative(root, reportPath)),
        (performance.now() - started) / 1000,
      ),
    );
  }

  const findings = report.counts.parseErrors + report.counts.unresolved;
  return flags.strict && findings > 0 ? 1 : 0;
}
