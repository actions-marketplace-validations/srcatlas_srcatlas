import { z } from "zod";
import { Site } from "./schema.js";

/** docs/schema.md section 11. */
export interface ReportEntry {
  level: "error" | "warning" | "info";
  /** Stable machine-readable code, catalogued in the extractor's document. */
  code: string;
  message: string;
  extractor: string;
  site?: Site;
}

type Level = "error" | "warning" | "info";
const e = (level: Level, unresolved = false) => ({ level, unresolved });

/**
 * Every report code and its level (docs/report.md section 2). A test keeps this equal to the
 * code tables in docs/report.md and docs/extractors/*.md. `unresolved` marks a construct that
 * was noticed but could not be named or followed; `--strict` counts those.
 */
export const REPORT_CODES = {
  "core.parse-error": e("error"),
  "core.file-too-large": e("warning"),
  "core.extractor-failed": e("error"),
  "core.package-failed": e("error"),
  "core.unknown-extractor": e("warning"),

  "nest.unresolved-dynamic-module": e("warning", true),
  "nest.unresolved-provider-token": e("warning", true),
  "nest.ambiguous-token": e("warning"),
  "nest.unresolved-scope": e("info", true),
  "nest.module-ref-lookup": e("info"),
  "nest.unregistered-provider": e("info"),
  "nest.unresolved-prefix": e("warning", true),
  "nest.unresolved-exclude": e("info", true),
  "nest.ambiguous-app": e("warning"),
  "nest.non-uri-versioning": e("info"),
  "nest.unnamed-enhancer": e("info"),
  "nest.global-enhancer-ignored": e("info"),
  "nest.duplicate-route": e("warning"),
  "nest.unregistered-controller": e("warning"),
  "nest.microservice-pattern-ignored": e("info"),
  "nest.unresolved-event-name": e("info", true),
  "nest.unregistered-gateway": e("warning"),
  "nest.unresolved-job-name": e("info", true),

  "prisma.schema-parse-error": e("error"),
  "prisma.duplicate-model": e("error"),
  "prisma.no-schema-found": e("info"),
  "prisma.unknown-model-access": e("warning", true),
  "prisma.ambiguous-model": e("warning"),
  "prisma.unknown-operation": e("info"),
  "prisma.raw-query": e("info"),
  "prisma.dynamic-model-access": e("warning", true),
  "prisma.access-outside-node": e("info"),
} as const;

export type ReportCode = keyof typeof REPORT_CODES;

const isKnown = (code: string): code is ReportCode => code in REPORT_CODES;

export const ReportFile = z.strictObject({
  reportVersion: z.literal(1),
  counts: z.strictObject({
    errors: z.number().int().min(0),
    warnings: z.number().int().min(0),
    infos: z.number().int().min(0),
    parseErrors: z.number().int().min(0),
    unresolved: z.number().int().min(0),
  }),
  entries: z.array(
    z.strictObject({
      level: z.enum(["error", "warning", "info"]),
      code: z.string(),
      message: z.string(),
      extractor: z.string(),
      site: Site.optional(),
    }),
  ),
  summary: z.record(z.string(), z.number()),
  timings: z.record(z.string(), z.record(z.string(), z.number())),
});
export type ReportFile = z.infer<typeof ReportFile>;

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function compareEntries(a: ReportEntry, b: ReportEntry): number {
  return (
    cmp(a.extractor, b.extractor) ||
    cmp(a.code, b.code) ||
    cmp(a.site?.file ?? "", b.site?.file ?? "") ||
    (a.site?.line ?? 0) - (b.site?.line ?? 0) ||
    cmp(a.message, b.message)
  );
}

/**
 * Builds the report file: sorted entries and counts. Unknown codes are kept and counted by
 * level only, since extractors from outside the repository may add codes.
 */
export function buildReport(
  entries: ReportEntry[],
  timings: Record<string, Record<string, number>>,
  summary: Record<string, number> = {},
): ReportFile {
  const counts = {
    errors: 0,
    warnings: 0,
    infos: 0,
    parseErrors: 0,
    unresolved: 0,
  };
  for (const x of entries) {
    if (x.level === "error") counts.errors++;
    else if (x.level === "warning") counts.warnings++;
    else counts.infos++;
    if (x.code === "core.parse-error") counts.parseErrors++;
    if (isKnown(x.code) && REPORT_CODES[x.code].unresolved) counts.unresolved++;
  }
  return {
    reportVersion: 1,
    counts,
    entries: [...entries].sort(compareEntries),
    summary,
    timings,
  };
}
