# ADR 0011: Extractors emit facts; the link pass turns them into edges

- Status: Accepted
- Date: 2026-10-17
- Deciders: Tunya

## Context
- The Prisma client part finds calls such as `this.prisma.order.findMany()`. The edge it implies, `reads` from the calling provider to a model, joins two nodes owned by different extractors: the caller by NestJS (later Next.js), the model by the Prisma schema part, possibly in another package (`docs/extractors/prisma.md` sections 1.2, 3, 8 question 1).
- Extractors run in parallel per package in a worker pool (ADR 0002). One extractor cannot see another's nodes while it runs, and node IDs are the other extractor's business (`docs/schema.md` section 5).
- The graph file is the only contract between components (ADR 0003). Whatever the extractors exchange internally must not leak into it.
- The runner interface (backlog M1, #16) is blocked on this decision.

## Decision
We will have extractors return **facts** next to nodes, edges and report entries, and the analyzer's link pass resolve the facts into edges after all extractors have finished.

1. **Result shape.** An extractor run returns `{ nodes, edges, facts, report }`. Nodes and edges are created through `GraphBuilder` as before. Facts are plain JSON-serialisable objects, so they cross the worker boundary by structured clone.
2. **Fact type.** Facts are a discriminated union `Fact` on `kind`, defined in `packages/core` (`facts.ts`) as TypeScript types, with Zod schemas for the runner to validate worker output. They are not part of `docs/schema.md`, are not in `graph.schema.json` and never reach the graph file. v1 has one variant:
   ```ts
   type AccessFact = {
     kind: "access";
     extractor: "prisma";
     package: string;      // package name of the caller, for visibility of schemas
     callerFile: string;   // repo-relative, "/" separators
     callerName: string;
     delegate: string;
     operation: string;
     site: { file: string; line: number };
     proof: "type" | "name";
   };
   ```
   Fields and meaning are those of `docs/extractors/prisma.md` section 3, plus `package` and the `kind` and `extractor` tags.
3. **Resolution lives with the extractor that defines the fact.** `extractor-prisma` exports a pure `resolveAccessFacts(facts, nodes)` that returns edges and report entries following section 3 of its doc. The link pass calls it with every node from every extractor. Edges are created through `GraphBuilder`, so validation still runs.
4. **Link pass order.** Collect all nodes, sort facts by code-unit order of `(callerFile, site.line, delegate, operation)`, run each resolver, then add cross-package `depends_on` edges. Output stays byte-stable (ADR 0004).
5. **Unresolved facts** are dropped and counted or reported with the codes in the extractor doc; they never become `unresolved` edges, since nothing is known about the target.

## Alternatives considered
| Option | Why not |
|---|---|
| Prisma extractor emits the edge directly | It must know the NestJS caller's node ID and that the node exists. That couples two extractors and breaks for models in another package. |
| Run Prisma after NestJS and hand it the NestJS nodes | Serialises extractors, loses per-package parallelism, and makes every extractor's input depend on the others. |
| Put facts in the graph file as a new section | Changes the contract for an internal need (ADR 0003, `docs/schema.md` section 12). |
| Generic link rules in the analyzer, no per-extractor resolver | Moves Prisma semantics (operation table, delegate naming) into the analyzer and breaks "extractors own their domain". |

## Consequences
- Good: extractors stay independent and parallel; cross-package and cross-extractor edges have one place to be resolved; the graph file format does not change; Next.js callers (PR-C12) only add facts, not coupling.
- Good: resolvers are pure functions of `(facts, nodes)`, so they are testable with hand-written inputs.
- Bad: one more interface to version inside the repository. Facts are internal, so a change needs no schema bump, but the extractor and the analyzer must change together.
- Bad: an extractor package that defines facts also holds link-time logic, so the analyzer depends on those exports.
- Harder: debugging a missing edge now has two steps (was the fact emitted, was it resolved). The report file records dropped facts by code to help.

## Revisit when
- A third fact kind appears and the union starts to need per-extractor registration.
- A third-party out-of-process extractor needs to emit facts: the wire format must then be specified, probably as a documented JSON file next to the graph fragment.
