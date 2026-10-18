# srcatlas: GitHub Action (design)

Status: draft 1, 2026-10-18. This is the contract for the Action in `action.yml` and `packages/action`. Why it analyses clean checkouts and never installs: [ADR 0012](adr/0012-action-analyses-clean-checkouts-and-never-installs.md). Why fork pull requests read the config from the base: [ADR 0006](adr/0006-executable-typescript-config.md). The command it runs is `srcatlas diff` (`docs/cli.md` 3.4).

## 1. What it does

On a pull request it compares the base commit with the merged result and keeps **one comment** on the pull request up to date: the summary line, the table of counts, the new cycles and cross-module edges, and the Mermaid mini-graph (`docs/cli.md` 3.4.1, 3.4.2). It posts nothing when the diff has no architectural change.

## 2. Usage

```yaml
name: srcatlas
on:
  pull_request:
permissions:
  contents: read
  pull-requests: write
jobs:
  diff:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: srcatlas/srcatlas@v1
```

`fetch-depth: 0` is needed so that the base commit exists. The step needs Node 20 or newer, which `ubuntu-latest` has. Do not run an install step for srcatlas's sake: the Action does not use it (ADR 0012).

Inputs:

| Input | Default | Meaning |
|---|---|---|
| `version` | `latest` | The `srcatlas` npm version to run. Pin it for reproducible runs. |
| `fail-on` | none | Conditions for `srcatlas diff --fail-on`, one per line. The step fails after the comment is posted. |
| `max-nodes` | `40` | `--max-nodes`. |
| `comment` | `true` | `false` writes the job summary only. |
| `github-token` | `${{ github.token }}` | Token for the comment. |

## 3. Events and refs

- Only the `pull_request` event is supported. Any other event, `pull_request_target` included, fails the step with exit code 2 and says why.
- Base: `github.event.pull_request.base.sha`. Head: `GITHUB_SHA`, the test-merge commit. The Action runs `srcatlas diff <base> <head> --format markdown`, so both graphs come from worktrees (ADR 0012).
- The graph cache lives in `.srcatlas/cache`. Restoring that directory between runs (for example with `actions/cache`, keyed on the base SHA) makes the base free after the first run.

## 4. Pull requests from forks

A pull request is from a fork when `github.event.pull_request.head.repo.full_name` differs from `github.repository`, or the head repository is gone.

- The `GITHUB_TOKEN` of such a run is read-only, so no comment is written. The Markdown goes to the job summary (`$GITHUB_STEP_SUMMARY`).
- The configuration is loaded from the base commit with `srcatlas diff --config-ref <base-sha>`; the fork's `srcatlas.config.ts` is never executed. The base is loaded in a temporary worktree without installed dependencies, so a config that imports packages other than `srcatlas` and files in the repository fails with exit code 2.
- If a comment write is refused (403) on any pull request, the Action falls back to the job summary and says so in the log.

## 5. The comment

- It starts with the hidden marker `<!-- srcatlas:diff -->`. The Action finds its comment as the one whose body starts with the marker and whose author is a bot, and updates it in place; it never creates a second one.
- Empty diff: if a comment exists, it is updated to the marker and `No architectural change in the latest commit.`; if none exists, nothing is posted.
- Every name in the comment comes from analysed code and is untrusted. The comment shows names only inside code spans and inside the Mermaid block, with backticks and line breaks neutralised (`docs/cli.md` 3.4.1, 3.4.2). Lists are capped at 50 items.

## 6. Permissions

`contents: read` and `pull-requests: write`. Nothing else: no artifacts, no `actions: read`, no secrets. The Action makes network calls to the GitHub API for the comment and, through `npx`, to the npm registry to fetch srcatlas; analysis itself makes none (`SECURITY.md`).

## 7. Out of scope for this version

`check` annotations, committing `docs/architecture.svg` on the default branch (#63), and the `init` workflow template, which moves to this Action once a release tag exists.
