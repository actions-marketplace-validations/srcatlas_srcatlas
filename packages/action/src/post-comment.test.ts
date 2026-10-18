import { describe, expect, it } from "vitest";
import {
  MARKER,
  type PostCommentIo,
  type PullRequestEvent,
  postComment,
} from "./post-comment.mjs";

// docs/action.md 4 and 5: one comment per pull request, found by its marker and a bot
// author, updated in place; nothing is posted for an empty diff unless a comment exists;
// a pull request from a fork, a disabled comment or a refused write goes to the job summary.

interface Comment {
  id: number;
  body: string;
  user: { type: string };
}
interface Call {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
}

const API = "https://api.example.test";
const bot = (id: number, body: string): Comment => ({
  id,
  body,
  user: { type: "Bot" },
});

function fakeApi(
  pages: Comment[][] = [[]],
  statuses: Partial<Record<"GET" | "POST" | "PATCH", number>> = {},
) {
  const calls: Call[] = [];
  const fetch: PostCommentIo["fetch"] = async (url, init) => {
    const method = init.method ?? "GET";
    calls.push({
      method,
      url,
      headers: init.headers ?? {},
      ...(init.body === undefined ? {} : { body: init.body }),
    });
    const status = statuses[method as "GET" | "POST" | "PATCH"] ?? 200;
    const page = Number(new URL(url).searchParams.get("page") ?? "1");
    return {
      ok: status < 300,
      status,
      json: async () => (method === "GET" ? (pages[page - 1] ?? []) : {}),
    };
  };
  return { fetch, calls };
}

const event = (headRepo: string | null = "acme/app"): PullRequestEvent => ({
  pull_request: {
    number: 7,
    base: { sha: "b".repeat(40) },
    head: { repo: headRepo === null ? null : { full_name: headRepo } },
  },
});

function setup(
  api: ReturnType<typeof fakeApi>,
  over: Partial<PostCommentIo> = {},
) {
  const summary: string[] = [];
  const logs: string[] = [];
  const io: PostCommentIo = {
    body: "### Architecture changes\n",
    event: event(),
    env: {
      GITHUB_REPOSITORY: "acme/app",
      GITHUB_TOKEN: "t0k",
      GITHUB_API_URL: API,
    },
    fetch: api.fetch,
    appendSummary: (t) => summary.push(t),
    log: (l) => logs.push(l),
    ...over,
  };
  return { io, summary, logs };
}

const writes = (api: ReturnType<typeof fakeApi>) =>
  api.calls.filter((c) => c.method !== "GET");

describe("postComment", () => {
  it("creates one comment that starts with the marker", async () => {
    const api = fakeApi();
    const { io } = setup(api);
    expect(await postComment(io)).toEqual({ mode: "created" });
    const [post] = writes(api);
    expect(post?.method).toBe("POST");
    expect(post?.url).toBe(`${API}/repos/acme/app/issues/7/comments`);
    expect(JSON.parse(post?.body ?? "{}").body).toBe(
      `${MARKER}\n### Architecture changes\n`,
    );
    expect(post?.headers.Authorization).toBe("Bearer t0k");
  });

  it("updates its own comment in place instead of creating a second", async () => {
    const api = fakeApi([[bot(1, "unrelated"), bot(42, `${MARKER}\nold`)]]);
    const { io } = setup(api);
    expect(await postComment(io)).toEqual({ mode: "updated" });
    expect(writes(api)).toHaveLength(1);
    expect(writes(api)[0]).toMatchObject({
      method: "PATCH",
      url: `${API}/repos/acme/app/issues/comments/42`,
    });
  });

  it("finds the comment on a later page", async () => {
    const full = Array.from({ length: 100 }, (_, i) => bot(i + 1, "x"));
    const api = fakeApi([full, [bot(500, `${MARKER}\nold`)]]);
    const { io } = setup(api);
    expect((await postComment(io)).mode).toBe("updated");
    expect(writes(api)[0]?.url).toContain("/comments/500");
  });

  it("ignores a comment with the marker that a person wrote, or that does not start with it", async () => {
    const api = fakeApi([
      [
        { id: 1, body: `${MARKER}\nfake`, user: { type: "User" } },
        bot(2, `quoted ${MARKER}`),
      ],
    ]);
    const { io } = setup(api);
    expect((await postComment(io)).mode).toBe("created");
    expect(writes(api)[0]?.method).toBe("POST");
  });

  it("posts nothing for an empty diff when there is no comment", async () => {
    const api = fakeApi();
    const { io, summary } = setup(api, { body: "" });
    expect(await postComment(io)).toEqual({ mode: "none" });
    expect(writes(api)).toEqual([]);
    expect(summary).toEqual([]);
  });

  it("updates an existing comment to say nothing changed when the diff is now empty", async () => {
    const api = fakeApi([[bot(9, `${MARKER}\nold`)]]);
    const { io } = setup(api, { body: "" });
    expect((await postComment(io)).mode).toBe("updated");
    expect(JSON.parse(writes(api)[0]?.body ?? "{}").body).toBe(
      `${MARKER}\nNo architectural change in the latest commit.`,
    );
  });

  describe("job summary", () => {
    it("a pull request from a fork never calls the API", async () => {
      const api = fakeApi();
      const { io, summary } = setup(api, { event: event("someone/app") });
      expect(await postComment(io)).toEqual({ mode: "summary" });
      expect(api.calls).toEqual([]);
      expect(summary.join("")).toContain("### Architecture changes");
    });

    it("a deleted head repository counts as a fork", async () => {
      const api = fakeApi();
      const { io } = setup(api, { event: event(null) });
      expect((await postComment(io)).mode).toBe("summary");
      expect(api.calls).toEqual([]);
    });

    it("comment: false and a missing token also use the summary", async () => {
      for (const env of [
        { SRCATLAS_COMMENT: "false" },
        { GITHUB_TOKEN: undefined },
      ]) {
        const api = fakeApi();
        const base = setup(api).io.env;
        const { io, summary } = setup(api, { env: { ...base, ...env } });
        expect((await postComment(io)).mode).toBe("summary");
        expect(api.calls).toEqual([]);
        expect(summary.length).toBeGreaterThan(0);
      }
    });

    it("a refused write (403) falls back to the summary and says so", async () => {
      for (const failing of ["GET", "POST", "PATCH"] as const) {
        const api = fakeApi(
          failing === "PATCH" ? [[bot(3, `${MARKER}\nold`)]] : [[]],
          { [failing]: 403 },
        );
        const { io, summary, logs } = setup(api);
        expect(await postComment(io)).toEqual({ mode: "summary-fallback" });
        expect(summary.join("")).toContain("### Architecture changes");
        expect(logs.join("\n")).toContain("403");
      }
    });

    it("an empty diff writes nothing to the summary", async () => {
      const api = fakeApi();
      const { io, summary } = setup(api, {
        body: "",
        event: event("someone/app"),
      });
      expect((await postComment(io)).mode).toBe("none");
      expect(summary).toEqual([]);
    });
  });

  it("any other API error fails the step", async () => {
    const api = fakeApi([[]], { POST: 500 });
    const { io } = setup(api);
    await expect(postComment(io)).rejects.toThrow(/500/);
  });

  it("uses GITHUB_API_URL, so it works on GitHub Enterprise Server", async () => {
    const api = fakeApi();
    const { io } = setup(api);
    await postComment(io);
    expect(api.calls.every((c) => c.url.startsWith(API))).toBe(true);
  });
});
