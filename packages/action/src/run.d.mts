import type { PostCommentIo, PullRequestEvent } from "./post-comment.mjs";

export interface RunIo {
  env: Record<string, string | undefined>;
  readEvent: () => PullRequestEvent;
  /** Runs a program with an argument list, without a shell. */
  spawn: (
    command: string,
    args: string[],
  ) => { status: number | null; stdout: string; error?: Error };
  postComment: (io: PostCommentIo) => Promise<unknown>;
  fetch: PostCommentIo["fetch"];
  appendSummary: (text: string) => void;
  log: (line: string) => void;
}

/** Runs `srcatlas diff` for the pull request and posts the result. Returns the exit code (docs/action.md). */
export function runAction(io: RunIo): Promise<number>;
