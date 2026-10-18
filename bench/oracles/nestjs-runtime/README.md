# NestJS runtime oracle (v0)

Ground truth for NestJS modules, providers, controllers and injection, read from the framework itself (`docs/accuracy.md` section 2). It boots the app in Nest's preview mode (no provider is instantiated, no database or Redis is needed) and reads `ModulesContainer`.

```
node bench/oracles/nestjs-runtime/run.mjs <app-dir> <entry.ts> <RootModule> [--out graph.json] [--install name@version]...
node bench/oracles/nestjs-runtime/diff.mjs <oracle.graph.json> <other.graph.json>
```

| File | Does |
|---|---|
| `run.mjs` | Copies the app to a temp directory, installs its dependencies (network), compiles with decorator metadata, runs `dump.cjs` and `convert.mjs`. The app is never modified. |
| `dump.cjs` | The raw runtime dump (used as is by `bench/spike-di`). Run it on an already built app. |
| `convert.mjs` | Raw dump to a srcatlas graph file (valid by `validateGraph`): `module`, `provider`, `controller` nodes; `imports`, `contains`, `injects` edges. Only classes the app declares are included; the declaration is found by a plain-text scan, not by an extractor. |
| `diff.mjs` | Compares two graph files by the rule of accuracy.md section 1 (nodes by id and kind, edges by from, kind, to) on what the oracle covers. A check, not the scorer. |

## What it does not cover (v0)

- Custom providers (string and symbol tokens, factories, values): skipped and counted on stderr.
- Routes.
- Classes no module lists (an unregistered controller, N-R9): the runtime never sees them, so the oracle cannot confirm or deny them. Expect them under "only in other".
- A class name declared in two files: the runtime dump has no file, so it is skipped and named on stderr.
- `source.line` is the line of the `class` keyword, not of its first decorator.
- Providers that Nest adds itself (the module class, `ModuleRef`, `ApplicationConfig`) are left out.

## Things worth knowing

- **`import type` hides injections.** TypeScript emits `Object` for a decorated constructor parameter whose class was imported with `import type`, so the framework sees no dependency. Biome's `useImportType` rewrites imports this way, and the fixtures contain such imports. `run.mjs` turns `import type {` into `import {` in its copy.
- **Nest 10 in preview mode** returns `null` for `app.get(ModulesContainer)`; `dump.cjs` falls back to `app.container.getModules()`.

## Fixtures (checked 2026-10-18, Nest 10.4.0)

Oracle graph against the hand-written `expected.graph.json`, compared by `diff.mjs`:

| Fixture | Result |
|---|---|
| `nest-basic`, `nest-routing-prefix-env`, `nest-routing-two-apps`, `prisma-client-decoys` | Identical on modules, providers, controllers, `imports`, `contains`, `injects`. |
| `nest-routing` (`--install @nestjs/microservices@10.4.0 --install @nestjs/graphql@12.2.0`) | Identical except `OrphanController`, which no module lists (expected, see above). |
| `nest-modules`, `nest-dynamic`, `nest-di-custom`, `nest-di-resolution`, `prisma-client` | Cannot boot: they import packages that do not exist (`external-lib`) or need a database (`TypeOrmModule`), call code that is not defined (`pickScope`), leave dependencies unresolvable on purpose, or need a generated Prisma client. They are static-analysis fixtures, not runnable apps. |

This answers `docs/accuracy.md` section 10 question 1 only in part: apps whose root module needs no external service boot; the others fall back to hand labels.
