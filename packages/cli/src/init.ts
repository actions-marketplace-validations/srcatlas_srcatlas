import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  builtinExtractors,
  DuplicatePackageNameError,
  discoverPackages,
  writeOutputs,
} from "@srcatlas/analyzer";
import { UsageError } from "./errors.js";

export interface InitFlags {
  yes?: boolean | undefined;
  noWorkflow?: boolean | undefined;
  force?: boolean | undefined;
  quiet?: boolean | undefined;
}

export interface InitIo {
  err: (s: string) => void;
  /** Asks a yes/no question. Absent when there is no one to ask (no TTY). */
  ask?: ((question: string) => Promise<boolean>) | undefined;
}

const CONFIG = "srcatlas.config.ts";
const WORKFLOW = ".github/workflows/srcatlas.yml";
const IGNORED = ".srcatlas/";
const DEPENDENCIES = ["dependencies", "devDependencies", "peerDependencies"];

function readManifest(file: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(readFileSync(file, "utf8"));
    return typeof v === "object" && v !== null && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

const dependsOn = (manifest: Record<string, unknown> | null, name: string) =>
  DEPENDENCIES.some((field) => {
    const deps = manifest?.[field];
    return typeof deps === "object" && deps !== null && name in deps;
  });

interface Detected {
  path: string;
  extractors: string[];
  /** Next.js is detected, but its extractor is not available yet. */
  next: boolean;
}

/** docs/cli.md 3.1 step 2: frameworks by dependencies, with the detect() of each extractor. */
function detect(root: string): Detected[] {
  const { packages } = discoverPackages(root);
  return packages
    .map((p) => {
      const manifest = readManifest(join(root, p.root, "package.json"));
      return {
        path: p.root,
        extractors: builtinExtractors
          .filter((e) => e.detect(manifest))
          .map((e) => e.name),
        next: dependsOn(manifest, "next"),
      };
    })
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

const quote = (s: string): string => JSON.stringify(s);

function configText(found: Detected[]): string {
  const lines = found.map((p) => {
    const parts = [`path: ${quote(p.path)}`];
    if (p.extractors.length > 0) {
      parts.push(`extractors: [${p.extractors.map(quote).join(", ")}]`);
    }
    const note = p.next
      ? " // next is a dependency; its extractor is not available yet"
      : "";
    return `    { ${parts.join(", ")} },${note}`;
  });
  return [
    'import { defineConfig } from "srcatlas";',
    "",
    "export default defineConfig({",
    "  // Packages to analyse and the extractors to run on each, found from package.json.",
    "  packages: [",
    ...lines,
    "  ],",
    "",
    "  // Options left at their defaults (docs/config.md):",
    '  // outDir: ".srcatlas",',
    '  // include: ["**/*.ts", "**/*.tsx", "**/*.prisma"],',
    "  // exclude: [], // added to the built-in excludes (node_modules, dist, tests, ...)",
    "  // extractors: {}, // per-extractor options, for example nestjs.globalPrefix",
    "  // rules: [], // architecture rules for `srcatlas check`",
    "  // analysis: { includeTests: false },",
    "});",
    "",
  ].join("\n");
}

function workflowText(version: string): string {
  return [
    "# Written by `srcatlas init`: analyses every pull request and keeps the graph as an artifact.",
    "name: srcatlas",
    "",
    "on:",
    "  pull_request:",
    "",
    "permissions:",
    "  contents: read",
    "",
    "jobs:",
    "  analyze:",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - uses: actions/checkout@v4",
    "      - uses: actions/setup-node@v4",
    "        with:",
    "          node-version: 22",
    `      - run: npx --yes srcatlas@${version} analyze`,
    "      - uses: actions/upload-artifact@v4",
    "        with:",
    "          name: srcatlas",
    "          path: .srcatlas",
    "",
  ].join("\n");
}

const ignores = (gitignore: string): boolean =>
  gitignore.split(/\r?\n/).some((l) => /^\/?\.srcatlas\/?$/.test(l.trim()));

/** `srcatlas init` (docs/cli.md 3.1). Returns the exit code. */
export async function initCommand(
  root: string,
  flags: InitFlags,
  version: string,
  io: InitIo,
): Promise<number> {
  const say = (s: string) => {
    if (!flags.quiet) io.err(`${s}\n`);
  };
  const configPath = resolve(root, CONFIG);
  const workflowPath = resolve(root, WORKFLOW);
  const wantsWorkflow = !flags.noWorkflow;

  // Nothing is written before every refusal has been checked.
  const existing = [
    existsSync(configPath) ? CONFIG : undefined,
    wantsWorkflow && existsSync(workflowPath) ? WORKFLOW : undefined,
  ].filter((f): f is string => f !== undefined);
  if (existing.length > 0 && !flags.force) {
    throw new UsageError(
      `${existing.join(" and ")} already exist${existing.length === 1 ? "s" : ""}; use --force to overwrite`,
    );
  }

  let found: Detected[];
  try {
    found = detect(root);
  } catch (e) {
    if (e instanceof DuplicatePackageNameError) throw new UsageError(e.message);
    throw e;
  }
  const names = [...new Set(found.flatMap((p) => p.extractors))];
  say(
    names.length > 0
      ? `Detected: ${names.join(", ")} in ${found.filter((p) => p.extractors.length > 0).length} of ${found.length} package(s)`
      : "No supported framework detected; analysis will use the file-level import graph",
  );

  const confirm = async (question: string): Promise<boolean> => {
    if (flags.yes) return true;
    if (io.ask) return await io.ask(question);
    say(`Skipped (no terminal to ask, use --yes): ${question}`);
    return false;
  };

  const files = [{ path: configPath, content: configText(found) }];
  const written = [CONFIG];

  const gitignorePath = resolve(root, ".gitignore");
  const gitignore = existsSync(gitignorePath)
    ? readFileSync(gitignorePath, "utf8")
    : "";
  if (!ignores(gitignore) && (await confirm(`Add ${IGNORED} to .gitignore?`))) {
    const sep = gitignore === "" || gitignore.endsWith("\n") ? "" : "\n";
    files.push({
      path: gitignorePath,
      content: `${gitignore}${sep}${IGNORED}\n`,
    });
    written.push(".gitignore");
  }
  if (wantsWorkflow && (await confirm(`Write ${WORKFLOW}?`))) {
    files.push({ path: workflowPath, content: workflowText(version) });
    written.push(WORKFLOW);
  }

  writeOutputs(files);
  say(`Wrote ${written.join(", ")}`);
  say("Next: srcatlas analyze");
  return 0;
}
