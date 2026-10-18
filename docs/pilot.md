# Pilot: the Action on real repositories

Issue #60. This is a procedure for the maintainer, not a contract. It is the first time the Action (`docs/action.md`) runs on a real GitHub runner; until then its comment upsert and fork fallback have only met fake GitHub responses. The pilot is done when the two criteria of #60 hold: an end-to-end pull request comment within 90 seconds on all four repositories (the sandbox and three pilot repositories), with the author's own crwsync as one pilot repository, for demo only and excluded from the published accuracy number (`docs/accuracy.md` section 3).

## 1. Before you start

- `srcatlas@latest` on npm is 0.12.0 or newer, which has `diff --config-ref` (checked 2026-10-18: 0.12.0 is published and contains it). The Action runs `npx srcatlas@latest`; pass `version: 0.12.0` in the pilot workflows to make the runs reproducible.
- There is no release tag yet, so use the commit: `uses: srcatlas/srcatlas@<commit sha of main>`. A public repository can use an action from another public repository without a Marketplace listing.
- Ask the owners of the pilot repositories other than crwsync for permission to open pull requests and add a workflow file. Agree that the comments may be seen by other contributors. Do not enable the Action on a repository without that.

## 2. The workflow

Same file in every pilot repository, as `.github/workflows/srcatlas.yml`:

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
      - uses: srcatlas/srcatlas@<commit sha>
        with:
          version: 0.12.0
```

No install step, no Node setup (the runner has Node 20 or newer), no secrets.

## 3. The sandbox repository

A private repository you own, so you can break it freely. Start from `fixtures/prisma-client` (NestJS and Prisma, no dependencies installed, which is also the mode the Action analyses in; ADR 0012). Create the cases below as separate pull requests, each from a branch off `main`, and write down what you see.

| # | Pull request | Expect in the comment |
|---|---|---|
| 1 | Add a module with one provider | `+1 module`, the module and provider as added nodes, the Mermaid block renders |
| 2 | Add an edge between two existing modules' providers | `+1 cross-module edge`, listed under New cross-module edges |
| 3 | Make two modules import each other | `1 new cycle`, listed under New cycles |
| 4 | Remove a provider | a removed node in dashed red; `--fail-on removed-node` (set it in a copy of the workflow) fails the step after the comment is posted |
| 5 | Change a comment or a README only | no comment at all |
| 6 | Push a second commit to pull request 1 | the same comment is updated in place, not a second one |
| 7 | Push a commit to pull request 1 that undoes the change | the comment says `No architectural change in the latest commit.` |
| 8 | A pull request from a fork (a second GitHub account) | no comment; the diff is in the job summary; the fork's `srcatlas.config.ts`, with a line that writes a file, does not run (the base config is used) |
| 9 | A route path with a backtick and a line break in its decorator string | the comment renders normally; nothing after the Mermaid block is swallowed |
| 10 | `permissions` without `pull-requests: write` | job summary fallback with a 403 note in the log, not a failed step |

## 4. The three pilot repositories

One pull request each that changes the architecture a little (a new provider and a new dependency between modules). crwsync is one of the three. Choose the other two as NestJS, Prisma or both, with at least 30 source files, and prefer different shapes between the three: a single package, a monorepo, one without Prisma.

## 5. What to record

For each of the four (sandbox and three pilot repositories), in a table in the issue:

| What | How |
|---|---|
| Time from push to comment | The job's total time; the Action step alone; the first run and a second run with `.srcatlas/cache` restored |
| Did the base graph match the head's environment | Compare the comment with `srcatlas diff <base> <head>` run locally on two commits |
| Wrong or missing elements | Anything in the comment that is not in the code change, or a change that is missing; note the construct |
| Unresolved report entries | `srcatlas analyze` locally: the `unresolved` count and the report codes |
| Anything surprising | Noise, a confusing label, a comment that was too long |

Wrong elements are bugs against the extractor, not against the Action: file them with the pattern ID or report code, and do not fix them inside the pilot.

## 6. Pass

All of these:
- Every pilot repository gets a correct comment within 90 seconds, first run included. If only a second, cached run is fast enough, record that and decide whether the Action should restore the cache itself.
- Cases 5 to 8 and 10 in the sandbox behave as in the table, in particular one comment per pull request, none for a change without architecture, and no code of the fork run.
- No comment shows a name that breaks the Markdown (case 9).

## 7. After the pilot

- Decide the `version` default (`latest` now) and write it in `docs/action.md`.
- Tag the release and decide how `v1` moves with minor releases; the tag, the release and the Marketplace listing are maintainer steps (`CLAUDE.md` section 10). Publish to the Marketplace only after the pilot has passed.
- Switch the `srcatlas init` workflow template from `analyze` to this Action.
- Update `CLAUDE.md` section 12: M2 closed, M3 next.
