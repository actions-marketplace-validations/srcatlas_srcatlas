# Contributing to srcatlas

Thank you for helping. This project is pre-alpha; the design is in `docs/`. Read `docs/schema.md` and, for extractor work, `docs/extractors/nestjs.md` before changing code.

## Ways to help

| Contribution | How |
|---|---|
| Wrong or missing graph element | Open a **Wrong graph** issue (form). Include the report file and a minimal repository. This is the most valuable report. |
| New extractor pattern | Pick an unclaimed pattern ID in the extractor doc, or propose one in a **Feature** issue first. |
| Bug in CLI, viewer or Action | Open a **Bug** issue. |
| Docs | Pull request. Docs are source of truth; see below. |

## Setup

Requirements: Node.js 20 or newer, pnpm.

```sh
pnpm install
pnpm build
pnpm test
pnpm lint && pnpm typecheck
```

(Exact scripts are filled in when the monorepo scaffold lands; see `CLAUDE.md` section 5.)

## Rules for changes

1. **Docs and code move together.** If you change behaviour covered by `docs/`, change the doc in the same pull request. If code and doc disagree, fix one of them.
2. **Extractor changes need a fixture.** For each pattern: a positive case, a decoy that must produce nothing, and a hand-written expected graph. Do not generate the expected file by running the extractor and accepting its output.
3. **Determinism.** No timestamps, absolute paths, locale-dependent sorting or iteration-order dependence in graph output.
4. **Never guess.** If something cannot be resolved, emit it as `unresolved` or report it. A wrong `certain` element is a bug.
5. **No new runtime dependency** without a one-line reason in the pull request.
6. **One concern per pull request.** Small pull requests are reviewed faster.
7. **Accuracy claims.** Do not add accuracy numbers or comparisons by hand. See `docs/accuracy.md` section 8.

## Commits and sign-off

- Conventional commit messages: `feat(extractor-nestjs): N-P4 custom providers`.
- Sign off every commit (`git commit -s`) to certify the [Developer Certificate of Origin](https://developercertificate.org/). Unsigned commits will be asked to be amended.
- User-visible changes need a Changeset (`pnpm changeset`).

## Writing an extractor

An extractor receives a ts-morph project and a `GraphBuilder` and emits nodes and edges through the builder. It depends only on `packages/core`. Start from `docs/extractors/nestjs.md` as the model for how a pattern catalogue is written: pattern ID, what is matched (by import origin, never by name), what is emitted, what is reported, and the fixtures. A full authoring guide will be written after the NestJS extractor exists.

## Reporting security issues

Do not use public issues. See [`SECURITY.md`](SECURITY.md).

## Conduct

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).
