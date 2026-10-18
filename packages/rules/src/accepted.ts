import type { AcceptedEntry } from "@srcatlas/core";
import type { Violation } from "./evaluate.js";

/** The accepted-violations entry for a violation (docs/cli.md 3.5.2). */
export function toEntry(_v: Violation): AcceptedEntry {
  throw new Error("not implemented");
}

/** Splits violations into new ones and accepted ones, and lists entries whose violation is gone. */
export function applyAccepted(
  _violations: Violation[],
  _entries: AcceptedEntry[],
): { fresh: Violation[]; accepted: Violation[]; stale: AcceptedEntry[] } {
  throw new Error("not implemented");
}

/**
 * The entries `check --accept` writes: every violation when there is no file yet; otherwise
 * the existing entries that still occur, plus the new violations only when `add` is set.
 */
export function recordAccepted(
  _violations: Violation[],
  _existing: AcceptedEntry[] | undefined,
  _add: boolean,
): AcceptedEntry[] {
  throw new Error("not implemented");
}
