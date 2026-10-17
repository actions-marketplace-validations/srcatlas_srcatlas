import { buildReport, type ReportEntry, type ReportFile } from "@srcatlas/core";
import type { DiscoveryReportEntry } from "./discover-packages.js";
import type { PackageResult } from "./run-package.js";
import { writeOutputs } from "./write-outputs.js";

/** Merges package results and discovery entries into the report (docs/report.md). */
export function collectReport(
  results: PackageResult[],
  discovery: DiscoveryReportEntry[],
): ReportFile {
  const entries: ReportEntry[] = results.flatMap((r) => r.report);
  for (const d of discovery) {
    entries.push({
      level: "warning",
      code: d.code,
      message:
        "file is over the size limit (analysis.maxFileSizeKb) and was skipped",
      extractor: "core",
      site: { file: d.file, line: 1 },
    });
  }
  const timings: ReportFile["timings"] = {};
  for (const r of results) timings[r.package] = r.timings;
  return buildReport(entries, timings);
}

/** Writes the report atomically, creating the directory. */
export function writeReportFile(path: string, report: ReportFile): void {
  writeOutputs([
    {
      path,
      content: `${JSON.stringify(report, null, 2)}
`,
    },
  ]);
}
