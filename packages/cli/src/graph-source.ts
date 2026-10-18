import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  analyzeRepo,
  DuplicatePackageNameError,
  writeOutputs,
} from "@srcatlas/analyzer";
import {
  type Config,
  GraphFile,
  type Json,
  SCHEMA_VERSION,
  serializeGraph,
  sortKeys,
  validateGraph,
} from "@srcatlas/core";
import { UsageError } from "./errors.js";

export interface SourceEnv {
  /** Absolute repository root: the working directory. */
  root: string;
  config: Config;
  version: string;
  /** Absolute output directory; the cache lives in `<outDir>/cache`. */
  outDir: string;
}

/** Runs git in `cwd` and returns trimmed stdout. Local only: no network. */
function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  })
    .toString()
    .trim();
}

const gitOk = (cwd: string, ...args: string[]): string | undefined => {
  try {
    return git(cwd, ...args);
  } catch {
    return undefined;
  }
};

/** The HEAD commit, or undefined outside git. */
export function headCommit(root: string): string | undefined {
  const sha = gitOk(root, "rev-parse", "HEAD");
  return sha && /^[0-9a-f]{40}$/.test(sha) ? sha : undefined;
}

/** Cache key of a ref's graph (docs/cli.md 3.4.2): the commit, this version and the configuration. */
export function cacheKey(sha: string, version: string, config: Config): string {
  return createHash("sha256")
    .update([sha, version, JSON.stringify(sortKeys(config as Json))].join("\0"))
    .digest("hex");
}

async function analyze(
  dir: string,
  env: SourceEnv,
  commit: string | undefined,
): Promise<GraphFile> {
  try {
    const { graph } = await analyzeRepo(dir, env.config, {
      generatorVersion: env.version,
      ...(commit ? { commit } : {}),
    });
    return graph;
  } catch (e) {
    if (e instanceof DuplicatePackageNameError) throw new UsageError(e.message);
    throw e;
  }
}

/** A graph that passes the schema and every invariant, or undefined. */
function parseGraph(text: string): GraphFile | undefined {
  try {
    const g = GraphFile.parse(JSON.parse(text));
    return validateGraph(g).length === 0 ? g : undefined;
  } catch {
    return undefined;
  }
}

function readGraphFile(file: string, input: string): GraphFile {
  const text = readFileSync(file, "utf8");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new UsageError(`${input}: not valid JSON`);
  }
  const version = (raw as { schemaVersion?: unknown } | null)?.schemaVersion;
  if (version !== SCHEMA_VERSION) {
    throw new UsageError(
      `${input}: unsupported schemaVersion ${JSON.stringify(version)}; this srcatlas reads ${SCHEMA_VERSION}`,
    );
  }
  const graph = parseGraph(text);
  if (!graph) throw new UsageError(`${input}: not a valid srcatlas graph`);
  return graph;
}

async function graphOfRef(ref: string, env: SourceEnv): Promise<GraphFile> {
  if (gitOk(env.root, "rev-parse", "--is-inside-work-tree") !== "true") {
    throw new UsageError(
      `"${ref}" is not a file, and ${env.root} is not inside a git work tree`,
    );
  }
  const sha = gitOk(
    env.root,
    "rev-parse",
    "--verify",
    "--quiet",
    `${ref}^{commit}`,
  );
  if (!sha) {
    const shallow =
      gitOk(env.root, "rev-parse", "--is-shallow-repository") === "true"
        ? "; this is a shallow clone, so use fetch-depth: 0 or pass a graph file"
        : "";
    throw new UsageError(`unknown git ref "${ref}"${shallow}`);
  }

  const cacheFile = join(
    env.outDir,
    "cache",
    `${cacheKey(sha, env.version, env.config)}.graph.json`,
  );
  if (existsSync(cacheFile)) {
    const cached = parseGraph(readFileSync(cacheFile, "utf8"));
    if (cached) return cached;
  }

  // The work tree can sit below the repository top level; analyse the same sub-directory.
  const prefix = git(env.root, "rev-parse", "--show-prefix");
  const tmp = mkdtempSync(join(tmpdir(), "srcatlas-wt-"));
  const tree = join(tmp, "tree");
  let graph: GraphFile;
  try {
    git(env.root, "worktree", "add", "--detach", tree, sha);
    graph = await analyze(join(tree, prefix), env, sha);
  } finally {
    gitOk(env.root, "worktree", "remove", "--force", tree);
    rmSync(tmp, { recursive: true, force: true });
    gitOk(env.root, "worktree", "prune");
  }
  writeOutputs([{ path: cacheFile, content: serializeGraph(graph) }]);
  return graph;
}

/**
 * The graph for one `diff` input (docs/cli.md 3.4.2): `WORKTREE` (head only), a graph
 * file, or a git ref, tried in that order.
 */
export async function loadGraph(
  input: string,
  role: "base" | "head",
  env: SourceEnv,
): Promise<GraphFile> {
  if (input === "WORKTREE") {
    if (role === "base") {
      throw new UsageError("WORKTREE is only valid as <head>");
    }
    return analyze(env.root, env, headCommit(env.root));
  }
  const file = resolve(env.root, input);
  if (existsSync(file) && statSync(file).isFile()) {
    return readGraphFile(file, input);
  }
  return graphOfRef(input, env);
}
