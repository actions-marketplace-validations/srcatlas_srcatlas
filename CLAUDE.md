# srcatlas: instructions for coding agents

srcatlas statically analyses TypeScript repositories (NestJS, Next.js App Router, Prisma first) and writes a deterministic, versioned architecture graph (`srcatlas.graph.json`). A differ, rules engine, renderer, viewer and GitHub Action read only that file.

Read this file first. Then read the doc that matches your task (section 2). If a doc and the code disagree, stop and say so. Do not pick one silently.

## 1. Non-negotiables

1. **The graph schema is the contract.** `docs/schema.md` defines it. Change the schema doc and the Zod schema in the same commit, and bump `schemaVersion` per its compatibility policy.
2. **Deterministic output.** Same commit, same bytes. No timestamps, hostnames, absolute paths, branch names or timings in the graph file (they go in the report file). Sort with code-unit comparison, never `localeCompare`. Never iterate a `Map`/`Set`/object in insertion order when emitting. See schema section 9.
3. **Never guess.** If a construct cannot be resolved, emit nothing or emit with confidence `unresolved`, and add a report entry with a code from the extractor doc. A wrong `certain` element is a bug.
4. **Match decorators and calls by import origin, not by name.** `@Controller` counts only if it resolves to `@nestjs/common`. Decoy fixtures exist to catch this.
5. **Dependencies point downward.** `core` depends on nothing. Extractors depend on `core`. Differ, rules, renderer, viewer and action depend on `core` and never on `analyzer`. The viewer and differ must run in a browser and in Node.
6. **No network access in the analyser.** No telemetry. No code leaves the machine unless the user runs the optional publish command.
7. **No new runtime dependency without a one-line justification in the PR description.** Prefer the standard library.

## 2. Where to read

| Task | Read |
|---|---|
| Anything touching nodes, edges, IDs, diff | `docs/schema.md` |
| NestJS extractor | `docs/extractors/nestjs.md` (pattern IDs N-M1 and so on, report codes, fixture plan) |
| Accuracy, benchmarks, README numbers | `docs/accuracy.md` |
| Why the product exists, what not to claim | `docs/research/landscape.md` |
| Project goals, order of work, what "done" means | `docs/adr/0009-portfolio-first-scope-and-order.md`, `scripts/backlog.json` |
| Product scope, milestones | the spec (Claude Docs, "srcatlas: Technical Specification"). Where it differs from `docs/`, the `docs/` files win. |

Planned and not written yet: Next.js, BullMQ and Socket.IO extractor docs. If your task needs one, write it first or ask.

## 3. Repository layout

```
packages/core          Zod schema, ID rules, builder, shared types (no deps)
packages/analyzer      loads projects, runs extractors in workers, links, validates
packages/extractor-*   one per framework (nestjs, prisma, nextjs; later bullmq, socketio)
packages/differ        graph comparison, cycles
packages/rules         rule evaluation
packages/renderer      ELK layout, SVG and Mermaid
packages/viewer        Vite + React app
packages/action        GitHub Action
packages/cli           commands, config loading
apps/site              landing page and docs
apps/worker            optional publisher (Cloudflare Worker + R2), P1
bench/                 corpus references, oracles, scorer
fixtures/              synthetic apps with golden graph files
docs/                  specs and decisions
```

## 4. Stack

TypeScript strict, Node 20+, ESM. pnpm workspaces + Turborepo. `ts-morph` for analysis. Zod for schemas. Vitest for tests, Playwright for viewer end-to-end. Biome for lint and format. Changesets for releases. tsdown (or tsup) for libraries, Vite for the viewer. MIT licence.

## 5. Commands

Available now:

```
pnpm install
pnpm build            # turbo run build
pnpm test             # vitest, all packages
pnpm lint             # biome check
pnpm typecheck
pnpm check:deps       # dependency direction (non-negotiable 5)
```

Not yet defined (arrive with their milestones):

```
pnpm bench            # accuracy scorer (docs/accuracy.md)
pnpm srcatlas analyze fixtures/nest-basic   # run the CLI from source
```

Run `pnpm lint && pnpm typecheck && pnpm test` before declaring work done.

## 6. How to work

- **One pattern or one feature per change.** For extractors: one pattern ID from the extractor doc per commit where practical.
- **Test first for extractors.** Add or update the fixture, write the expected golden graph by hand from the pattern's spec, then implement. Do not generate the golden file by running the extractor and accepting its output.
- **Golden files are reviewed, not regenerated.** An updated golden file needs a sentence in the PR saying which pattern ID and why.
- **Definition of done (extractor feature):** fixture added, golden file updated, unresolved cases documented with report codes, docs updated, benchmark unchanged within budget.
- **Decoys matter.** For every pattern add a case that looks similar and must produce nothing.
- **Do not widen scope.** If you find a gap in a doc, add it to that doc's "Open questions" and continue with the documented behaviour. Do not invent behaviour.
- **Ask when blocked.** Ambiguity in the schema or a pattern: ask. Do not resolve it by guessing.
- **Extractor patterns are two commits** (ADR 0010). First the fixture, the hand-written golden file and a failing test, for the maintainer to approve; then the implementation.
- **Never weaken a check to pass.** Do not edit golden files, expected reports, thresholds or gates to turn a run green. If you think the specification or the golden file is wrong, stop and say so. A legitimate change is its own commit with the pattern ID and the reason.
- **Report what you ran.** End every task with the exact commands run and their results. Say "not run" for anything skipped. Do not call work done on your own word; CI, the determinism check and the oracle decide.
- **Protected without approval:** `docs/schema.md` and the Zod schema, `docs/adr/`, this file, CI and release configuration, the licence, and the dependency list.

## 7. Code conventions

- No `any`. Use `unknown` and narrow. No non-null assertions outside tests.
- Pure functions for graph transforms; no hidden global state. The builder is the only way to create nodes and edges, so validation always runs.
- Errors: throw typed errors for programmer mistakes; report entries for analysed-code problems. Analysed code being strange is never an exception.
- Paths in the graph are repository-relative with `/` separators. Never `path.resolve` into output.
- Comments explain why, not what. Public functions in `core` get a short doc comment.
- File names kebab-case. One exported concept per file for extractors.

## 8. Testing rules

- Unit tests next to source; fixtures under `fixtures/<name>/` with `expected.graph.json`.
- Every graph produced in tests passes the schema's validation invariants (schema section 10).
- Determinism test: analyse a fixture twice from different working directories; byte-compare.
- Windows paths and line endings must pass in CI (the CI matrix covers Linux, macOS, Windows).
- Snapshot tests are not allowed for graphs. Use explicit golden files.

## 9. Accuracy and claims

- Do not write accuracy numbers anywhere by hand. The README number is generated from `bench/results/`.
- Do not claim "accurate", "complete" or a comparison with a named tool's accuracy. See `docs/accuracy.md` section 8.
- Do not name or link to small competing projects in docs or README.

## 10. Git and releases

- Conventional commits (`feat(extractor-nestjs): N-P4 custom providers`).
- Small commits; no force-push to `main`.
- User-visible change needs a Changeset.
- Do not publish to npm, create tags or edit CI secrets. The maintainer does these.

## 11. Out of scope for agents

Do not, without being asked: add frameworks beyond the docs, add AI/LLM calls to the analyser, add a database or server to the core path, add telemetry, rename packages, or change the licence.

## 12. Current status

Pre-work, M0, M1 and M2 are closed. M0 delivered the monorepo, tooling and CI matrix; the Zod schema, ID rules, `GraphBuilder` and `validateGraph`; the golden-file harness; the CLI skeleton; and Changesets with an npm release that publishes with provenance through trusted publishing.

M1 delivered: the NestJS extractor (modules, dynamic modules, providers and injection for providers and controllers, controllers, routes and the global prefix, decoys); the Prisma extractor (models from schema files, client calls to `reads` and `writes` edges through the access-fact link pass of ADR 0011); `srcatlas analyze` and `srcatlas init`; the NestJS runtime oracle and the first scorer in `bench/`; and a determinism workflow that compares one real repository byte for byte on three systems. The M1 exit gate was met on one tier-C app under pre-registered rules: module recall 1.00, provider recall 1.00, `injects` recall 0.9036 (`bench/m1-exit/RESULT.md`). Carried forward: `injects` from gateways (N-G), `@InjectQueue` (N-Q2) and inherited constructor injection (N-P9); the `clientNames` and `schema` settings are not read yet because the extractor context carries no package config; the graph differs with and without installed dependencies (`docs/extractors/nestjs.md` open question 5).

M2 delivered: the differ (node and edge diff, moves, new cycles, new cross-module edges), `depends_on` edges between workspace packages, the Mermaid mini-graph, `srcatlas diff` with git refs and a graph cache, `srcatlas check` with `forbidden-edge`, `no-cycles` and an accepted-violations file, and the pull request comment Action with `--config-ref`. The pilot (#60, `docs/pilot.md`) passed: a correct comment in 21 to 24 seconds on the sandbox and on three pilot repositories, and 10 of 10 sandbox cases. The Action is tagged `v0.1.0` with a moving `v0`, and the `init` workflow template uses it with `version` pinned (`docs/action.md` section 8).

Next is M3, NestJS accuracy + launch. Order of work (ADR 0009, `scripts/backlog.json`): M3 NestJS accuracy + launch. Coding-agent work, M4 (Next.js) and M5 (viewer) follow by priority once the M3 gate is met. Milestones carry no dates. Do not start a later milestone's package before its milestone. Update this section as milestones close.
