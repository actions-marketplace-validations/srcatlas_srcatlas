import { type AcceptedEntry, acceptedKey } from "@srcatlas/core";
import type { Violation } from "./evaluate.js";

/** The accepted-violations entry for a violation (docs/cli.md 3.5.2). */
export function toEntry(v: Violation): AcceptedEntry {
  return "members" in v
    ? { rule: v.rule, over: v.over, members: v.members }
    : { rule: v.rule, from: v.from, edgeKind: v.edgeKind, to: v.to };
}

/** Splits violations into new ones and accepted ones, and lists entries whose violation is gone. */
export function applyAccepted(
  violations: Violation[],
  entries: AcceptedEntry[],
): { fresh: Violation[]; accepted: Violation[]; stale: AcceptedEntry[] } {
  const known = new Set(entries.map(acceptedKey));
  const seen = new Set<string>();
  const fresh: Violation[] = [];
  const accepted: Violation[] = [];
  for (const v of violations) {
    const key = acceptedKey(toEntry(v));
    if (known.has(key)) {
      accepted.push(v);
      seen.add(key);
    } else {
      fresh.push(v);
    }
  }
  return {
    fresh,
    accepted,
    stale: entries.filter((e) => !seen.has(acceptedKey(e))),
  };
}

/**
 * The entries `check --accept` writes: every violation when there is no file yet; otherwise
 * the existing entries that still occur, plus the new violations only when `add` is set.
 */
export function recordAccepted(
  violations: Violation[],
  existing: AcceptedEntry[] | undefined,
  add: boolean,
): AcceptedEntry[] {
  const current = violations.map(toEntry);
  if (!existing || add) return current;
  const known = new Set(existing.map(acceptedKey));
  return current.filter((e) => known.has(acceptedKey(e)));
}
