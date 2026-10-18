import type { DiffFile } from "@srcatlas/core";

export type SummaryCounts = DiffFile["summary"] & {
  crossModuleEdges?: number;
  newCycles?: number;
};

const signed = (n: number): string => (n > 0 ? `+${n}` : `${n}`);
const plural = (n: number, noun: string): string =>
  Math.abs(n) === 1 ? noun : `${noun}s`;

/** The fixed one-line summary (docs/schema.md section 13.2). */
export function formatSummary(s: SummaryCounts): string {
  const parts = [
    `${signed(s.modules)} ${plural(s.modules, "module")}`,
    `${signed(s.routes)} ${plural(s.routes, "route")}`,
  ];
  if (s.crossModuleEdges !== undefined) {
    parts.push(
      `${signed(s.crossModuleEdges)} cross-module ${plural(s.crossModuleEdges, "edge")}`,
    );
  }
  if (s.newCycles !== undefined) {
    parts.push(`${s.newCycles} new ${plural(s.newCycles, "cycle")}`);
  }
  return parts.join(", ");
}
