# ADR 0001: Static analysis, not a running app

- Status: Accepted
- Date: 2026-10-09
- Deciders: Tunya

## Context
A framework-aware architecture graph can be built two ways: by reading the code (static), or by booting the application and inspecting what the framework resolved (runtime). `docs/research/landscape.md` shows that NestJS's official tooling boots the application in preview mode to publish its graph, and ties PR diffs to a hosted registry on an Enterprise plan. The product's gap is a free tool that works on a plain checkout in CI, on any supported repository, with no database, secrets or services.

## Decision
The analyser reads source code and project files only. It does not import, execute or boot the analysed application, and makes no network calls. Runtime behaviour is used only as a test oracle (`docs/accuracy.md` section 2), never in the product.

## Alternatives considered
| Option | Why not |
|---|---|
| Boot the app and read the DI container | Needs the app to start: environment variables, databases, third-party services, build output. Executes untrusted repository code in CI. Cannot cover Next.js routes, Prisma models, queues and sockets in one way. |
| Hybrid: static first, runtime refinement when available | Two code paths with different failure modes; makes determinism and accuracy claims harder. Can be revisited as an optional extractor. |
| LLM reads the code | Not reproducible, cannot be scored the same way, adds cost and a network dependency. |

## Consequences
- Good: runs anywhere `git checkout` works; safe on fork PRs (no repository code is executed); deterministic; no secrets needed.
- Bad: dynamic providers, computed tokens and reflection cannot be resolved. These are reported as `unresolved`, not guessed (`docs/schema.md` section 7).
- Bad: DI resolution must be reimplemented from the framework's documented rules (`docs/extractors/nestjs.md` section 3). That is the largest technical risk and is gated by the DI feasibility spike.

## Revisit when
- The DI spike misses its gate (module and provider recall below 0.90 against the runtime oracle).
- Tier B accuracy for NestJS stays below the v1.0 gate after two fix cycles.
