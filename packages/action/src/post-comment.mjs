// Plain ESM with no dependencies and no build step: the composite action runs this file
// as it is (docs/action.md, ADR 0012). Types are in post-comment.d.mts.

/** The marker that starts the Action's comment (docs/action.md 5). */
export const MARKER = "<!-- srcatlas:diff -->";

const NO_CHANGE = "No architectural change in the latest commit.";
const PAGE_SIZE = 100;
const MAX_PAGES = 50;

class Refused extends Error {}

/** A pull request from a fork, or whose head repository was deleted (docs/action.md 4). */
function isFork(event, env) {
  const head = event.pull_request.head.repo;
  return !head || head.full_name !== env.GITHUB_REPOSITORY;
}

/**
 * Keeps one srcatlas comment on the pull request up to date, or writes the job summary
 * when it cannot comment (docs/action.md 4 and 5).
 */
export async function postComment({
  body,
  event,
  env,
  fetch,
  appendSummary,
  log,
}) {
  const summary = (mode) => {
    if (body === "") return { mode: "none" };
    appendSummary(`${body}\n`);
    return { mode };
  };
  if (
    isFork(event, env) ||
    env.SRCATLAS_COMMENT === "false" ||
    !env.GITHUB_TOKEN
  ) {
    return summary("summary");
  }

  const repo = `${env.GITHUB_API_URL ?? "https://api.github.com"}/repos/${env.GITHUB_REPOSITORY}`;
  const headers = {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "srcatlas-action",
    "Content-Type": "application/json",
  };
  const call = async (method, url, payload) => {
    const res = await fetch(url, {
      method,
      headers,
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    });
    if (res.status === 403) {
      throw new Refused(`GitHub refused ${method} ${url} (403)`);
    }
    if (!res.ok) {
      throw new Error(`GitHub API ${method} ${url} failed: ${res.status}`);
    }
    return res;
  };

  try {
    const issue = `${repo}/issues/${event.pull_request.number}`;
    let existing;
    for (let page = 1; page <= MAX_PAGES && !existing; page++) {
      const res = await call(
        "GET",
        `${issue}/comments?per_page=${PAGE_SIZE}&page=${page}`,
      );
      const comments = await res.json();
      // The author check stops a person from making the Action edit their comment.
      existing = comments.find(
        (c) => c.user?.type === "Bot" && c.body.startsWith(MARKER),
      );
      if (comments.length < PAGE_SIZE) break;
    }

    if (body === "") {
      if (!existing) return { mode: "none" };
      await call("PATCH", `${repo}/issues/comments/${existing.id}`, {
        body: `${MARKER}\n${NO_CHANGE}`,
      });
      return { mode: "updated" };
    }
    const payload = { body: `${MARKER}\n${body}` };
    if (existing) {
      await call("PATCH", `${repo}/issues/comments/${existing.id}`, payload);
      return { mode: "updated" };
    }
    await call("POST", `${issue}/comments`, payload);
    return { mode: "created" };
  } catch (e) {
    if (!(e instanceof Refused)) throw e;
    log(`srcatlas: ${e.message}; writing the job summary instead`);
    return summary("summary-fallback");
  }
}
