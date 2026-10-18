import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  classId,
  type Extractor,
  type ExtractorContext,
  type ExtractorResult,
  type Node,
  type ReportEntry,
} from "@srcatlas/core";
import { parseSchema } from "./parse-schema.js";

const NAME = "prisma";
const DEPENDENCIES = ["dependencies", "devDependencies", "peerDependencies"];

const byCodeUnit = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0;

/** prisma.md 1.4: runs when `prisma` or `@prisma/client` is a dependency. */
function detect(packageJson: Record<string, unknown> | null): boolean {
  return DEPENDENCIES.some((field) => {
    const deps = packageJson?.[field];
    return (
      typeof deps === "object" &&
      deps !== null &&
      ("prisma" in deps || "@prisma/client" in deps)
    );
  });
}

/** Repository-relative schema files in code-unit order (prisma.md 1.4 and 2). */
function schemaFiles(root: string, packageRoot: string): string[] {
  const at = (path: string): string =>
    packageRoot === "." ? path : `${packageRoot}/${path}`;
  const files = ["prisma/schema.prisma"].map(at);
  const dir = at("prisma/schema");
  if (existsSync(join(root, dir))) {
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".prisma")) {
        files.push(`${dir}/${entry.name}`);
      }
    }
  }
  return files.filter((f) => existsSync(join(root, f))).sort(byCodeUnit);
}

function extract(ctx: ExtractorContext): ExtractorResult {
  const pkg = ctx.package.name;
  const nodes: Node[] = [];
  const report: ReportEntry[] = [];
  const seen = new Set<string>();

  for (const file of schemaFiles(ctx.root, ctx.package.root)) {
    const parsed = parseSchema(readFileSync(join(ctx.root, file), "utf8"));
    for (const m of parsed.malformed) {
      report.push({
        level: "error",
        code: "prisma.schema-parse-error",
        message: `${m.kind} ${m.name} could not be delimited`,
        extractor: NAME,
        site: { file, line: m.line },
      });
    }
    for (const b of parsed.blocks) {
      if (b.kind !== "model") continue; // PR-S4: other blocks produce no node
      if (seen.has(b.name)) {
        report.push({
          level: "error",
          code: "prisma.duplicate-model",
          message: `model ${b.name} is declared more than once`,
          extractor: NAME,
          site: { file, line: b.line },
        });
        continue;
      }
      seen.add(b.name);
      nodes.push({
        id: classId("model", pkg, b.name),
        kind: "model",
        name: b.name,
        language: "prisma",
        framework: "prisma",
        package: `package:${pkg}`,
        module: null,
        source: { file, line: b.line },
        extractor: NAME,
        confidence: "certain",
        meta: { fieldCount: b.fieldCount, schemaFile: file },
      });
    }
  }
  return { nodes, edges: [], facts: [], report };
}

export const prismaExtractor: Extractor = { name: NAME, detect, extract };
