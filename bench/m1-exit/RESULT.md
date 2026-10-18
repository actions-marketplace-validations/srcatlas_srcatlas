# M1 exit check: result

Outcome: **pass**. Rules: [RULES.md](RULES.md), merged before this file. Numbers are as measured; nothing was changed after seeing them. One app, tier C: this shows the pipeline works on real code, not how accurate it is.

Target: crwsync `apps/backend` (`@crwsync/backend`) at `030ebf2e8f3288c019ebd1c5c827ebf026778304`. srcatlas `e10f8914e7ae08555dfe14f7113ed1605eb7aabb` (0.7.0). Oracle: Nest 11.1.19, Prisma 7.7.0, Node v24.11.1.

## Gate

| Measure | Result | Threshold | |
| --- | --- | --- | --- |
| Module recall | 22 / 22 = 1.00 | 0.90 | pass |
| Provider recall | 34 / 34 = 1.00 | 0.90 | pass |
| `injects` recall | 75 / 83 = 0.9036 | 0.80 | pass |
| Byte-identical on 3 systems | one SHA-256 on ubuntu, macOS, Windows | identical | pass |

Not gated: controllers 23 / 23, `contains` 52 / 52, `imports` 50 / 102 = 0.4902. Every emitted element in scope is `certain`, so the `certainOnly` block equals `all`.

## Two inputs, same numbers

The first run analysed the working directory (`C:\projects\crwsync`, which also holds ignored files such as installed packages). I then analysed a clean clone at the same commit, because that is what CI sees. Recall is identical on every kind; the clean clone matches the CI graph byte for byte (`65ced742…dd9f`), the working directory does not (`693f18ec…f09c`). Files: `run-1/score-working-tree.json`, `run-1/score-clean-clone.json`, `run-1/oracle.graph.json`, the two reports.

## Misses and extras, with causes

| What | Cause |
| --- | --- |
| 52 `imports` edges missing (all to `PrismaModule`, `RedisModule`, `StorageModule`) | Oracle limit. These three modules are `@Global()`; the runtime binds them into every module's imports, the source never lists them. Not an extractor miss. Follow-up: the oracle should leave implicit global bindings out. |
| 8 `injects` edges missing (`ChatGateway` 6, `StatusGateway` 2) | Not implemented: both classes use `@WebSocketGateway` and no `@Injectable`, and `injects` is read only from `@Injectable` classes and controllers. Gateway group N-G (P1, M2). |
| Extra provider nodes `OwnershipGuard`, `TimeoutInterceptor` | By design (N-P11, unregistered `@Injectable`, `module = null`). The runtime never sees a class no module lists: oracle limit. |
| Extra provider node `APP_GUARD` and 3 edges, clean clone only | Not an error of either input, but a difference between them: with installed packages `APP_GUARD` is a constant from `@nestjs/core`, so `{ provide: APP_GUARD, useClass: ... }` gives 3 more `nest.unresolved-provider-token` warnings and 2 more `nest.unregistered-provider` infos; without them it is a name from a module, becomes a token node and the two guards count as used. The graph depends on whether dependencies are installed (`docs/extractors/nestjs.md` open question 5). The clean clone is the better result. |
| Oracle `injects` truth leaves out 24 dependencies | Oracle v0 has no custom-provider tokens (queues, config tokens). The `injects` figure covers class-to-class injection only. |

## How the run went

Rule 1 (failures of commands are fixed and recorded):

1. `dump.cjs` failed: the dependency links in `C:\projects\crwsync\node_modules` pointed to the old location `C:\crwsync`. Fixed with `pnpm install --frozen-lockfile` (tracked files unchanged).
2. `dump.cjs` failed: the Prisma client had not been generated. Fixed with `pnpm run prisma:generate` in the backend (`DATABASE_URL` set to a dummy value; no database is contacted).
3. The old `dist` was replaced by `pnpm run build` so the oracle runs on a build made now from the pinned commit (the working tree was clean). `app.module.js` came out the same size.
4. Oracle, analyse, score once; then the clean clone was analysed and scored against the same oracle.

The oracle, the scorer, the thresholds and RULES.md were not touched after the first score.

## What this does not show

One app, the maintainer's own, with a runtime oracle that omits custom providers and implicit global imports. The tier B gates of `docs/accuracy.md` section 7 still apply to other applications.
