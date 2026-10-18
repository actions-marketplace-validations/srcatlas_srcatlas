import { z } from "zod";
import { Edge, Node, SCHEMA_VERSION } from "./schema.js";

// Source of truth: docs/schema.md section 13.1.

const repoRef = z.object({
  commit: z
    .string()
    .regex(/^[0-9a-f]{40}$/)
    .optional(),
});

const count = z.number().int();

export const DiffFile = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  base: repoRef,
  head: repoRef,
  summary: z.object({
    modules: count,
    routes: count,
    crossModuleEdges: count,
    newCycles: count,
  }),
  nodes: z.object({
    added: z.array(Node),
    removed: z.array(Node),
    changed: z.array(z.object({ before: Node, after: Node })),
    moved: z.array(z.object({ from: Node, to: Node })),
  }),
  edges: z.object({
    added: z.array(Edge),
    removed: z.array(Edge),
    changed: z.array(z.object({ before: Edge, after: Edge })),
  }),
  crossModuleEdges: z.array(Edge),
  cycles: z.array(
    z.object({
      kind: z.enum(["modules", "packages"]),
      members: z.array(z.string()),
    }),
  ),
});
export type DiffFile = z.infer<typeof DiffFile>;
