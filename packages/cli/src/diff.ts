import { relative, resolve } from "node:path";
import { writeOutputs } from "@srcatlas/analyzer";
import {
  type Config,
  type DiffFile,
  type GraphFile,
  serializeDiff,
} from "@srcatlas/core";
import { DiffError, diffGraphs, formatSummary } from "@srcatlas/differ";
import { renderMermaid } from "@srcatlas/renderer";
import { formatMarkdown, formatText } from "./diff-format.js";
import { UsageError } from "./errors.js";
import { loadGraph } from "./graph-source.js";

export interface DiffFlags {
  out?: string | undefined;
  format?: string | undefined;
  "fail-on"?: string[] | undefined;
  "min-confidence"?: string | undefined;
  "max-nodes"?: string | undefined;
  quiet?: boolean | undefined;
}

interface Io {
  out: (s: string) => void;
  err: (s: string) => void;
}

const FORMATS = ["text", "json", "markdown", "mermaid"];
const CONFIDENCE_RANK: Record<string, number> = {
  certain: 2,
  inferred: 1,
  unresolved: 0,
};

const anyChange = (d: DiffFile): boolean =>
  Object.values(d.nodes).some((l) => l.length > 0) ||
  Object.values(d.edges).some((l) => l.length > 0);

const FAIL_ON: Record<string, (d: DiffFile) => boolean> = {
  "new-cycle": (d) => d.cycles.length > 0,
  "new-cross-module-edge": (d) => d.crossModuleEdges.length > 0,
  "removed-node": (d) => d.nodes.removed.length > 0,
  "any-change": anyChange,
};

/** Drops nodes and edges below `min`, and edges whose endpoint was dropped (docs/cli.md 3.4.2). */
function atLeast(g: GraphFile, min: number): GraphFile {
  const nodes = g.nodes.filter(
    (n) => (CONFIDENCE_RANK[n.confidence] ?? 0) >= min,
  );
  const ids = new Set(nodes.map((n) => n.id));
  const edges = g.edges.filter(
    (e) =>
      (CONFIDENCE_RANK[e.confidence] ?? 0) >= min &&
      ids.has(e.from) &&
      ids.has(e.to),
  );
  return { ...g, nodes, edges };
}

/** `srcatlas diff <base> <head>` (docs/cli.md 3.4). Returns the exit code. */
export async function diffCommand(
  root: string,
  config: Config,
  inputs: string[],
  flags: DiffFlags,
  version: string,
  io: Io,
): Promise<number> {
  const [base, head, ...extra] = inputs;
  if (!base || !head || extra.length > 0) {
    throw new UsageError("usage: srcatlas diff <base> <head>");
  }
  const format = flags.format ?? "text";
  if (!FORMATS.includes(format)) {
    throw new UsageError(
      `--format must be one of ${FORMATS.join(", ")}, got "${format}"`,
    );
  }
  const minName = flags["min-confidence"] ?? "inferred";
  const min = CONFIDENCE_RANK[minName];
  if (min === undefined) {
    throw new UsageError(
      `--min-confidence must be certain, inferred or unresolved, got "${minName}"`,
    );
  }
  const maxRaw = flags["max-nodes"] ?? "40";
  const maxNodes = Number(maxRaw);
  if (!Number.isInteger(maxNodes) || maxNodes < 1) {
    throw new UsageError(
      `--max-nodes must be a positive integer, got "${maxRaw}"`,
    );
  }
  const failOn = flags["fail-on"] ?? [];
  for (const c of failOn) {
    if (!(c in FAIL_ON)) {
      throw new UsageError(
        `--fail-on must be one of ${Object.keys(FAIL_ON).join(", ")}, got "${c}"`,
      );
    }
  }

  const outDir = config.outDir ?? ".srcatlas";
  const env = { root, config, version, outDir: resolve(root, outDir) };
  const baseGraph = await loadGraph(base, "base", env);
  const headGraph = await loadGraph(head, "head", env);
  let diff: DiffFile;
  try {
    diff = diffGraphs(atLeast(baseGraph, min), atLeast(headGraph, min));
  } catch (e) {
    if (e instanceof DiffError) throw new UsageError(e.message);
    throw e;
  }

  const diffText = serializeDiff(diff);
  const diffPath = resolve(root, flags.out ?? `${outDir}/srcatlas.diff.json`);
  writeOutputs([{ path: diffPath, content: diffText }]);

  io.out(
    format === "json"
      ? diffText
      : format === "mermaid"
        ? renderMermaid(diff, { maxNodes })
        : format === "markdown"
          ? formatMarkdown(diff, maxNodes)
          : formatText(diff),
  );
  if (!flags.quiet && format !== "text") {
    const written = relative(root, diffPath).replaceAll("\\", "/");
    io.err(`${formatSummary(diff.summary)}\nwrote ${written}\n`);
  }
  return failOn.some((c) => FAIL_ON[c]?.(diff)) ? 1 : 0;
}
