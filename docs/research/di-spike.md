# DI feasibility spike: ts-morph on a real NestJS app

Gate from `docs/accuracy.md` section 7 and ADR 0009. Status: started, nothing scored yet.

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
| Oracle bootable without external services? | |
| Module recall / provider recall / injects recall | |

## Decision

Proceed / narrow scope (Prisma models + route-level graph) / stop. Not decided.
