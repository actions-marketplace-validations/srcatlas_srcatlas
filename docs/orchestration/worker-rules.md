# Worker rules

Rules for a coding agent that works on exactly one GitHub issue in its own git worktree. They apply to every milestone. `CLAUDE.md` and `CONTRIBUTING.md` still apply; where this file is stricter, follow this file.

## Scope

1. One issue is one pull request. Open it against the branch your worktree was created from (the integration branch for the milestone, not necessarily `main`).
2. The PR body contains `Closes #N` for your assigned issue. Use the issue number you were given.
3. Stay within the issue's scope. Write anything else you find (bugs, doc gaps, cleanups) under "Out-of-scope findings" in the PR description. Do not fix it.
4. Do not change lockfiles, CI or workflow config, release or changeset config, or the dependency list unless the issue requires it. Say so in the PR if it does.
5. Do not touch shared types, schemas, fixtures, golden files or mock generators unless the issue says so. If you must, say so prominently at the top of the PR description and explain why.
6. If the issue is ambiguous, contradicts a doc, or you are blocked, stop and ask. Do not guess.

## Before opening the PR

Run these from the repository root, fix every failure, and paste the commands with their results in the PR description:

```sh
pnpm lint
pnpm typecheck
pnpm test
```

Also run `pnpm build` and `pnpm check:deps` when you changed package code or dependencies (CI runs both). Write "not run" for anything you skipped. Never edit a test, golden file, threshold or gate to turn a run green.

## Changesets

Add a changeset (`pnpm changeset`) when the change is user-visible: CLI behaviour or output, the graph format, config, the Action, or a published package's API. Docs-only, test-only and internal changes need none; write "n/a" in the PR's Changeset line.

## Commits

Conventional commit messages, for example `feat(extractor-nestjs): N-P4 custom providers`. Sign off every commit (`git commit -s`). Do not push to `main` or the integration branch directly, force-push shared branches, merge your own PR, create tags, or publish.
