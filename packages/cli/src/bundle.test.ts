import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { fixturePath } from "@srcatlas/core/testing";
import { describe, expect, it } from "vitest";

const bin = fileURLToPath(new URL("../dist/bin.js", import.meta.url));

// The published package is one bundle, so the worker thread must be emitted next to it.
// CI builds before it tests; locally this needs `pnpm build` first.
describe.skipIf(!existsSync(bin))("bundled CLI", () => {
  it("runs analyze end to end, including the worker threads", () => {
    const dir = mkdtempSync(join(tmpdir(), "srcatlas-bundle-"));
    try {
      cpSync(fixturePath("analyzer-pnpm"), dir, { recursive: true });
      execFileSync(process.execPath, [bin, "analyze"], { cwd: dir });
      const graph = JSON.parse(
        readFileSync(join(dir, ".srcatlas", "srcatlas.graph.json"), "utf8"),
      );
      expect(graph.nodes).toHaveLength(4);
      expect(
        existsSync(
          join(fileURLToPath(new URL("../dist", import.meta.url)), "worker.js"),
        ),
      ).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
