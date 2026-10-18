# M1 exit check: scoring rules (fixed before the first score)

Gate: `docs/accuracy.md` section 7 ("DI feasibility spike" row and the M1 exit item in `scripts/backlog.json`). This file is committed **before** the real extractor is scored on the target. Git history is the evidence (`docs/accuracy.md` section 2, last rule). A change to this file after the first score is a separate commit with its reason, and the result file must say so.

## Target

- Repository: <https://github.com/JustTunya/crwsync> (public), commit `030ebf2e8f3288c019ebd1c5c827ebf026778304`.
- App: `apps/backend`, package name `@crwsync/backend`, NestJS 11.
- Tier C (the maintainer's own project). The number is never printed as an accuracy figure (`docs/accuracy.md` sections 3 and 8). One app, one run: it shows the pipeline works on real code, not how accurate it is.

## Ground truth

Runtime oracle of `bench/oracles/nestjs-runtime` (v0), run on the built app:

```sh
node bench/oracles/nestjs-runtime/dump.cjs <crwsync>/apps/backend dist/app.module.js AppModule > oracle.raw.json
node bench/oracles/nestjs-runtime/convert.mjs oracle.raw.json <crwsync>/apps/backend @crwsync/backend --out oracle.graph.json
```

The build must be of the pinned commit with a clean working tree. What the oracle leaves out is fixed by its README: custom providers (string and symbol tokens, factories, values), routes, classes no module lists, class names declared in two files (skipped on the truth side; they may show as extras), and the providers Nest adds itself (the module class, `ModuleRef`, `ApplicationConfig`). `APP_*` registrations count as a provider of no module (N-P4).

## What is analysed

```sh
srcatlas analyze <crwsync> --out actual.graph.json --report actual.report.json
```

of the whole repository, at the srcatlas commit recorded in the result file. Only the package `@crwsync/backend` is scored.

## What is scored

```sh
node bench/score/score.mjs oracle.graph.json actual.graph.json --package @crwsync/backend
```

- Nodes by `(id, kind)`: `module`, `provider`, `controller`.
- Edges by `(from, kind, to)`: `imports`, `contains`, `injects`.
- `sites`, `meta` and `confidence` are not part of correctness (`docs/accuracy.md` section 1).
- Recall and precision are reported for every kind. The gate uses the `all` block (every emitted element); the `certainOnly` block is reported next to it.
- Precision is informative only: extras include the custom-provider nodes the extractor emits and the oracle does not, and the two-sided suffix of same-named classes.

## Gate

| Measure | Threshold | Source |
| --- | --- | --- |
| Module recall | at least 0.90 | `docs/accuracy.md` section 7 |
| Provider recall | at least 0.90 | `docs/accuracy.md` section 7 |
| `injects` recall | at least 0.80 | `docs/research/di-spike.md` (set by the maintainer before the spike was scored; not raised here) |

Controller, `imports` and `contains` recall are reported, not gated. Passing the gate does not mean the extractor is accurate; failing it means the scope of the NestJS extractor has to be reconsidered (`docs/accuracy.md` section 7: narrow it, or stop and rethink).

## Rules for the run

1. One scoring run. If the oracle or a command fails (not the numbers), fix the command and run again; every run is recorded with its reason.
2. The numbers are recorded as measured. A miss is never fixed by changing this file, the oracle, the scorer or the thresholds.
3. Every miss in the result gets a cause: a pattern ID of `docs/extractors/nestjs.md` that is not implemented, an oracle limit, or a bug. Extractor fixes after the result are separate pull requests, each with its fixture; a later score is a new, labelled run and the first result stays in the record.
4. The result file lists the srcatlas commit, the crwsync commit and the versions of Node and the frameworks.

## What was known before this file was written

Stated so the reader can judge independence.

- The DI spike (`docs/research/di-spike.md`) scored a provisional extractor on this same commit: module recall 1.00, provider recall 1.00, `injects` recall 0.916, with 9 misses (4 `@InjectQueue`, 4 guards reached only through `@UseGuards`, 1 inherited constructor injection). The extractor under test now is the product extractor, not that one.
- Before the controller `injects` change (pull request 129), I read the extractor and saw it emitted `injects` from providers only, while the oracle includes controller dependencies. I fixed that before scoring because it was a known gap, not because of a score. N-P9 (inherited constructor injection) and N-Q2 (`@InjectQueue`) are not implemented.
- I ran `srcatlas analyze` once on the target as a smoke test and saw totals (22 modules, 37 providers, 23 controllers, 131 routes, 5 unresolved entries) but compared nothing to the oracle. That run was before the controller change.
- The labels here are code analysis by a runtime oracle, not hand labels, so the "label before running" rule applies to this file and the commands, which are fixed above.
