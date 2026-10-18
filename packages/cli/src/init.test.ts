import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "./load-config.js";
import { run } from "./main.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "srcatlas-init-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function put(path: string, text: string) {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
}
const pkg = (name: string, deps: Record<string, string> = {}) =>
  JSON.stringify({ name, version: "1.0.0", dependencies: deps });
const read = (path: string) => readFileSync(join(dir, path), "utf8");

async function init(args: string[] = [], answers?: boolean[]) {
  let err = "";
  const asked: string[] = [];
  const code = await run(["init", ...args], {
    cwd: dir,
    out: () => {},
    err: (s) => {
      err += s;
    },
    ...(answers
      ? {
          ask: async (q: string) => {
            asked.push(q);
            return answers.shift() ?? false;
          },
        }
      : {}),
  });
  return { code, err, asked };
}

describe("srcatlas init", () => {
  it("detects NestJS and Prisma in a pnpm workspace, and Next.js without an extractor", async () => {
    put("package.json", pkg("root"));
    put("pnpm-workspace.yaml", "packages:\n  - apps/*\n  - packages/*\n");
    put(
      "apps/api/package.json",
      pkg("api", { "@nestjs/core": "10", "@prisma/client": "5" }),
    );
    put("apps/web/package.json", pkg("web", { next: "15" }));
    put("packages/util/package.json", pkg("util"));
    const r = await init(["--yes", "--no-workflow"]);
    expect(r.code).toBe(0);
    const config = read("srcatlas.config.ts");
    expect(config).toContain(
      '{ path: "apps/api", extractors: ["nestjs", "prisma"] },',
    );
    expect(config).toContain('{ path: "apps/web" }, // next is a dependency');
    expect(config).toContain('{ path: "packages/util" },');
    expect(r.err).toContain("Next: srcatlas analyze");
  });

  it("a single package at the root, from npm workspaces too", async () => {
    put(
      "package.json",
      JSON.stringify({
        name: "solo",
        dependencies: { "@nestjs/common": "10" },
      }),
    );
    await init(["--yes", "--no-workflow"]);
    expect(read("srcatlas.config.ts")).toContain(
      '{ path: ".", extractors: ["nestjs"] },',
    );

    rmSync(join(dir, "srcatlas.config.ts"));
    put(
      "package.json",
      JSON.stringify({ name: "mono", workspaces: ["svc/*"] }),
    );
    put("svc/a/package.json", pkg("a", { prisma: "5" }));
    await init(["--yes", "--no-workflow"]);
    expect(read("srcatlas.config.ts")).toContain(
      '{ path: "svc/a", extractors: ["prisma"] },',
    );
  });

  it("the written config loads and validates, without srcatlas installed in the project", async () => {
    put("package.json", pkg("solo", { "@nestjs/core": "10" }));
    await init(["--yes", "--no-workflow"]);
    expect(await loadConfig(dir)).toEqual({
      packages: [{ path: ".", extractors: ["nestjs"] }],
    });
  });

  it("never overwrites without --force: exit 2, nothing written", async () => {
    put("package.json", pkg("solo"));
    put("srcatlas.config.ts", "export default {};\n");
    const r = await init(["--yes"]);
    expect(r.code).toBe(2);
    expect(r.err).toContain("--force");
    expect(read("srcatlas.config.ts")).toBe("export default {};\n");
    expect(existsSync(join(dir, ".gitignore"))).toBe(false);
  });

  it("an existing workflow file is refused too, unless --no-workflow", async () => {
    put("package.json", pkg("solo"));
    put(".github/workflows/srcatlas.yml", "keep\n");
    expect((await init(["--yes"])).code).toBe(2);
    expect(existsSync(join(dir, "srcatlas.config.ts"))).toBe(false);
    expect((await init(["--yes", "--no-workflow"])).code).toBe(0);
    expect(read(".github/workflows/srcatlas.yml")).toBe("keep\n");
  });

  it("--force overwrites, also when the existing config is invalid", async () => {
    put("package.json", pkg("solo"));
    put("srcatlas.config.ts", "export default { pakages: [] };\n");
    const r = await init(["--yes", "--force", "--no-workflow"]);
    expect(r.code).toBe(0);
    expect(read("srcatlas.config.ts")).toContain("defineConfig");
  });

  it("with --yes: writes the workflow pinned to the CLI version and appends to .gitignore", async () => {
    put("package.json", pkg("solo"));
    put(".gitignore", "node_modules");
    await init(["--yes"]);
    expect(read(".gitignore")).toBe("node_modules\n.srcatlas/\n");
    const wf = read(".github/workflows/srcatlas.yml");
    expect(wf).toMatch(/npx --yes srcatlas@\d+\.\d+\.\d+ analyze/);
    expect(wf).toContain("contents: read");
  });

  it(".gitignore is not touched when it already ignores .srcatlas", async () => {
    put("package.json", pkg("solo"));
    put(".gitignore", "dist\n/.srcatlas\n");
    const r = await init(["--yes", "--no-workflow"]);
    expect(read(".gitignore")).toBe("dist\n/.srcatlas\n");
    expect(r.err).not.toContain(".gitignore,");
  });

  it("asks before each optional file and honours the answers", async () => {
    put("package.json", pkg("solo"));
    const r = await init([], [false, true]); // .gitignore: no, workflow: yes
    expect(r.asked).toEqual([
      "Add .srcatlas/ to .gitignore?",
      "Write .github/workflows/srcatlas.yml?",
    ]);
    expect(existsSync(join(dir, ".gitignore"))).toBe(false);
    expect(existsSync(join(dir, ".github/workflows/srcatlas.yml"))).toBe(true);
  });

  it("without a terminal and without --yes: config only, and says what was skipped", async () => {
    put("package.json", pkg("solo"));
    const r = await init();
    expect(r.code).toBe(0);
    expect(existsSync(join(dir, "srcatlas.config.ts"))).toBe(true);
    expect(existsSync(join(dir, ".gitignore"))).toBe(false);
    expect(existsSync(join(dir, ".github"))).toBe(false);
    expect(r.err).toContain("use --yes");
  });

  it("no framework: says so and still writes a valid config", async () => {
    put("package.json", pkg("plain", { lodash: "4" }));
    const r = await init(["--yes", "--no-workflow"]);
    expect(r.err).toContain("No supported framework detected");
    expect((await loadConfig(dir)).packages).toEqual([{ path: "." }]);
  });
});
