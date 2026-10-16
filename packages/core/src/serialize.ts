import type { GraphFile } from "./schema.js";
import { cmp } from "./validate.js";

export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [k: string]: Json };

/** Object keys in code-unit order at every depth (schema section 9). Arrays keep their order. */
export function sortKeys(v: Json): Json {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v === null || typeof v !== "object") return v;
  const out: { [k: string]: Json } = {};
  for (const k of Object.keys(v).sort(cmp)) out[k] = sortKeys(v[k] as Json);
  return out;
}

/** The canonical graph file bytes: sorted keys, 2-space indent, `\n`, one trailing newline. */
export function serializeGraph(graph: GraphFile): string {
  return `${JSON.stringify(sortKeys(graph as unknown as Json), null, 2)}\n`;
}
