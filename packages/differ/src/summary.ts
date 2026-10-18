import type { DiffFile } from "@srcatlas/core";

export type SummaryCounts = DiffFile["summary"] & {
  crossModuleEdges?: number;
  newCycles?: number;
};

/** The fixed one-line summary (docs/schema.md section 13.2). */
export function formatSummary(_summary: SummaryCounts): string {
  throw new Error("not implemented");
}
