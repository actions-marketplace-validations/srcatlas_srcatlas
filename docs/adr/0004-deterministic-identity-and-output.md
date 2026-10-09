# ADR 0004: Deterministic node identity and byte-stable output

- Status: Accepted
- Date: 2026-10-09
- Deciders: Tunya

## Context
The product's value is the diff between two graphs and a graph file that can be committed or compared. If IDs depend on file paths or content hashes, a file rename looks like a deletion plus an addition. If output depends on time, machine or ordering, diffs contain noise and the claim "same commit, same output" fails.

## Decision
Node IDs are built from kind, package and qualified name (`provider:api/OrdersService`), never from file paths or content hashes. Edges are identified by `(from, kind, to)`; source locations are a `sites` list that does not take part in identity. Output has no timestamps, hostnames, absolute paths, branch names or timings (those go to the report file). Sorting uses code-unit comparison. Details in `docs/schema.md` sections 5 and 9.

## Alternatives considered
| Option | Why not |
|---|---|
| IDs from file path plus name | Moving a class between files changes its identity. |
| Content hashes | Any edit changes identity; diffs report everything as changed. |
| Sequential numeric IDs | Not stable between runs; unreadable. |
| Locale-aware sorting | Differs between machines. |

## Consequences
- Good: a moved file is not a change; an architecture-neutral commit produces an empty diff; committed SVG embeds change only when the architecture changes; determinism is testable (byte-compare across OS).
- Bad: two classes with the same name in one package collide; resolved by a documented suffix rule (`@<dir>`), which makes those IDs sensitive to directory changes.
- Bad: renaming a class is a removal plus an addition, except where the differ's move rule applies (same kind, name and package).

## Revisit when
- Collisions occur in more than 1% of nodes on tier B repositories.
- Rename detection beyond the v1 rule becomes a top user request.
