import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import { readClientUsage } from "./client-usage.js";

// docs/extractors/prisma.md PR-C1 to PR-C5 on in-memory sources.

function usage(files: Record<string, string>, outputs: string[] = []) {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, text] of Object.entries(files)) {
    project.createSourceFile(path, text);
  }
  return readClientUsage({
    pkg: "p",
    project,
    relative: (p) => p.replace(/^\//, ""),
    outputs,
  });
}

const CALL =
  "export class S { constructor(private c: C) {} f() { return this.c.order.findMany(); } }";

describe("readClientUsage", () => {
  it("follows a re-export of PrismaClient through a barrel in the repository", () => {
    const out = usage({
      "/src/db.ts": "export { PrismaClient } from '@prisma/client';",
      "/src/s.ts": `import { PrismaClient } from './db';\nclass C extends PrismaClient {}\n${CALL}`,
    });
    expect(out.facts.map((f) => [f.delegate, f.proof])).toEqual([
      ["order", "type"],
    ]);
  });

  it("a class extending an imported class that is not PrismaClient is not a client", () => {
    const out = usage({
      "/src/s.ts": `import { PrismaClient } from 'other-lib';\nclass C extends PrismaClient {}\n${CALL}`,
    });
    expect(out.facts).toEqual([]);
  });

  it("a generator output path proves PrismaClient, in a subdirectory too", () => {
    const out = usage(
      {
        "/src/app/s.ts": `import { PrismaClient } from '../generated/prisma/client';\nclass C extends PrismaClient {}\n${CALL}`,
      },
      ["src/generated/prisma"],
    );
    expect(out.facts).toHaveLength(1);
  });

  it("a call in top-level code has an empty caller name", () => {
    const out = usage({
      "/src/s.ts":
        "import { PrismaClient } from '@prisma/client';\nconst prisma = new PrismaClient();\nprisma.order.count();",
    });
    expect(out.facts.map((f) => [f.callerName, f.operation])).toEqual([
      ["", "count"],
    ]);
  });
});
