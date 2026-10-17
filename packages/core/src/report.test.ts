import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildReport, REPORT_CODES, type ReportEntry } from "./report.js";
import { fixturePath } from "./testing.js";

const docs = join(fixturePath("."), "..", "docs");

/** Rows of the form "| `code` | level |" in docs/report.md and docs/extractors/*.md. */
function documentedCodes(): Map<string, string> {
  const files = [
    join(docs, "report.md"),
    ...readdirSync(join(docs, "extractors"))
      .filter((f) => f.endsWith(".md"))
      .map((f) => join(docs, "extractors", f)),
  ];
  const out = new Map<string, string>();
  for (const file of files) {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const m =
        /^\|\s*`([a-z]+\.[a-z-]+)`\s*\|\s*(error|warning|info)\s*\|/.exec(line);
      if (!m?.[1] || !m[2]) continue;
      const prev = out.get(m[1]);
      if (prev !== undefined && prev !== m[2]) {
        throw new Error(`${m[1]} is documented with two levels`);
      }
      out.set(m[1], m[2]);
    }
  }
  return out;
}

describe("REPORT_CODES", () => {
  it("matches the documented codes and levels exactly", () => {
    const registry = new Map(
      Object.entries(REPORT_CODES).map(([code, v]) => [code, v.level]),
    );
    expect(registry).toEqual(documentedCodes());
  });

  it("marks the *.unresolved-* codes and the Prisma unnameable-model codes as unresolved constructs", () => {
    const marked = Object.entries(REPORT_CODES)
      .filter(([, v]) => "unresolved" in v && v.unresolved)
      .map(([code]) => code)
      .sort();
    expect(marked).toEqual(
      Object.keys(REPORT_CODES)
        .filter(
          (c) =>
            c.startsWith("nest.unresolved-") ||
            c === "prisma.unknown-model-access" ||
            c === "prisma.dynamic-model-access",
        )
        .sort(),
    );
    expect(marked.length).toBeGreaterThan(0);
  });
});

const entry = (over: Partial<ReportEntry>): ReportEntry => ({
  level: "info",
  code: "x.y",
  message: "m",
  extractor: "x",
  ...over,
});

describe("buildReport", () => {
  it("counts by level, parse errors and unresolved constructs", () => {
    const report = buildReport(
      [
        entry({ level: "error", code: "core.parse-error", extractor: "core" }),
        entry({ level: "error", code: "core.parse-error", extractor: "core" }),
        entry({
          level: "warning",
          code: "nest.unresolved-prefix",
          extractor: "nestjs",
        }),
        entry({
          level: "warning",
          code: "nest.ambiguous-token",
          extractor: "nestjs",
        }),
        entry({ level: "info", code: "third.party-code" }),
      ],
      {},
    );
    expect(report.reportVersion).toBe(1);
    expect(report.counts).toEqual({
      errors: 2,
      warnings: 2,
      infos: 1,
      parseErrors: 2,
      unresolved: 1,
    });
  });

  it("sorts entries by extractor, code, file, line, message in code-unit order", () => {
    const e = (
      extractor: string,
      code: string,
      file: string | undefined,
      line: number,
      message: string,
    ) =>
      entry({
        extractor,
        code,
        message,
        ...(file ? { site: { file, line } } : {}),
      });
    const input = [
      e("nestjs", "nest.b", "z.ts", 1, "m"),
      e("core", "core.parse-error", "b.ts", 10, "m"),
      e("core", "core.parse-error", "b.ts", 2, "m"),
      e("core", "core.parse-error", "B.ts", 5, "m"),
      e("core", "core.parse-error", undefined, 0, "m"),
      e("nestjs", "nest.a", "z.ts", 1, "m"),
    ];
    const keys = buildReport(input, {}).entries.map(
      (x) =>
        `${x.extractor} ${x.code} ${x.site?.file ?? "-"}:${x.site?.line ?? 0}`,
    );
    expect(keys).toEqual([
      "core core.parse-error -:0",
      "core core.parse-error B.ts:5",
      "core core.parse-error b.ts:2",
      "core core.parse-error b.ts:10",
      "nestjs nest.a z.ts:1",
      "nestjs nest.b z.ts:1",
    ]);
  });

  it("passes timings through", () => {
    expect(buildReport([], { api: { nestjs: 12 } }).timings).toEqual({
      api: { nestjs: 12 },
    });
  });
});
