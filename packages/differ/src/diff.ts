import type { DiffFile, GraphFile } from "@srcatlas/core";

/** Compares two valid graphs (docs/schema.md section 13). */
export function diffGraphs(_base: GraphFile, _head: GraphFile): DiffFile {
  throw new Error("not implemented");
}
