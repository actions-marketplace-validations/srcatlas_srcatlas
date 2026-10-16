// Node ID rules, docs/schema.md section 5. IDs are opaque; compare exactly.

/** Thrown for malformed ID parts. A programmer mistake, not an analysed-code problem. */
export class InvalidIdError extends Error {}

// biome-ignore lint/suspicious/noControlCharactersInRegex: that is the check
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

function part(s: string): string {
  if (s === "" || CONTROL.test(s)) {
    throw new InvalidIdError(`invalid ID part: ${JSON.stringify(s)}`);
  }
  return s.normalize("NFC");
}

export const packageId = (name: string) => `package:${part(name)}`;
export const queueId = (name: string) => `queue:${part(name)}`;
export const externalId = (name: string) => `external:${part(name)}`;
export const eventId = (namespace: string, name: string) =>
  `event:${part(namespace)}#${part(name)}`;

/** module, provider, controller, gateway and model share one shape. */
export const classId = (
  kind: "module" | "provider" | "controller" | "gateway" | "model",
  pkg: string,
  name: string,
) => `${kind}:${part(pkg)}/${part(name)}`;

/** `path` must already be normalised (see `normalizeRoutePath`). */
export const routeId = (pkg: string, method: string, path: string) =>
  `route:${part(pkg)}/${part(method.toUpperCase())} ${part(path)}`;

/** `file` is repo-relative without extension. */
export const actionId = (pkg: string, file: string, exportName: string) =>
  `action:${part(pkg)}/${part(file)}#${part(exportName)}`;

export const fileId = (pkg: string, path: string) =>
  `file:${part(pkg)}/${part(path)}`;

/**
 * Section 5.2: when several nodes of one kind and package get the same ID, all
 * of them get `@<dir>` so adding a class never renames an existing node.
 * Returns IDs in input order. Same-directory duplicates stay equal; the
 * builder's uniqueness invariant reports them.
 */
export function withCollisionSuffix(
  entries: readonly { id: string; dir: string }[],
): string[] {
  const count = new Map<string, number>();
  for (const e of entries) count.set(e.id, (count.get(e.id) ?? 0) + 1);
  return entries.map((e) =>
    (count.get(e.id) ?? 0) > 1 ? `${e.id}@${part(e.dir)}` : e.id,
  );
}

/**
 * Section 5.3. Joins path pieces (NestJS global prefix, version, controller
 * path, handler path) into one normalised path. `:id` and `*` pass through.
 */
export function normalizeRoutePath(...pieces: string[]): string {
  const segs = pieces.flatMap((p) => p.split("/")).filter((s) => s !== "");
  return `/${segs.join("/")}`;
}

/**
 * Section 5.3 for Next.js: file-system segments to a normalised path.
 * `[id]` -> `:id`, `[...s]` -> `*s`, `[[...s]]` -> `*s` with optionalCatchAll,
 * `(group)` and `@slot` dropped. Returns null for intercepting routes
 * (`(.)x`, `(..)x`, `(...)x`): the schema does not define them, so the caller
 * must report instead of emitting a guessed path.
 */
export function nextRoutePath(segments: readonly string[]): {
  path: string;
  optionalCatchAll: boolean;
} | null {
  let optionalCatchAll = false;
  const out: string[] = [];
  for (const s of segments) {
    if (/^\(\.{1,3}\)/.test(s)) return null;
    if (/^\(.*\)$/.test(s) || s.startsWith("@")) continue;
    if (/^\[\[\.\.\..+\]\]$/.test(s)) optionalCatchAll = true;
    out.push(
      s
        .replace(/^\[\[\.\.\.(.+)\]\]$/, "*$1")
        .replace(/^\[\.\.\.(.+)\]$/, "*$1")
        .replace(/^\[(.+)\]$/, ":$1"),
    );
  }
  return { path: normalizeRoutePath(...out), optionalCatchAll };
}
