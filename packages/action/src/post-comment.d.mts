export interface PullRequestEvent {
  pull_request: {
    number: number;
    base: { sha: string };
    head: { repo: { full_name: string } | null };
  };
}

export interface PostCommentIo {
  /** The Markdown from `srcatlas diff --format markdown`; empty when nothing changed. */
  body: string;
  event: PullRequestEvent;
  env: Record<string, string | undefined>;
  fetch: (
    url: string,
    init: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
    },
  ) => Promise<{
    ok: boolean;
    status: number;
    json: () => Promise<unknown>;
  }>;
  appendSummary: (text: string) => void;
  log: (line: string) => void;
}

export type PostCommentResult =
  | { mode: "created" | "updated" }
  | { mode: "summary" | "summary-fallback" | "none" };

/** The marker that starts the Action's comment (docs/action.md 5). */
export const MARKER: string;

/** Keeps one srcatlas comment on the pull request up to date (docs/action.md 4 and 5). */
export function postComment(io: PostCommentIo): Promise<PostCommentResult>;
