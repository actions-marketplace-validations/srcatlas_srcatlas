import { z } from "zod";
import { type Json, sortKeys } from "./serialize.js";
import { cmp } from "./validate.js";

// Source of truth: docs/cli.md section 3.5.2.

const id = z.string().min(1);

export const AcceptedEntry = z.union([
  z.strictObject({ rule: id, from: id, edgeKind: id, to: id }),
  z.strictObject({
    rule: id,
    over: z.enum(["modules", "packages"]),
    members: z.array(id).min(2),
  }),
]);
export type AcceptedEntry = z.infer<typeof AcceptedEntry>;

export const AcceptedFile = z.strictObject({
  version: z.literal(1),
  violations: z.array(AcceptedEntry),
});
export type AcceptedFile = z.infer<typeof AcceptedFile>;

/** Identity of an accepted violation: sites, severity and message do not take part. */
export function acceptedKey(e: AcceptedEntry): string {
  return "members" in e
    ? [e.rule, ...e.members].join("\0")
    : [e.rule, e.from, e.edgeKind, e.to].join("\0");
}

/** The canonical bytes of an accepted-violations file: entries sorted, keys sorted, 2-space indent. */
export function serializeAccepted(entries: AcceptedEntry[]): string {
  const sorted = [...entries].sort((a, b) =>
    cmp(acceptedKey(a), acceptedKey(b)),
  );
  const file: AcceptedFile = { version: 1, violations: sorted };
  return `${JSON.stringify(sortKeys(file as unknown as Json), null, 2)}\n`;
}
