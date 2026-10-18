import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DiffFile, GraphFile, serializeDiff } from "@srcatlas/core";
import { fixturePath } from "@srcatlas/core/testing";
import { afterEach, describe, expect, it } from "vitest";
import { run } from "./main.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function copyOf(fixture: string): string {
  const dir = mkdtempSync(join(tmpdir(), "srcatlas-diff-"));
  dirs.push(dir);
  cpSync(fixturePath(fixture), dir, { recursive: true });
  return dir;
}

async function cli(cwd: string, ...argv: string[]) {
  let out = "";
  let err = "";
  const code = await run(argv, {
    cwd,
    out: (s) => {
      out += s;
    },
    err: (s) => {
      err += s;
    },
  });
  return { code, out, err };
}

const read = (fixture: string, file: string): string =>
  readFileSync(join(fixturePath(fixture), file), "utf8");
const expectedDiff = (fixture: string): string =>
  serializeDiff(
    DiffFile.parse(JSON.parse(read(fixture, "expected.diff.json"))),
  );
const diffFilePath = (dir: string) =>
  join(dir, ".srcatlas", "srcatlas.diff.json");

const TWO = ["base.graph.json", "head.graph.json"];

// The graph files of the differ fixtures are the inputs; the expected output is the
// hand-written diff (docs/schema.md 13) and the hand-written Mermaid and Markdown text
// (docs/cli.md 3.4.1 and 3.4.2).
describe("srcatlas diff with graph files", () => {
  it.each([
    "diff-basic",
    "diff-moves",
    "diff-moves-ambiguous",
    "diff-cross-module",
    "diff-cycles",
  ])(
    "%s: --format json prints, and the diff file holds, the expected diff",
    async (fixture) => {
      const dir = copyOf(fixture);
      const r = await cli(dir, "diff", ...TWO, "--format", "json");
      expect(r.code).toBe(0);
      expect(r.out).toBe(expectedDiff(fixture));
      expect(readFileSync(diffFilePath(dir), "utf8")).toBe(
        expectedDiff(fixture),
      );
    },
  );

  it("--format mermaid prints the mini-graph, and --max-nodes caps it", async () => {
    const dir = copyOf("diff-basic");
    const args = ["diff", ...TWO, "--format", "mermaid"];
    expect((await cli(dir, ...args)).out).toBe(
      read("diff-basic", "expected.mermaid.mmd"),
    );
    expect((await cli(dir, ...args, "--max-nodes", "4")).out).toBe(
      read("diff-basic", "expected.mermaid.max4.mmd"),
    );
  });

  it.each(["diff-basic", "diff-cross-module", "diff-cycles"])(
    "%s: --format markdown prints the comment body",
    async (fixture) => {
      const dir = copyOf(fixture);
      const r = await cli(dir, "diff", ...TWO, "--format", "markdown");
      expect(r.code).toBe(0);
      expect(r.out).toBe(read(fixture, "expected.markdown.md"));
    },
  );

  it("--format text starts with the summary line and lists each change", async () => {
    const dir = copyOf("diff-basic");
    const r = await cli(dir, "diff", ...TWO);
    const lines = r.out.split("\n");
    expect(lines[0]).toBe(
      "+1 module, +1 route, 0 cross-module edges, 0 new cycles",
    );
    expect(lines).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^- .*provider:api\/OldCache/),
      ]),
    );
  });

  it("an unchanged graph prints no markdown and no mermaid, and still writes the diff file", async () => {
    const dir = copyOf("diff-basic");
    for (const format of ["markdown", "mermaid"]) {
      const r = await cli(
        dir,
        "diff",
        "base.graph.json",
        "base.graph.json",
        "--format",
        format,
      );
      expect(r).toMatchObject({ code: 0, out: "" });
    }
    expect(existsSync(diffFilePath(dir))).toBe(true);
  });

  it("--out writes the diff file there and --quiet silences stderr", async () => {
    const dir = copyOf("diff-basic");
    const r = await cli(
      dir,
      "diff",
      ...TWO,
      "--format",
      "json",
      "-o",
      "out/d.json",
      "--quiet",
    );
    expect(r.code).toBe(0);
    expect(r.err).toBe("");
    expect(existsSync(join(dir, "out", "d.json"))).toBe(true);
    expect(existsSync(diffFilePath(dir))).toBe(false);
  });

  it("--min-confidence drops elements below the level from both graphs first", async () => {
    // The only non-certain element is the head edge OrdersService -> AuditService (inferred).
    const dir = copyOf("diff-basic");
    const r = await cli(
      dir,
      "diff",
      ...TWO,
      "--format",
      "json",
      "--min-confidence",
      "certain",
    );
    const d = DiffFile.parse(JSON.parse(r.out));
    expect(d.edges.changed).toEqual([]);
    expect(d.edges.removed.map((e) => e.kind + e.to)).toContain(
      "injectsprovider:api/AuditService",
    );
  });

  describe("--fail-on", () => {
    const exit = async (fixture: string, ...flags: string[]) =>
      (await cli(copyOf(fixture), "diff", ...TWO, ...flags)).code;

    it("new-cycle", async () => {
      expect(await exit("diff-cycles", "--fail-on", "new-cycle")).toBe(1);
      expect(await exit("diff-basic", "--fail-on", "new-cycle")).toBe(0);
    });
    it("new-cross-module-edge", async () => {
      expect(
        await exit("diff-cross-module", "--fail-on", "new-cross-module-edge"),
      ).toBe(1);
      expect(
        await exit("diff-basic", "--fail-on", "new-cross-module-edge"),
      ).toBe(0);
    });
    it("removed-node: a removal fails, no removal does not", async () => {
      expect(await exit("diff-basic", "--fail-on", "removed-node")).toBe(1);
      expect(await exit("diff-cycles", "--fail-on", "removed-node")).toBe(0);
    });
    it("any-change, and repeated flags", async () => {
      expect(await exit("diff-cycles", "--fail-on", "any-change")).toBe(1);
      expect(
        await exit(
          "diff-cycles",
          "--fail-on",
          "removed-node",
          "--fail-on",
          "new-cycle",
        ),
      ).toBe(1);
    });
    it("passes when the graphs are equal", async () => {
      const dir = copyOf("diff-basic");
      const r = await cli(
        dir,
        "diff",
        "base.graph.json",
        "base.graph.json",
        "--fail-on",
        "any-change",
      );
      expect(r.code).toBe(0);
    });
    it("a move is not a removal", async () => {
      const dir = copyOf("diff-moves");
      // diff-moves also removes api/Logger, so compare the graph with only the move.
      const head = JSON.parse(read("diff-moves", "head.graph.json"));
      head.nodes = head.nodes.filter(
        (n: { id: string }) => n.id !== "provider:web/Logger",
      );
      const base = JSON.parse(read("diff-moves", "base.graph.json"));
      base.nodes = base.nodes.filter(
        (n: { id: string }) => n.id !== "provider:api/Logger",
      );
      writeFileSync(join(dir, "b.json"), JSON.stringify(base));
      writeFileSync(join(dir, "h.json"), JSON.stringify(head));
      const r = await cli(
        dir,
        "diff",
        "b.json",
        "h.json",
        "--format",
        "json",
        "--fail-on",
        "removed-node",
      );
      expect(DiffFile.parse(JSON.parse(r.out)).nodes.moved).toHaveLength(1);
      expect(r.code).toBe(0);
    });
  });

  describe("exit 2", () => {
    const code = async (...argv: string[]) =>
      (await cli(copyOf("diff-basic"), "diff", ...argv)).code;

    it("without two inputs", async () => {
      expect(await code()).toBe(2);
      expect(await code("base.graph.json")).toBe(2);
    });
    it("WORKTREE as base", async () => {
      expect(await code("WORKTREE", "head.graph.json")).toBe(2);
    });
    it("bad flag values, naming the value", async () => {
      const dir = copyOf("diff-basic");
      for (const [flag, value] of [
        ["--fail-on", "nope"],
        ["--format", "html"],
        ["--min-confidence", "high"],
        ["--max-nodes", "0"],
      ] as const) {
        const r = await cli(dir, "diff", ...TWO, flag, value);
        expect(r.code).toBe(2);
        expect(r.err).toContain(value);
      }
    });
    it("a graph file that is not a graph, or of another schemaVersion", async () => {
      const dir = copyOf("diff-basic");
      writeFileSync(join(dir, "junk.json"), "{ not json");
      const future = JSON.parse(read("diff-basic", "head.graph.json"));
      future.schemaVersion = 2;
      writeFileSync(join(dir, "future.json"), JSON.stringify(future));
      for (const bad of ["junk.json", "future.json"]) {
        const r = await cli(dir, "diff", "base.graph.json", bad);
        expect(r.code).toBe(2);
        expect(r.out).toBe("");
      }
    });
    it("an unknown ref", async () => {
      const dir = copyOf("diff-basic");
      git(dir, "init", "-b", "main");
      git(dir, "add", "-A");
      commit(dir, "one");
      const r = await cli(dir, "diff", "no-such-ref", "WORKTREE");
      expect(r.code).toBe(2);
      expect(r.err).toContain("no-such-ref");
    });
  });
});

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] })
    .toString()
    .trim();
}
const commit = (cwd: string, message: string) =>
  git(
    cwd,
    "-c",
    "user.name=t",
    "-c",
    "user.email=t@example.com",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "-m",
    message,
  );

const EXTRA_MODULE = `import { Module } from "@nestjs/common";

@Module({})
export class ExtraModule {}
`;

/** nest-basic committed once, then a second commit that adds ExtraModule. */
function twoCommitRepo(): string {
  const dir = copyOf("nest-basic");
  git(dir, "init", "-b", "main");
  git(dir, "add", "-A");
  commit(dir, "one");
  writeFileSync(join(dir, "src", "extra.module.ts"), EXTRA_MODULE);
  git(dir, "add", "-A");
  commit(dir, "two");
  return dir;
}

const worktrees = (dir: string) =>
  git(dir, "worktree", "list", "--porcelain")
    .split("\n")
    .filter((l) => l.startsWith("worktree "));

describe("srcatlas diff with git refs", () => {
  it("compares two commits and removes its temporary worktrees", async () => {
    const dir = twoCommitRepo();
    const r = await cli(dir, "diff", "HEAD~1", "HEAD", "--format", "json");
    expect(r.code).toBe(0);
    const d = DiffFile.parse(JSON.parse(r.out));
    expect(d.summary.modules).toBe(1);
    expect(d.nodes.added.map((n) => n.name)).toEqual(["ExtraModule"]);
    expect(d.nodes.removed).toEqual([]);
    expect(worktrees(dir)).toHaveLength(1);
  });

  it("compares a commit with the working tree, uncommitted changes included", async () => {
    const dir = twoCommitRepo();
    writeFileSync(
      join(dir, "src", "another.module.ts"),
      EXTRA_MODULE.replace("ExtraModule", "AnotherModule"),
    );
    const r = await cli(dir, "diff", "HEAD", "WORKTREE", "--format", "json");
    const d = DiffFile.parse(JSON.parse(r.out));
    expect(d.nodes.added.map((n) => n.name)).toEqual(["AnotherModule"]);
    expect(worktrees(dir)).toHaveLength(1);
  });

  it("a branch name works like a SHA, and a graph file mixes with a ref", async () => {
    const dir = twoCommitRepo();
    const sha = git(dir, "rev-parse", "HEAD~1");
    const a = await cli(dir, "diff", sha, "main", "--format", "json");
    expect(a.code).toBe(0);
    expect(DiffFile.parse(JSON.parse(a.out)).summary.modules).toBe(1);

    await cli(dir, "analyze", "-o", "head.graph.json");
    const b = await cli(
      dir,
      "diff",
      "HEAD~1",
      "head.graph.json",
      "--format",
      "json",
    );
    expect(DiffFile.parse(JSON.parse(b.out)).summary.modules).toBe(1);
  });

  it("caches the graph of a ref by commit, and never caches WORKTREE", async () => {
    const dir = twoCommitRepo();
    await cli(dir, "diff", "HEAD~1", "WORKTREE");
    const cacheDir = join(dir, ".srcatlas", "cache");
    const cached = readdirSync(cacheDir);
    expect(cached).toHaveLength(1);

    // A second run reads the cache: a different valid graph there changes the result.
    const empty = GraphFile.parse({
      schemaVersion: 1,
      generator: { name: "srcatlas", version: "0.0.0" },
      repo: {},
      nodes: [],
      edges: [],
    });
    const file = join(cacheDir, cached[0] as string);
    writeFileSync(file, JSON.stringify(empty));
    const r = await cli(dir, "diff", "HEAD~1", "WORKTREE", "--format", "json");
    const d = DiffFile.parse(JSON.parse(r.out));
    expect(d.nodes.added.length).toBeGreaterThan(0);
    expect(d.nodes.removed).toEqual([]);

    // A cache file that is not a graph is replaced, not trusted.
    writeFileSync(file, "garbage");
    const again = await cli(
      dir,
      "diff",
      "HEAD~1",
      "WORKTREE",
      "--format",
      "json",
    );
    expect(again.code).toBe(0);
    expect(() =>
      GraphFile.parse(JSON.parse(readFileSync(file, "utf8"))),
    ).not.toThrow();
  });

  it("a different commit gets a different cache entry", async () => {
    const dir = twoCommitRepo();
    await cli(dir, "diff", "HEAD~1", "HEAD");
    expect(readdirSync(join(dir, ".srcatlas", "cache"))).toHaveLength(2);
  });
});

// docs/cli.md 3.4.2 (--config-ref) and docs/action.md 4: for a pull request from a fork the
// configuration comes from the base commit, and the working directory's is never executed.
describe("srcatlas diff --config-ref", () => {
  const BASE_CONFIG = 'export default { outDir: "base-out" };\n';

  function repoWithRunningConfig(): string {
    const dir = copyOf("nest-basic");
    writeFileSync(join(dir, "srcatlas.config.mjs"), BASE_CONFIG);
    git(dir, "init", "-b", "main");
    git(dir, "add", "-A");
    commit(dir, "one");
    writeFileSync(join(dir, "src", "extra.module.ts"), EXTRA_MODULE);
    writeFileSync(
      join(dir, "srcatlas.config.mjs"),
      `import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(join(dir, "ran.txt"))}, "ran");\nexport default { outDir: "head-out" };\n`,
    );
    git(dir, "add", "-A");
    commit(dir, "two");
    return dir;
  }

  it("uses the config of that commit and does not execute the working directory's", async () => {
    const dir = repoWithRunningConfig();
    const r = await cli(
      dir,
      "diff",
      "HEAD~1",
      "HEAD",
      "--config-ref",
      "HEAD~1",
      "--format",
      "json",
    );
    expect(r.code).toBe(0);
    expect(DiffFile.parse(JSON.parse(r.out)).summary.modules).toBe(1);
    expect(existsSync(join(dir, "base-out", "srcatlas.diff.json"))).toBe(true);
    expect(existsSync(join(dir, "head-out"))).toBe(false);
    expect(existsSync(join(dir, "ran.txt"))).toBe(false);
    expect(worktrees(dir)).toHaveLength(1);
  });

  it("without the flag the working directory's config runs (the control)", async () => {
    const dir = repoWithRunningConfig();
    await cli(dir, "diff", "HEAD~1", "HEAD", "--format", "json");
    expect(existsSync(join(dir, "ran.txt"))).toBe(true);
  });

  it("is exit 2 for an unknown ref, and together with --config", async () => {
    const dir = repoWithRunningConfig();
    const unknown = await cli(
      dir,
      "diff",
      "HEAD~1",
      "HEAD",
      "--config-ref",
      "nope",
    );
    expect(unknown.code).toBe(2);
    expect(unknown.err).toContain("nope");
    const both = await cli(
      dir,
      "diff",
      "HEAD~1",
      "HEAD",
      "--config-ref",
      "HEAD~1",
      "--config",
      "srcatlas.config.mjs",
    );
    expect(both.code).toBe(2);
    expect(existsSync(join(dir, "ran.txt"))).toBe(false);
  });

  it("a commit without a config gives the defaults", async () => {
    const dir = twoCommitRepo();
    const r = await cli(
      dir,
      "diff",
      "HEAD~1",
      "HEAD",
      "--config-ref",
      "HEAD~1",
      "--format",
      "json",
    );
    expect(r.code).toBe(0);
    expect(existsSync(join(dir, ".srcatlas", "srcatlas.diff.json"))).toBe(true);
  });
});
