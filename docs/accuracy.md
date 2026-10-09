# srcatlas: accuracy methodology

Status: draft 1, 2026-10-09. Defines how srcatlas accuracy is measured, which number is published, and which claims the README may make. Numbers below marked *proposed* are targets, not measurements. Nothing here has been measured yet.

Why this file exists: the positioning in `docs/research/landscape.md` rests on one claim, that srcatlas is more trustworthy than AI-generated maps and cheaper than runtime graphs. A claim like that needs a definition, a corpus, a scorer, and a rule for what may be printed.

## 1. What "correct" means

A graph is scored against a **ground-truth graph** for the same repository, using the schema in `docs/schema.md`.

- A **node** is correct if a ground-truth node exists with the same `id` and `kind`.
- An **edge** is correct if a ground-truth edge exists with the same `(from, kind, to)`. `sites` and `meta` are not part of correctness for the headline number; they are scored separately (section 5).
- A **missing** element is in ground truth and not in the output. An **extra** element is in the output and not in ground truth.
- Elements reported as `unresolved` in the report file (not emitted) are **not** counted as extras. They are counted in coverage (section 4).

IDs are deterministic (`docs/schema.md` section 5), so matching is exact string equality. No fuzzy matching.

## 2. Ground-truth sources

Three sources, in descending order of independence. Every corpus entry records which source it uses.

| Source | How it is produced | Independence | Use |
|---|---|---|---|
| **Runtime oracle** | Boot the real app and read what the framework itself resolved. NestJS: the DI container's modules, providers and injection edges via `ModulesContainer`; routes from the framework's own route-mapping startup log. | High: the framework is the judge. | NestJS modules, providers, `injects`, routes |
| **Declared oracle** | A machine-readable source of truth that is not code analysis. Prisma: output of the Prisma schema parser for models. Next.js: the `.next` build manifests for routes. | High | Models, Next.js routes |
| **Hand labels** | Two people (or one person twice, a week apart) label independently, then reconcile. | Medium | Edges with no oracle: `calls`, `reads`, `writes`, `enqueues`, `emits`, `listens` |

Rules:
- Oracles are scripts in `bench/oracles/`, versioned with the corpus. An oracle result is converted to the srcatlas schema, then diffed with the same scorer as hand labels.
- Where oracle and hand labels disagree, the entry is reviewed and the cause is written in `bench/corpus/<repo>/NOTES.md`. Disagreements that reveal an oracle limitation (for example, a provider created only at runtime) are recorded as **out of scope**, not silently dropped.
- The author of an extractor must not be the sole labeller of the entries used to score it. With a solo maintainer, mitigate by labelling before running the tool and committing the labels first (git history is the evidence).

## 3. Corpus

Three tiers. Reported separately; never averaged together.

| Tier | Content | Size (proposed) | Purpose |
|---|---|---|---|
| **A. Fixtures** | The synthetic fixtures in `docs/extractors/nestjs.md` section 6 plus Prisma, Next.js, BullMQ, Socket.IO equivalents. Each pattern ID has at least one positive and one decoy case. | ~12 NestJS fixtures at start | Regression tests. Expected F1 of 1.0. Not evidence of real-world accuracy. |
| **B. Real repositories** | Open-source TypeScript repositories using the supported frameworks, frozen at a commit SHA. | 10 at v1.0: 5 NestJS, 3 Next.js App Router, 2 full-stack (Nest + Prisma, Next + Prisma) | The published accuracy number. |
| **C. Dogfood** | The author's own projects (crwsync, KROMA) and srcatlas itself. | 3 | Sanity check and demo. Never part of the published number, because the author knows the code and the patterns. |

Tier B selection rules (decided before running the tool, recorded in `bench/corpus/SELECTION.md`):
- Licence permits redistribution of the commit SHA reference (no copying code into the repo; the corpus stores URL + SHA + labels).
- At least 5,000 lines of TypeScript and at least 20 files that the extractor targets.
- Mixed sizes: no more than 3 repositories above 50,000 lines.
- Selected by a search query written down in advance and applied mechanically (for example, stars within a range, last commit within 12 months). No removal of a repository after seeing results, except for a documented, non-accuracy reason (repository deleted, licence changed).
- At least 2 repositories the author has never read before selection.

Tier B repositories are chosen from what exists at selection time. This file does not name any, because none has been selected.

Labelling cost is the limiting factor. Budget: hand labels cover only the edge kinds with no oracle, and only the first 60 files of each repository by a fixed order (sorted path) when a repository is larger. The sampling rule is recorded so the number is reproducible.

## 4. Metrics

Computed per **kind** (node kinds and edge kinds), per **framework**, and per **tier**.

| Metric | Definition |
|---|---|
| Precision | correct emitted / all emitted |
| Recall | correct emitted / all in ground truth |
| F1 | harmonic mean of precision and recall |
| Coverage | emitted / (emitted + reported as unresolved), i.e. how much of what the tool noticed it could name |
| Calibration | for each confidence level (`certain`, `inferred`, `unresolved`): precision among elements with that level |

Headline number (README): **edge precision and recall on tier B, for `certain` elements only, per framework**, with the number of repositories and elements it is based on. Example form: "NestJS: precision 0.97, recall 0.91 (5 repositories, 2,140 edges). Measured at commit abc123, method in docs/accuracy.md." The numbers in that example are placeholders, not results.

Why `certain` only: `certain` is a promise. If a `certain` element is wrong, that is a bug. `inferred` elements are allowed to be wrong at a stated rate, which calibration measures.

Calibration requirement: precision of `certain` > precision of `inferred` on tier B. If not, the confidence labels carry no information and the extractor rules must be fixed.

## 5. Secondary checks

| Check | Method |
|---|---|
| **Source sites** | For a random sample of 200 edges, verify that each `site` points to the line that justifies the edge. Report the proportion correct. |
| **Meta** | Compare `meta` values (`method`, `path`, `scope`, `global`) against oracles. Reported per field. |
| **Determinism** | Run twice, on two machines (Linux CI, macOS), with different checkout paths. Byte-compare `srcatlas.graph.json`. Required: identical. Any difference blocks release. |
| **Diff correctness** | Take 30 real commits that touch structure in tier B repositories. Compare the differ's added/removed/changed sets against the ground-truth diff (ground truth of base vs head). Report precision and recall of the diff. |
| **Performance** | Wall time and peak memory on the largest tier B repository, on the CI runner type used by the Action. Not accuracy, but published beside it. |

## 6. Scorer

- Location: `bench/` in the repo. Entry point `pnpm bench`.
- Input: a graph file and a ground-truth file. Output: JSON with all metrics in section 4, plus lists of missing and extra elements.
- Deterministic, no network. Corpus repositories are fetched by SHA in a separate step (`pnpm bench:fetch`).
- The scorer has its own unit tests with hand-built graphs (perfect, empty, all-wrong, partial) so that a scoring bug cannot inflate results.
- Results are written to `bench/results/<srcatlas-version>.json` and committed on release. The README number is generated from the latest file, not typed by hand.

## 7. Targets and gates

*Proposed. Revisit after the first measurement; do not lower a target without recording why.*

| Gate | When | Threshold |
|---|---|---|
| Fixture suite | Every PR | 100% pass |
| DI feasibility spike | Before M1 starts | On one real NestJS app: module and provider recall at least 0.90 against the runtime oracle, using the provisional extractor. If not reached, stop and rethink the approach before building more. |
| Tier B, NestJS, `certain` edges | v1.0 release | Precision at least 0.95, recall at least 0.85 |
| Tier B, Next.js routes and Prisma models | v1.0 release | Precision at least 0.98, recall at least 0.95 (both have declared oracles and simpler rules) |
| Determinism | Every release | Byte-identical |
| Regression | Every PR touching an extractor | Tier B F1 per framework must not drop by more than 0.01 against the last released result |

If a v1.0 gate is missed, the options are: ship with the lower measured number printed, or delay. Printing a target that was not met is not an option.

## 8. Claim rules for README and marketing

Allowed:
- The measured numbers from `bench/results/`, with repository count, element count, and commit.
- "Every edge links to the source line that justifies it", if the source-site check (section 5) is above 0.98.
- "Same commit, same output", backed by the determinism check.
- "Unresolved constructs are listed, not guessed", backed by `srcatlas.report.json`.

Not allowed:
- "Accurate", "complete", or "100%" without a number beside it.
- Comparisons to named competitors' accuracy. Competitors were not measured with this method. Compare on properties (static, free, deterministic), not on scores.
- Numbers from tier A or tier C as accuracy figures.
- Reporting recall only, or precision only.

## 9. Known limits (to be printed with the number)

State plainly in the README and in this file:
1. Static analysis cannot see providers created by runtime logic, reflection, or dynamic `import()` computed from data. These appear as `unresolved` or not at all.
2. Recall is measured against what the oracle and labels contain. Constructs that both miss are invisible to this method.
3. The corpus is a sample of open-source TypeScript repositories. Private, unusual, or heavily generated code may behave differently.
4. Oracles are built on framework versions at the time of labelling. Framework upgrades can change behaviour. The results file records the framework versions of each corpus repository.

## 10. Open questions

1. Is the runtime oracle script for NestJS robust enough to run on arbitrary repositories (apps that need a database or external services to boot)? Fallback: use preview-mode boot where it works, and hand labels where it does not. Find out in the DI spike.
2. Should the diff-correctness check (30 commits) use real history or synthetic mutations? Real history is more honest, but labelling cost is higher.
3. A second labeller: friend, classmate, or paid? A solo maintainer cannot satisfy the independence rule fully; decide before M3.
4. Should accuracy results be published per release as a table in the docs site, or only the latest? Per release shows trend and discourages quiet regressions.
