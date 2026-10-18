# ADR 0012: The Action analyses clean checkouts of both sides and never installs dependencies

- Status: Proposed
- Date: 2026-10-18
- Deciders: Tunya

## Context
- The Action compares a pull request with its base (`docs/backlog.md`, M2 item 6). `srcatlas diff` analyses a git ref in a temporary worktree, which has no `node_modules`, while `WORKTREE` is analysed in place. The graph can differ with and without installed dependencies (`docs/extractors/nestjs.md` open question 5), so a ref against `WORKTREE` can show changes that are not in the code (`docs/cli.md` 3.4.2).
- Installing dependencies on a pull request from a fork runs that fork's install scripts. `SECURITY.md` promises that srcatlas does not execute analysed code; ADR 0006 limits the one exception to the config file, which fork pull requests load from the base branch.
- Every golden fixture is analysed without `node_modules`, so that is the mode the tests cover.

## Decision
We will have the Action run `srcatlas diff <base-sha> <head-sha>` on two commits, so both graphs come from clean worktrees analysed the same way, and it will never install the analysed project's dependencies. The base is `github.event.pull_request.base.sha`; the head is `GITHUB_SHA`, the test-merge commit. Only the `pull_request` event is supported; `pull_request_target` is refused.

## Alternatives considered
| Option | Why not |
|---|---|
| Head in place (`WORKTREE`), base in a worktree | The two sides differ in environment, which shows up as spurious diffs. |
| Install dependencies in both checkouts | Runs install scripts of fork code, doubles the install time, and breaks the "no execution of analysed code" promise. |
| Install in the job and symlink `node_modules` into the base worktree | Fragile for pnpm and per-package `node_modules`, and still installs fork code. |
| A graph stored by a default-branch workflow as the baseline | Needs a second workflow, an `actions: read` permission and a plan for a missing artifact. Revisit if analysing the base twice is too slow. |
| `pull_request_target` | Gives fork pull requests a write token next to untrusted code. |

## Consequences
- Good: both sides are compared like for like; no install step, so no fork code runs; the same code path as running `srcatlas diff` locally; the tested mode (no `node_modules`) is the production mode.
- Bad: facts that need installed type information, such as the Prisma `proof: "type"`, are less precise in the Action than in a local `analyze` with dependencies installed. `docs/action.md` says so.
- Bad: the base is analysed on every run unless the CLI cache is restored (`docs/action.md` shows how).
- Harder: if install-aware analysis is wanted later, it needs its own decision about which side installs and what runs on forks.

## Revisit when
- The Prisma or NestJS benchmark shows that the no-install mode loses accuracy that matters for diffs.
- Analysing the base on every run is too slow for repositories we pilot.
