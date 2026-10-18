import { z } from "zod";
import { EDGE_KINDS, NODE_KINDS } from "./schema.js";

// Source of truth: docs/config.md section 2. Every object is strict: unknown
// keys are errors (section 1). Option blocks for bullmq and socketio wait for
// their extractor docs.

const strings = z.array(z.string());
const nodeKind = z.enum(NODE_KINDS as [string, ...string[]]);
const edgeKind = z.enum(EDGE_KINDS);
const severity = z.enum(["error", "warn"]);
const confidence = z.enum(["certain", "inferred", "unresolved"]);

const Selector = z.strictObject({
  kind: z.union([nodeKind, z.array(nodeKind)]).optional(),
  package: z.string().optional(),
  module: z.string().optional(),
  file: z.string().optional(),
  role: z.string().optional(),
});

const ruleBase = {
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "expected kebab-case"),
  severity: severity.optional(),
  message: z.string().optional(),
  minConfidence: confidence.optional(),
};

export const Rule = z.discriminatedUnion("type", [
  z.strictObject({
    ...ruleBase,
    type: z.literal("forbidden-edge"),
    from: Selector,
    to: Selector,
    edgeKinds: z.array(edgeKind).optional(),
    except: z
      .array(
        z.strictObject({
          from: z.string().optional(),
          to: z.string().optional(),
        }),
      )
      .optional(),
  }),
  z.strictObject({
    ...ruleBase,
    type: z.literal("no-cycles"),
    over: z.enum(["modules", "packages"]),
  }),
  z.strictObject({
    ...ruleBase,
    type: z.literal("max-fan-out"),
    of: Selector,
    edgeKinds: z.array(edgeKind),
    max: z.number().int().min(0),
  }),
  z.strictObject({
    ...ruleBase,
    type: z.literal("layering"),
    layers: z.array(Selector).min(2),
    allowSkip: z.boolean().optional(),
  }),
]);
export type Rule = z.infer<typeof Rule>;

const extractorName = z.enum([
  "nestjs",
  "prisma",
  "nextjs",
  "bullmq",
  "socketio",
]);

const PackageConfig = z.strictObject({
  path: z.string().min(1),
  name: z.string().min(1).optional(),
  tsconfig: z.string().optional(),
  extractors: z.array(extractorName).optional(),
  include: strings.optional(),
  exclude: strings.optional(),
});

const Versioning = z.strictObject({
  type: z.enum(["uri", "header", "media-type", "custom"]),
  prefix: z.string().optional(),
  defaultVersion: z.string().optional(),
});

const Extractors = z.strictObject({
  nestjs: z
    .strictObject({
      globalPrefix: z.string().optional(),
      globalPrefixExclude: strings.optional(),
      versioning: Versioning.optional(),
      entryFiles: strings.optional(),
    })
    .optional(),
  prisma: z
    .strictObject({
      schema: z.union([z.string(), strings]).optional(),
      clientNames: strings.optional(),
    })
    .optional(),
  nextjs: z
    .strictObject({
      appDir: z.string().optional(),
      basePath: z.string().optional(),
    })
    .optional(),
});

const Annotations = z.strictObject({
  edges: z
    .array(
      z.strictObject({
        from: z.string(),
        kind: edgeKind,
        to: z.string(),
        reason: z.string().min(1),
      }),
    )
    .optional(),
  // Reserved: v1 allows edges between existing nodes only.
  nodes: z.array(z.never()).optional(),
});

const Embed = z.strictObject({
  scope: z
    .union([
      z.literal("all"),
      z.strictObject({ module: z.string() }),
      z.strictObject({ trace: z.string() }),
    ])
    .optional(),
  output: z.string().optional(),
  theme: z.enum(["light", "dark", "auto"]).optional(),
  width: z.number().int().positive().optional(),
  badge: z.union([z.boolean(), z.string()]).optional(),
});

const Analysis = z.strictObject({
  workers: z.number().int().positive().optional(),
  strict: z.boolean().optional(),
  maxFileSizeKb: z.number().int().positive().optional(),
  followSymlinks: z.boolean().optional(),
  includeTests: z.boolean().optional(),
});

function duplicates(xs: (string | undefined)[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const x of xs) {
    if (x === undefined) continue;
    if (seen.has(x)) dup.add(x);
    seen.add(x);
  }
  return [...dup];
}

export const Config = z
  .strictObject({
    repository: z.string().optional(),
    defaultBranch: z.string().optional(),
    outDir: z.string().optional(),
    packages: z.array(z.union([z.string().min(1), PackageConfig])).optional(),
    include: strings.optional(),
    exclude: strings.optional(),
    extractors: Extractors.optional(),
    rules: z.array(Rule).optional(),
    annotations: Annotations.optional(),
    embed: Embed.optional(),
    analysis: Analysis.optional(),
  })
  .superRefine((c, ctx) => {
    for (const id of duplicates((c.rules ?? []).map((r) => r.id))) {
      ctx.addIssue({
        code: "custom",
        path: ["rules"],
        message: `duplicate rule id "${id}"`,
      });
    }
    const names = (c.packages ?? []).map((p) =>
      typeof p === "string" ? undefined : p.name,
    );
    for (const n of duplicates(names)) {
      ctx.addIssue({
        code: "custom",
        path: ["packages"],
        message: `duplicate package name "${n}"`,
      });
    }
  });
export type Config = z.infer<typeof Config>;

/** Identity function that types a `srcatlas.config.ts` default export. */
export const defineConfig = (config: Config): Config => config;

export type ConfigResult =
  | { ok: true; config: Config }
  | { ok: false; errors: string[] };

/** Validates an untrusted config value. Errors read like `rules[2].to.module: expected string`. */
export function parseConfig(input: unknown): ConfigResult {
  const r = Config.safeParse(input);
  if (r.success) return { ok: true, config: r.data };
  return {
    ok: false,
    errors: r.error.issues.map((i) => {
      const path = i.path.reduce<string>(
        (s, k) =>
          typeof k === "number"
            ? `${s}[${k}]`
            : s
              ? `${s}.${String(k)}`
              : String(k),
        "",
      );
      return `${path || "(config)"}: ${i.message}`;
    }),
  };
}
