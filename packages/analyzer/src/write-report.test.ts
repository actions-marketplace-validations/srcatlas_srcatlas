import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ReportFile } from "@srcatlas/core";
import { describe, expect, it } from "vitest";
import type { PackageResult } from "./run-package.js";
import { collectReport, writeReportFile } from "./write-report.js";

const result = (over: Partial<PackageResult>): PackageResult => ({
  package: "api",
  nodes: [],
  edges: [],
  facts: [],
  report: [],
  timings: {},
  ...over,
});

describe("collectReport", () => {
  it("merges package entries, discovery entries and timings", () => {
    const report = collectReport(
      [
        result({
          package: "a",
          report: [
            {
              level: "error",
              code: "core.parse-error",
              message: "x",
              extractor: "core",
              site: { file: "a/x.ts", line: 1 },
            },
          ],
          timings: { nestjs: 5 },
        }),
        result({ package: "b", timings: { prisma: 7 } }),
      ],
      [{ code: "core.file-too-large", file: "b/big.ts" }],
    );
    expect(report.counts).toMatchObject({
      errors: 1,
      warnings: 1,
      parseErrors: 1,
    });
    expect(report.entries).toContainEqual(
      expect.objectContaining({
        level: "warning",
        code: "core.file-too-large",
        extractor: "core",
        site: { file: "b/big.ts", line: 1 },
      }),
    );
    expect(report.timings).toEqual({ a: { nestjs: 5 }, b: { prisma: 7 } });
  });
});

describe("writeReportFile", () => {
  it("creates missing directories and writes valid JSON with a trailing newline", () => {
    const dir = mkdtempSync(join(tmpdir(), "srcatlas-report-"));
    try {
      const file = join(dir, "nested", ".srcatlas", "srcatlas.report.json");
      writeReportFile(file, collectReport([result({})], []));
      const text = readFileSync(file, "utf8");
      expect(text.endsWith("\n")).toBe(true);
      expect(ReportFile.parse(JSON.parse(text)).reportVersion).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
