# srcatlas: competitive landscape

Status: draft 1, 2026-10-09. Read together with the spec and `docs/schema.md`.

## 1. Scope and inclusion rule

Included: tools with broad recognition (large star counts, a commercial owner, or an official place in a framework's own tooling) that a developer would plausibly use *instead of* srcatlas.

Excluded on purpose: small single-maintainer projects with little adoption, including several recent open-source attempts at the same idea. They are not named here. They do show that the idea is easy to imagine, which makes execution quality and the accuracy claim the real differentiators (section 6).

Star counts were read from GitHub pages on 2026-10-09 and move over time. Release dates were not available from the fetched pages, so maintenance status is only stated where a source gave it.

## 2. Landscape by category

| Category | Tool | What it shows | Framework awareness | PR-time architecture diff | Cost / licence |
|---|---|---|---|---|---|
| Framework-official | NestJS Devtools (+ CI/CD integration) | Module/provider graph of a NestJS app, graph replay | NestJS only | Yes: compares PR graph to the published base graph, can flag e.g. a removed guard or a newly global module | CI/CD integration is on the Enterprise plan; hosted registry, API key required |
| AI-generated docs | DeepWiki (Devin) | Generated wiki and diagrams for a repository | Generic (LLM reads code) | No | Not verified |
| AI-generated docs | DeepWiki-Open (community clone, 18.1k stars) | Self-hostable wiki generation | Generic (LLM) | No | Open source; needs an LLM provider |
| Monorepo tooling | Nx project graph (29.3k stars, MIT) | Project-to-project dependency graph in a workspace | Project level, not code concepts | Affected-project detection, not an architecture diff | MIT; paid cloud features exist |
| Import graphs | dependency-cruiser (7.2k stars, MIT) | File/folder import graph, rule validation | None (imports only) | Rule violations, no graph diff | MIT |
| Import graphs | Madge (10.2k stars, MIT) | Module dependency graph, circular imports | None (imports only) | No | MIT; stale since Aug 2024 |
| Visual understanding | CodeSee | Code maps, PR review maps | Generic | Yes | Acquired by GitKraken in May 2024; no longer an independent product |

Sources:
- NestJS Devtools CI/CD: https://docs.nestjs.com/devtools/ci-cd-integration
- DeepWiki-Open: https://github.com/AsyncFuncAI/deepwiki-open
- Nx: https://github.com/nrwl/nx
- dependency-cruiser: https://github.com/sverweij/dependency-cruiser
- Madge: https://github.com/pahen/madge
- CodeSee / GitKraken: acquisition noted May 2024 (from earlier research in this project; re-check the primary announcement before citing publicly).

## 3. Competitor notes

### NestJS Devtools (closest overlap)
- Per-build graph snapshot published to the Devtools registry. Needs an API key, repo, commit SHA, branch.
- `PUBLISH_GRAPH` boots the app in preview mode. Constructors and lifecycle hooks do not run, so no database is needed. The app is still bootstrapped, so the build must be able to load the module graph.
- PR reports compare against the base graph on the registry. Graph replay colours changes green, white, red.
- CI/CD integration is Enterprise-plan only.
- NestJS only. Nothing for Next.js routes, Prisma models, queues, or sockets beyond what Nest itself models.
- Not established from the docs: whether the graph is built statically or from the live DI container. Treat it as runtime-derived until proven otherwise.

### DeepWiki and clones
- Output is LLM-generated prose and diagrams. Cheap to start, but not reproducible: two runs can differ, and a diagram can contain invented edges.
- No PR diff, no CI gate, no machine-readable graph contract.

### Nx, dependency-cruiser, Madge
- Answer "which file/project imports which". They do not know that a class is a NestJS provider, that a file is a Next.js route handler, or that a service writes a Prisma model.
- dependency-cruiser is the strongest of the three as a rule engine. It is the tool people reach for to enforce layering, so srcatlas rules should not try to replace it on import-level checks.
- Madge is stale. Its audience is available but not served well.

### CodeSee
- Proved that PR-time visual maps are wanted, then ended as an independent product. Signal: demand exists; a venture-backed hosted model did not survive. A free, local, open-source model avoids that failure mode.

## 4. The gap

No recognised tool combines all of:
1. Static analysis, no running app, no database.
2. Framework concepts across a typical full-stack TS repo (NestJS, Next.js App Router, Prisma, later BullMQ and Socket.IO) in one graph.
3. PR architecture diff using only `GITHUB_TOKEN`, no hosted account.
4. Free and open source.
5. Deterministic, versioned, machine-readable output (`srcatlas.graph.json`).

NestJS Devtools has 3 for Nest only, behind Enterprise. Import-graph tools have 1 and 4 with no framework concepts. AI wikis have breadth but none of 1, 3, 5.

## 5. Positioning

One line: **the architecture of your TypeScript repo as a diffable file, checked on every pull request.**

| Against | Message | Do not claim |
|---|---|---|
| NestJS Devtools | Works without a registry, account, or Enterprise plan. Covers the rest of the stack, not only Nest modules. Static: no app bootstrap. | That it replaces Devtools' live graph replay or debugging tooling. |
| DeepWiki and clones | Deterministic: same commit, same graph, byte for byte. Every edge cites file and line. Accuracy is measured and published. | That it explains code. It maps structure; it does not write prose. |
| Nx / dependency-cruiser / Madge | Shows framework concepts (routes, providers, models, queues), not files. Complements them: keep dependency-cruiser for import rules. | That it replaces import-level rules. |
| CodeSee | Same PR-time value, no vendor to disappear: runs in your CI, no code leaves it. | Any continuity with CodeSee users. |

Primary audience for v1: NestJS + Next.js + Prisma teams and solo developers. Secondary: anyone using coding agents who needs a compact, trustworthy structure file (v1.1 `agents-md`, MCP).

## 6. Risks to the positioning

| Risk | Likelihood / impact | Response |
|---|---|---|
| NestJS adds free CI diffs | Low-medium / high for Nest-only users | Lead with the multi-framework graph; Nest is one extractor, not the pitch. |
| DeepWiki adds PR diffs | Medium / medium | Accuracy and determinism are the moat; keep `docs/accuracy.md` published and current. |
| Static analysis cannot match runtime DI accuracy | Medium / high | The 1-2 day DI feasibility spike is a gate before M1. Report `unresolved` edges honestly instead of guessing. |
| Small open-source clones appear | High / low | Ship earlier on quality: fixtures, measured precision/recall, working Action. |
| "Diagram tool" is a vitamin, not a painkiller | Medium / medium | The painkiller is the PR check: unreviewed changes to guards, global modules, queue consumers. Build rules around that. |
| Existing architecture-rule tools already cover part of the "check" pitch | Medium / medium | Not researched yet (section 8). Hypothesis to verify: srcatlas rules work on framework concepts (a controller reading a model), which import-level boundary rules cannot express. If that is false, the rules angle needs a different claim. |

## 7. Decision

Proceed as specified. Changes to make:
1. Frame the product as a **diffable architecture file plus PR check**, with the viewer secondary. Rewrite the spec's opening accordingly.
2. Make the accuracy claim a first-class deliverable (`docs/accuracy.md`) and put the number in the README.
3. Do not market against Nx or dependency-cruiser. Position as complementary.
4. Keep the DI feasibility spike as the go/no-go gate.
5. Scope and order of work follow `docs/adr/0009-portfolio-first-scope-and-order.md`: portfolio first, traction second, demand validation with users deferred.

## 8. Not verified

- Whether NestJS Devtools builds its graph statically or at runtime.
- Exact Devtools pricing beyond "Enterprise".
- DeepWiki (Devin) pricing and limits.
- Primary source for the CodeSee/GitKraken date.
- Structurizr/C4 tooling, Sourcegraph, Backstage, draw.io and Mermaid ecosystems were not researched. They are modelling or portal tools rather than extractors, but this is an assumption.
- Star counts and release dates are a snapshot from 2026-10-09; release dates were not retrievable.
- The same-name repository you found earlier has not been reviewed.
- Architecture-rule tools were not researched: ESLint boundary plugins, Nx module-boundary rules, and ArchUnit-style libraries for TypeScript. Check what they can express, how they are adopted, and whether any works on framework concepts.
- Tools that give coding agents a repository map or code graph (for example over MCP) were not researched. Relevant only if the agent audience (v1.1) is pursued.
- Whether enough developers want PR-time architecture checks is unvalidated (ADR 0009 defers user interviews).
