import { z } from "zod";
import type { ReportEntry } from "./report.js";
import { type Edge, type Node, Site } from "./schema.js";

/**
 * An observation that needs another extractor's nodes to become an edge (ADR 0011).
 * Internal to the analyser: never written to the graph file.
 */
export const AccessFact = z.strictObject({
  kind: z.literal("access"),
  extractor: z.literal("prisma"),
  /** Package name of the caller, used to find the schemas visible to it. */
  package: z.string(),
  callerFile: z.string(),
  callerName: z.string(),
  delegate: z.string(),
  operation: z.string(),
  site: Site,
  proof: z.enum(["type", "name"]),
});
export type AccessFact = z.infer<typeof AccessFact>;

/** One variant today; add others to this union. */
export const Fact = AccessFact;
export type Fact = AccessFact;

export interface ExtractorResult {
  nodes: Node[];
  edges: Edge[];
  facts: Fact[];
  report: ReportEntry[];
  /** Counters for things noticed and deliberately not reported one by one (docs/report.md). */
  summary?: Record<string, number>;
}

/** The package an extractor is run on. Paths are repository-relative with `/` separators. */
export interface ExtractorPackage {
  name: string;
  root: string;
  tsconfig: string | null;
  files: string[];
}

/**
 * `Project` is the ts-morph project type. It is a parameter so that core stays free of
 * dependencies; extractor packages instantiate it with `import("ts-morph").Project`.
 */
export interface ExtractorContext<Project = unknown> {
  /** Absolute repository root. For reading files only; never put it in output. */
  root: string;
  package: ExtractorPackage;
  project: Project;
  /** Absolute path to repository-relative path with `/` separators. */
  relative(absolutePath: string): string;
}

export interface Extractor<Project = unknown> {
  /** Name used in `extractors` config and as `extractor` on nodes and edges. */
  name: string;
  /** Whether to run on a package when `extractors` is not configured. */
  detect(packageJson: Record<string, unknown> | null): boolean;
  extract(
    ctx: ExtractorContext<Project>,
  ): ExtractorResult | Promise<ExtractorResult>;
}
