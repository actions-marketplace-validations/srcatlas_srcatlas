// Plain ESM with no dependencies and no build step (docs/action.md, ADR 0012).
// Types are in run.d.mts.
import { spawnSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { postComment as realPostComment } from "./post-comment.mjs";

const FAIL_ON = new Set([
  "new-cycle",
  "new-cross-module-edge",
  "removed-node",
  "any-change",
]);
const SHA = /^[0-9a-f]{40}$/;

/**
 * Runs `srcatlas diff <base> <head>` for the pull request and posts the result. Returns
 * the exit code: 0 or 1 from `srcatlas diff` after the comment is posted, 2 for a refused
 * event or input, 3 when the command could not run.
 */
export async function runAction(io) {
  const { env, log } = io;
  if (env.GITHUB_EVENT_NAME !== "pull_request") {
    log(
      `srcatlas: this action supports only the pull_request event, not ${env.GITHUB_EVENT_NAME ?? "(none)"}`,
    );
    return 2;
  }

  const version = env.SRCATLAS_VERSION || "latest";
  const maxNodes = env.SRCATLAS_MAX_NODES || "40";
  const failOn = (env.SRCATLAS_FAIL_ON ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== "");
  const bad =
    (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(version) && `version "${version}"`) ||
    (!/^[1-9][0-9]*$/.test(maxNodes) && `max-nodes "${maxNodes}"`) ||
    (failOn.find((c) => !FAIL_ON.has(c)) &&
      `fail-on "${failOn.find((c) => !FAIL_ON.has(c))}"`);
  if (bad) {
    log(`srcatlas: invalid input: ${bad}`);
    return 2;
  }

  const event = io.readEvent();
  const base = event.pull_request.base.sha;
  const head = env.GITHUB_SHA ?? "";
  if (!SHA.test(base) || !SHA.test(head)) {
    log("srcatlas: the base or head commit is missing from the event");
    return 2;
  }
  const head_repo = event.pull_request.head.repo;
  const fork = !head_repo || head_repo.full_name !== env.GITHUB_REPOSITORY;

  const args = [
    "--yes",
    `srcatlas@${version}`,
    "diff",
    base,
    head,
    "--format",
    "markdown",
    "--max-nodes",
    maxNodes,
    // A fork's own config would run its code (ADR 0006); the base commit's is trusted.
    ...(fork ? ["--config-ref", base] : []),
    ...failOn.flatMap((c) => ["--fail-on", c]),
  ];
  // The analysed project's config may run code, so it does not get the token.
  const childEnv = { ...env };
  delete childEnv.GITHUB_TOKEN;
  const r = io.spawn("npx", args, childEnv);
  if (r.error || r.status === null) {
    log(`srcatlas: could not run npx: ${r.error?.message ?? "no exit status"}`);
    return 3;
  }
  if (r.status !== 0 && r.status !== 1) {
    log(`srcatlas: diff exited with ${r.status}`);
    return r.status;
  }

  await io.postComment({
    body: r.stdout,
    event,
    env,
    fetch: io.fetch,
    appendSummary: io.appendSummary,
    log,
  });
  return r.status;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const env = process.env;
  process.exitCode = await runAction({
    env,
    readEvent: () =>
      JSON.parse(readFileSync(env.GITHUB_EVENT_PATH ?? "", "utf8")),
    spawn: (command, args, childEnv) => {
      const r = spawnSync(command, args, {
        env: childEnv,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "inherit"],
        maxBuffer: 64 * 1024 * 1024,
      });
      return {
        status: r.status,
        stdout: r.stdout ?? "",
        ...(r.error ? { error: r.error } : {}),
      };
    },
    postComment: realPostComment,
    fetch: globalThis.fetch,
    appendSummary: (text) => {
      if (env.GITHUB_STEP_SUMMARY)
        appendFileSync(env.GITHUB_STEP_SUMMARY, text);
    },
    log: (line) => console.error(line),
  });
}
