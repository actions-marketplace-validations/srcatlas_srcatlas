import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import { prismaExtractor } from "./extractor.js";
import { parseSchema } from "./parse-schema.js";

// Behaviour that the golden fixtures do not cover: the single-file location, CRLF, detection.

function run(files: Record<string, string>, packageRoot = ".") {
  const root = mkdtempSync(join(tmpdir(), "srcatlas-prisma-"));
  try {
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(join(root, path, ".."), { recursive: true });
      writeFileSync(join(root, path), text);
    }
    return prismaExtractor.extract({
      root,
      package: { name: "p", root: packageRoot, tsconfig: null, files: [] },
      project: new Project({ useInMemoryFileSystem: true }),
      relative: (p) => p,
    }) as import("@srcatlas/core").ExtractorResult;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("prisma extractor", () => {
  it("reads prisma/schema.prisma, with CRLF line endings, in a package below the root", () => {
    const out = run(
      {
        "apps/api/prisma/schema.prisma":
          "model Tag {\r\n  id Int @id\r\n  label String\r\n}\r\n",
      },
      "apps/api",
    );
    expect(out.nodes.map((n) => [n.id, n.source, n.meta])).toEqual([
      [
        "model:p/Tag",
        { file: "apps/api/prisma/schema.prisma", line: 1 },
        { fieldCount: 2, schemaFile: "apps/api/prisma/schema.prisma" },
      ],
    ]);
  });

  it("emits nothing without a schema file", () => {
    expect(run({ "package.json": "{}" }).nodes).toEqual([]);
  });

  it("a model opened and closed on its header line is reported, not counted", () => {
    const out = run({ "prisma/schema.prisma": "model Odd { id Int }\n" });
    expect(out.nodes).toEqual([]);
    expect(out.report).toEqual([
      expect.objectContaining({
        code: "prisma.schema-parse-error",
        site: { file: "prisma/schema.prisma", line: 1 },
      }),
    ]);
  });

  it("detects Prisma from prisma or @prisma/client in any dependency field", () => {
    expect(prismaExtractor.detect({ devDependencies: { prisma: "5" } })).toBe(
      true,
    );
    expect(
      prismaExtractor.detect({ peerDependencies: { "@prisma/client": "5" } }),
    ).toBe(true);
    expect(prismaExtractor.detect({ dependencies: { express: "4" } })).toBe(
      false,
    );
    expect(prismaExtractor.detect(null)).toBe(false);
  });
});

describe("parseSchema", () => {
  it("an escaped quote does not end a string", () => {
    const { blocks } = parseSchema(
      'model A {\n  a String @default("x\\" } model B {")\n}\n',
    );
    expect(blocks).toEqual([
      { kind: "model", name: "A", line: 1, fieldCount: 1 },
    ]);
  });
});
