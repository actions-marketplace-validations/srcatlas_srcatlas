import { describe, expect, it } from "vitest";
import type { PostCommentIo, PullRequestEvent } from "./post-comment.mjs";
import { type RunIo, runAction } from "./run.mjs";

// docs/action.md 2 to 4: only pull_request; srcatlas diff <base> <head> on two commits;
// a fork gets --config-ref <base>; fail-on fails the step after the comment is posted.

const BASE = "b".repeat(40);
const HEAD = "c".repeat(40);

const event = (headRepo = "acme/app"): PullRequestEvent => ({
  pull_request: {
    number: 7,
    base: { sha: BASE },
    head: { repo: { full_name: headRepo } },
  },
});

function setup(over: {
  env?: Record<string, string | undefined>;
  event?: PullRequestEvent;
  status?: number | null;
  stdout?: string;
  error?: Error;
}) {
  const spawned: { command: string; args: string[] }[] = [];
  const posted: PostCommentIo[] = [];
  const logs: string[] = [];
  const io: RunIo = {
    env: {
      GITHUB_EVENT_NAME: "pull_request",
      GITHUB_SHA: HEAD,
      GITHUB_REPOSITORY: "acme/app",
      ...over.env,
    },
    readEvent: () => over.event ?? event(),
    spawn: (command, args) => {
      spawned.push({ command, args });
      return {
        status: over.status === undefined ? 0 : over.status,
        stdout: over.stdout ?? "BODY",
        ...(over.error ? { error: over.error } : {}),
      };
    },
    postComment: async (p) => {
      posted.push(p);
      return { mode: "created" };
    },
    fetch: async () => ({ ok: true, status: 200, json: async () => [] }),
    appendSummary: () => {},
    log: (l) => logs.push(l),
  };
  return { io, spawned, posted, logs };
}

describe("runAction", () => {
  it("runs srcatlas diff on the base and the merge commit, and posts the Markdown", async () => {
    const { io, spawned, posted } = setup({});
    expect(await runAction(io)).toBe(0);
    expect(spawned).toEqual([
      {
        command: "npx",
        args: [
          "--yes",
          "srcatlas@latest",
          "diff",
          BASE,
          HEAD,
          "--format",
          "markdown",
          "--max-nodes",
          "40",
        ],
      },
    ]);
    expect(posted).toHaveLength(1);
    expect(posted[0]?.body).toBe("BODY");
  });

  it("passes the inputs: version, max-nodes and fail-on, one per line", async () => {
    const { io, spawned } = setup({
      env: {
        SRCATLAS_VERSION: "0.12.1",
        SRCATLAS_MAX_NODES: "12",
        SRCATLAS_FAIL_ON: "new-cycle\n  removed-node \n\n",
      },
    });
    await runAction(io);
    expect(spawned[0]?.args).toEqual([
      "--yes",
      "srcatlas@0.12.1",
      "diff",
      BASE,
      HEAD,
      "--format",
      "markdown",
      "--max-nodes",
      "12",
      "--fail-on",
      "new-cycle",
      "--fail-on",
      "removed-node",
    ]);
  });

  it("loads the config from the base commit for a pull request from a fork", async () => {
    const { io, spawned } = setup({ event: event("someone/app") });
    await runAction(io);
    const args = spawned[0]?.args ?? [];
    expect(args.slice(args.indexOf("--config-ref"))).toEqual([
      "--config-ref",
      BASE,
    ]);
  });

  it("does not use --config-ref for a pull request from the same repository", async () => {
    const { io, spawned } = setup({});
    await runAction(io);
    expect(spawned[0]?.args).not.toContain("--config-ref");
  });

  it("a fail-on condition fails the step, after the comment is posted", async () => {
    const { io, posted } = setup({ status: 1 });
    expect(await runAction(io)).toBe(1);
    expect(posted).toHaveLength(1);
  });

  it("a usage or internal error posts nothing and is passed on", async () => {
    for (const status of [2, 3]) {
      const { io, posted } = setup({ status, stdout: "garbage" });
      expect(await runAction(io)).toBe(status);
      expect(posted).toEqual([]);
    }
  });

  it("a command that could not be started is an internal error", async () => {
    const { io, posted, logs } = setup({
      status: null,
      error: new Error("spawn npx ENOENT"),
    });
    expect(await runAction(io)).toBe(3);
    expect(posted).toEqual([]);
    expect(logs.join("\n")).toContain("ENOENT");
  });

  describe("exit 2 without running anything", () => {
    it.each(["push", "pull_request_target", "workflow_dispatch", undefined])(
      "event %s",
      async (name) => {
        const { io, spawned, logs } = setup({
          env: { GITHUB_EVENT_NAME: name },
        });
        expect(await runAction(io)).toBe(2);
        expect(spawned).toEqual([]);
        expect(logs.join("\n")).toContain("pull_request");
      },
    );

    it.each([
      ["SRCATLAS_VERSION", "1.0.0 --foo"],
      ["SRCATLAS_VERSION", "1.0.0;rm -rf"],
      ["SRCATLAS_MAX_NODES", "abc"],
      ["SRCATLAS_MAX_NODES", "0"],
      ["SRCATLAS_FAIL_ON", "bogus"],
      ["SRCATLAS_FAIL_ON", "new-cycle --format json"],
    ])("input %s = %j", async (key, value) => {
      const { io, spawned } = setup({ env: { [key]: value } });
      expect(await runAction(io)).toBe(2);
      expect(spawned).toEqual([]);
    });
  });
});
