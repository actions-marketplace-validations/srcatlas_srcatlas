# DI feasibility spike: ts-morph on a real NestJS app

Gate from `docs/accuracy.md` section 7 and ADR 0009. Status: oracle, extractor and scorer built; first score recorded below. Decision: proceed.

## Target

- App: crwsync `apps/backend` (maintainer's own project, tier C: not in the published accuracy number).
- Repo: https://github.com/JustTunya/crwsync, local `C:\crwsync`.
- Pinned commit: `030ebf2` (branch `feat/product-positioning-and-claude`). Re-pin if the target changes.
- Size at start (grep, not an oracle): 22 files with `@Module(`, 33 with `@Injectable(`, 21 with `@Controller(`. NestJS 11.
- Notable: `@nestjs/bullmq`, `@nestjs/websockets`, `@nestjs/config`, `@nestjs/jwt` (dynamic modules likely).

## Pass bar (fixed before scoring)

- Module recall >= 0.90 and provider recall >= 0.90 against the runtime oracle (`ModulesContainer`).
- `injects` edge recall >= 0.80 (set by the maintainer before scoring).

## Plan

1. Runtime oracle: boot the backend in preview mode, dump modules/providers/injects. Check whether it boots without Postgres/Redis (accuracy.md open question 1); else hand labels.
2. Provisional extractor: ts-morph, modules and providers first, then injects. Import-origin matching only (CLAUDE.md rule 4).
3. Score, then fill in the sections below.

## Log

| What | Result |
|---|---|
| Time spent | |
| What was hard | |
| What was unresolved | |
| Oracle bootable without external services? | Yes. `bench/oracles/nestjs-runtime/dump.cjs` boots `AppModule` with `NestFactory.create(..., { preview: true })` from `dist/app.module.js` (not `main.js`, which bootstraps on require). No Postgres or Redis needed. Output is byte-identical across three runs after normalising BullMQ random-id class names and `APP_*` UUID suffixes (first version was not deterministic). Needs `pnpm build` first. |
| Raw oracle counts (all modules incl. library ones) | 42 modules, 204 providers, 23 controllers, 18 injectables, 133 provider deps. Scoring must restrict to app-owned modules and drop framework internals (ModuleRef, the module class itself and similar). |
| Module recall / provider recall / injects recall | 22/22 = 1.00, 33/33 = 1.00, 98/107 = 0.916 (bar 0.90, 0.90, 0.80). Controllers 23/23. Measured once on crwsync `030ebf2`; one app, tier C. |
| Injects misses (9) | `@InjectQueue` (4, bullmq decorator not handled, extractor wrongly emitted `-> Queue` instead); guards used only via `@UseGuards` are never in a providers array (4: HasPendingInviteGuard, IsMemberGuard x2, WorkspaceRolesGuard); `JwtAuthGuard -> AuthModuleOptions` comes from the inherited passport `AuthGuard` mixin (N-P9). |
| Scorer changes after first run (disclosed) | First run gave provider recall 0.60 because Nest adds `ApplicationConfig` to every module; it is now treated as framework-internal like `ModuleRef`. `APP_GUARD:X` oracle entries are now scored as class `X`. Neither touches the extractor. |
| Extractor | `bench/spike-di/extract.mjs` (ts-morph 26, isolated `package.json`, not wired into any workspace). Decorators matched by import origin. ~8 s on the backend, deterministic. 0 unresolved entries. |
| Scorer | `bench/spike-di/score.mjs`. App-owned = class declared under `src/` by plain-text grep. |
| Caveats | Providers recall counts only providers in app-owned modules; library modules (Bull, Jwt, Mailer, ...) are excluded by that rule. The oracle ran on a build of the same commit. |

## Decision

**Proceed** with the NestJS + Prisma extractor as planned in ADR 0009; scope is not narrowed. No new ADR: the approach (static analysis with ts-morph, ADR 0001) is unchanged.

On one real app (crwsync `apps/backend`, `030ebf2`) the provisional extractor reached module recall 1.00 and provider recall 1.00 against the runtime oracle, and `injects` recall 0.916 against the 0.80 threshold set before scoring. All three gates passed. The runtime oracle boots in preview mode without Postgres or Redis, which settles the first open question in `docs/accuracy.md` section 10 for this app (other apps are untested).

What this does not show: it is a single app, it is the maintainer's own (tier C, not part of any published number), and the extractor was shaped around what that app uses. The 9 missed `injects` edges are known and map to documented patterns: `@InjectQueue` (N-Q2), guards reachable only through `@UseGuards`, and inheritance of constructor injection (N-P9). M1 must handle them, and the tier B gates in `docs/accuracy.md` section 7 still apply to other apps.

Dependency: `ts-morph` approved by the maintainer for the spike (`bench/spike-di`) and for the analyser, as named in CLAUDE.md section 4.
