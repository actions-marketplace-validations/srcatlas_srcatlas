import type { DiffFile } from "@srcatlas/core";

export interface MermaidOptions {
  /** Cap on nodes drawn. Default 40. */
  maxNodes?: number;
}

/** Mermaid flowchart of the changed neighbourhood of a diff (docs/cli.md section 3.4.1). */
export function renderMermaid(
  _diff: DiffFile,
  _opts: MermaidOptions = {},
): string {
  throw new Error("not implemented");
}
