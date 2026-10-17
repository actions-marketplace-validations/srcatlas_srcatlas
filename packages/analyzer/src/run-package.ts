import { relative } from "node:path";
import {
  type Extractor,
  type ExtractorResult,
  Fact,
  type ReportCode,
  type ReportEntry,
} from "@srcatlas/core";
import type { Project } from "ts-morph";
import { createProject } from "./create-project.js";
import type { PackageInfo } from "./discover-packages.js";

export interface PackageTask {
  /** Absolute repository root. */
  root: string;
  package: PackageInfo;
  /** Names of the extractors to run. */
  extractors: string[];
}

export interface PackageResult extends ExtractorResult {
  package: string;
  /** Milliseconds per extractor. Report file only: it is not deterministic. */
  timings: Record<string, number>;
}

const messageOf = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

/** Drops files with syntax errors from the project and reports each one, so a bad file never aborts analysis. */
function dropUnparsable(
  project: Project,
  rel: (abs: string) => string,
): ReportEntry[] {
  const report: ReportEntry[] = [];
  const program = project.getProgram();
  for (const sf of project.getSourceFiles()) {
    const [first] = program.getSyntacticDiagnostics(sf);
    if (!first) continue;
    const text = first.getMessageText();
    report.push({
      level: "error",
      code: "core.parse-error" satisfies ReportCode,
      message: typeof text === "string" ? text : text.getMessageText(),
      extractor: "core",
      site: { file: rel(sf.getFilePath()), line: first.getLineNumber() ?? 1 },
    });
    project.removeSourceFile(sf);
  }
  return report;
}

/**
 * Runs the requested extractors on one package. An unparsable file or a failing extractor
 * becomes a report entry; nothing here throws for problems in the analysed code.
 */
export async function runPackage(
  task: PackageTask,
  available: Extractor<Project>[],
): Promise<PackageResult> {
  const rel = (abs: string): string =>
    relative(task.root, abs).replaceAll("\\", "/");
  const project = createProject(task.root, task.package);
  const result: PackageResult = {
    package: task.package.name,
    nodes: [],
    edges: [],
    facts: [],
    report: dropUnparsable(project, rel),
    timings: {},
  };

  for (const name of task.extractors) {
    const extractor = available.find((x) => x.name === name);
    if (!extractor) {
      result.report.push({
        level: "warning",
        code: "core.unknown-extractor" satisfies ReportCode,
        message: `extractor "${name}" is not available`,
        extractor: "core",
      });
      continue;
    }
    const started = performance.now();
    try {
      const out = await extractor.extract({
        root: task.root,
        package: task.package,
        project,
        relative: rel,
      });
      // Parsed before anything is merged, so malformed output counts as a failure.
      const facts = out.facts.map((f) => Fact.parse(f));
      result.nodes.push(...out.nodes);
      result.edges.push(...out.edges);
      result.facts.push(...facts);
      result.report.push(...out.report);
    } catch (e) {
      result.report.push({
        level: "error",
        code: "core.extractor-failed" satisfies ReportCode,
        message: `extractor failed: ${messageOf(e)}`,
        extractor: name,
      });
    }
    result.timings[name] = Math.round(performance.now() - started);
  }
  return result;
}
