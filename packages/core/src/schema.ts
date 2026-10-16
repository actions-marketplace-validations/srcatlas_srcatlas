import { z } from "zod";

// Source of truth: docs/schema.md sections 2-7. Structure only; cross-element
// invariants (section 10) live in validateGraph.

export const SCHEMA_VERSION = 1;

export const Site = z.object({
  file: z.string().min(1),
  line: z.number().int().min(1),
});
export type Site = z.infer<typeof Site>;

export const Confidence = z.enum(["certain", "inferred", "unresolved"]);
export type Confidence = z.infer<typeof Confidence>;

const strings = z.array(z.string());
// Unknown meta keys must survive (section 4: consumers ignore, not strip).
const meta = <T extends z.core.$ZodLooseShape>(shape: T) =>
  z.looseObject(shape);

const HTTP_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
  "ALL",
  "PAGE",
] as const;

/** Required and optional `meta` per node kind (section 4 table). */
export const NODE_META = {
  package: meta({ root: z.string(), version: z.string().optional() }),
  module: meta({
    dynamic: z.boolean(),
    global: z.boolean(),
    routeGroup: z.string().optional(),
  }),
  provider: meta({
    providerType: z.enum(["class", "value", "factory", "existing"]),
    scope: z.enum(["default", "request", "transient"]),
    role: z.enum([
      "service",
      "processor",
      "guard",
      "interceptor",
      "pipe",
      "filter",
      "other",
    ]),
    token: z.string().optional(),
  }),
  controller: meta({ basePath: z.string(), version: z.string().optional() }),
  route: meta({
    method: z.enum(HTTP_METHODS),
    path: z.string(),
    type: z.enum(["handler", "page"]),
    version: z.string().optional(),
    handlerName: z.string().optional(),
    guards: strings.optional(),
    interceptors: strings.optional(),
    pipes: strings.optional(),
    filters: strings.optional(),
    optionalCatchAll: z.boolean().optional(),
  }),
  action: meta({ exportName: z.string() }),
  model: meta({
    fieldCount: z.number().int().min(0),
    schemaFile: z.string().optional(),
  }),
  queue: meta({ name: z.string(), library: z.enum(["bullmq", "bull"]) }),
  gateway: meta({ namespace: z.string(), port: z.number().int().optional() }),
  event: meta({ namespace: z.string(), name: z.string() }),
  external: meta({ name: z.string(), via: z.enum(["sdk", "http"]).optional() }),
  file: meta({ path: z.string() }),
} as const;

export const NODE_KINDS = Object.keys(NODE_META) as NodeKind[];
export type NodeKind = keyof typeof NODE_META;

export const EDGE_KINDS = [
  "contains",
  "imports",
  "exports",
  "depends_on",
  "injects",
  "handles",
  "calls",
  "reads",
  "writes",
  "enqueues",
  "consumes",
  "emits",
  "listens",
  "uses_external",
] as const;
export type EdgeKind = (typeof EDGE_KINDS)[number];

const nodeBase = {
  id: z.string().min(1),
  name: z.string(),
  language: z.string(),
  framework: z.string(),
  package: z.string().min(1),
  module: z.string().min(1).nullable(),
  source: Site.nullable(),
  extractor: z.string().min(1),
  confidence: Confidence,
};

const knownNodes = NODE_KINDS.map((kind) =>
  z.object({ ...nodeBase, kind: z.literal(kind), meta: NODE_META[kind] }),
);

// Section 12: unknown kinds are generic nodes. A known kind with bad meta must
// fail, not fall through to this branch, hence the refine.
const genericNode = z.object({
  ...nodeBase,
  kind: z
    .string()
    .min(1)
    .refine((k) => !(k in NODE_META), "known kind with invalid meta"),
  meta: z.record(z.string(), z.json()),
});

export const Node = z.union([...knownNodes, genericNode]);
export type Node = z.infer<typeof Node>;

export const Edge = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  kind: z.string().min(1),
  sites: z.array(Site),
  extractor: z.string().min(1),
  confidence: Confidence,
  meta: z.record(z.string(), z.json()),
});
export type Edge = z.infer<typeof Edge>;

export const GraphFile = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  generator: z.object({
    name: z.literal("srcatlas"),
    version: z.string().min(1),
  }),
  repo: z.object({
    commit: z
      .string()
      .regex(/^[0-9a-f]{40}$/)
      .optional(),
  }),
  nodes: z.array(Node),
  edges: z.array(Edge),
});
export type GraphFile = z.infer<typeof GraphFile>;

/** JSON Schema for the graph file, for non-TypeScript consumers. */
export function graphJsonSchema(): unknown {
  return z.toJSONSchema(GraphFile, { io: "input" });
}
