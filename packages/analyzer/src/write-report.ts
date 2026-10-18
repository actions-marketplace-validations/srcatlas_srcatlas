import { buildReport, type ReportEntry, type ReportFile } from "@srcatlas/core";
import type { DiscoveryReportEntry } from "./discover-packages.js";
import type { PackageResult } from "./run-package.js";
import { writeOutputs } from "./write-outputs.js";

/** Merges package results and discovery entries into the report (docs/report.md). */
export function collectReport(
  results: PackageResult[],
  discovery: DiscoveryReportEntry[],
  link: { report: ReportEntry[]; summary: Record<string, number> } = {
    report: [],
    summary: {},
  },
): ReportFile {
  const entries: ReportEntry[] = [
    ...results.flatMap((r) => r.report),
    ...link.report,
  ];
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
  const summary: Record<string, number> = {};
  for (const counters of [
    ...results.map((r) => r.summary ?? {}),
    link.summary,
  ]) {
    for (const [key, n] of Object.entries(counters)) {
      summary[key] = (summary[key] ?? 0) + n;
    }
  }
  // Keys in code-unit order, so the file is the same whatever order packages finished in.
  const sorted = Object.fromEntries(
    Object.entries(summary).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
  return buildReport(entries, timings, sorted);
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
