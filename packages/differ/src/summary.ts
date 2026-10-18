import type { DiffFile } from "@srcatlas/core";

const signed = (n: number): string => (n > 0 ? `+${n}` : `${n}`);
const plural = (n: number, noun: string): string =>
  Math.abs(n) === 1 ? noun : `${noun}s`;

/** The fixed one-line summary (docs/schema.md section 13.2). */
export function formatSummary(s: DiffFile["summary"]): string {
  return [
    `${signed(s.modules)} ${plural(s.modules, "module")}`,
    `${signed(s.routes)} ${plural(s.routes, "route")}`,
    `${signed(s.crossModuleEdges)} cross-module ${plural(s.crossModuleEdges, "edge")}`,
    `${s.newCycles} new ${plural(s.newCycles, "cycle")}`,
  ].join(", ");
}
