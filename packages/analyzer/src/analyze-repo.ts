import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type Config,
  type Edge,
  GraphBuilder,
  type GraphFile,
  type Node,
  type ReportFile,
} from "@srcatlas/core";
import { resolveAccessFacts } from "@srcatlas/extractor-prisma";
import { type AnalyzeOptions, analyzePackages } from "./analyze-packages.js";
import { discoverPackages, type PackageInfo } from "./discover-packages.js";
import { collectReport } from "./write-report.js";

export interface AnalyzeRepoOptions extends AnalyzeOptions {
  generatorVersion: string;
  /** Full 40-character SHA, when the repository is under git. */
  commit?: string;
}

export interface AnalyzeRepoResult {
  graph: GraphFile;
  report: ReportFile;
  /** Packages analysed with the file-level import graph, sorted by name. */
  fallbackPackages: string[];
}

function packageNode(root: string, pkg: PackageInfo): Node {
  let version: unknown;
  try {
    version = (
      JSON.parse(
        readFileSync(join(root, pkg.root, "package.json"), "utf8"),
      ) as { version?: unknown }
    ).version;
  } catch {
    version = undefined;
  }
  const manifest =
    pkg.root === "." ? "package.json" : `${pkg.root}/package.json`;
  return {
    id: `package:${pkg.name}`,
    kind: "package",
    name: pkg.name,
    language: "typescript",
    framework: "node",
    package: `package:${pkg.name}`,
    module: null,
    source: { file: manifest, line: 1 },
    extractor: "core",
    confidence: "certain",
    meta: {
      root: pkg.root,
      ...(typeof version === "string" ? { version } : {}),
    },
  };
}

/**
 * The whole analysis: discover packages, run extractors, assemble and validate the graph.
 * Throws `DuplicatePackageNameError` for a bad package set and `GraphValidationError` if the
 * assembled graph breaks the schema invariants (a bug, never the analysed code).
 */
export async function analyzeRepo(
  root: string,
  config: Config,
  opts: AnalyzeRepoOptions,
): Promise<AnalyzeRepoResult> {
  const { packages, report: discovered } = discoverPackages(root, config);
  const results = await analyzePackages(root, packages, opts);

  const nodes: Node[] = [...packages.map((p) => packageNode(root, p))];
  const edges: Edge[] = [];
  for (const r of results) {
    nodes.push(...r.nodes);
    edges.push(...r.edges);
  }

  // ADR 0011: facts become edges once every extractor has finished.
  const link = resolveAccessFacts(
    results.flatMap((r) => r.facts),
    nodes,
  );
  edges.push(...link.edges);

  // A file import whose target was excluded or not analysed has no node to point at.
  const ids = new Set(nodes.map((n) => n.id));
  const builder = new GraphBuilder();
  for (const n of nodes) builder.addNode(n);
  for (const e of edges) {
    if (e.kind === "imports" && !(ids.has(e.from) && ids.has(e.to))) continue;
    builder.addEdge(e);
  }

  return {
    graph: builder.build({
      generatorVersion: opts.generatorVersion,
      ...(opts.commit ? { commit: opts.commit } : {}),
    }),
    report: collectReport(results, discovered, link),
    fallbackPackages: results.filter((r) => r.fallback).map((r) => r.package),
  };
}
