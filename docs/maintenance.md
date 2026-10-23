# srcatlas: maintenance policy

Status: draft 1, 2026-10-23. How reports are handled, what is supported, and what the graph schema promises. It states what the repository already does or documents; where the repository is silent it says so (section 5) instead of inventing a promise. Security reports and the threat model are in [`SECURITY.md`](../SECURITY.md).

srcatlas is a one-person project. No response time is promised, except the acknowledgement of security reports (`SECURITY.md`).

## 1. How reports are triaged

Every issue form (bug, wrong graph, feature) applies the `triage` label. Security reports do not go to issues: use GitHub's private vulnerability reporting (`SECURITY.md`).

| Report | What is needed | What happens |
|---|---|---|
| Wrong graph (form) | srcatlas version, framework and version, expected IDs (`docs/schema.md` section 5), actual output, the relevant `srcatlas.report.json` entries, a minimal reproduction with no private code | Sorted into one of the outcomes below |
| Bug (form) | srcatlas version, area, Node and OS, steps to reproduce, output | Reproduced; a fix comes with a test. A change to documented behaviour changes the doc in the same pull request (`CONTRIBUTING.md`) |
| Feature or extractor request (form) | The architecture question you cannot answer today | Weighed against the order of work (`docs/adr/0009-portfolio-first-scope-and-order.md`, `docs/backlog.md`). Frameworks beyond the documented ones need a decision first |

Wrong-graph outcomes:

1. **A wrong element marked `certain`.** A bug, the most serious kind (`CLAUDE.md` section 1, rule 3). The fix is a fixture with a decoy, a hand-written expected graph and then the implementation (ADR 0010).
2. **A missing element for a construct a documented pattern covers.** A bug, handled the same way.
3. **A missing element for a construct no pattern covers.** Not a bug. It becomes a pattern proposal in the extractor doc, which is a feature request. The correct behaviour until then is to emit nothing, or emit `unresolved` with a report code.
4. **An element reported as unresolved.** Working as documented, unless the extractor doc says the construct should resolve. The report code says why it did not.
5. **Not reproducible, or missing information.** The reporter is asked for what is missing; without a reproduction there is no fixture, and so no fix.

Priorities follow `docs/backlog.md` (P0, P1, P2). Accuracy numbers come only from the benchmark (`docs/accuracy.md`); an issue does not change a published number.

## 2. Supported versions

| What | Supported |
|---|---|
| srcatlas | Pre-1.0: only the latest published version gets fixes. After 1.0: the latest minor release of the latest major (`SECURITY.md`). |
| Node.js | 20 or newer (`engines` in `package.json`). CI runs Node 20 and 22 on Linux, macOS and Windows. |
| GitHub Action | The `v0` tag moves with compatible releases; inputs may change before `v1` (`docs/action.md` section 8). |
| NestJS, Prisma, Next.js | See section 3. |

## 3. Framework versions

The extractors do not check framework versions. The NestJS extractor runs for a package whose `package.json` lists `@nestjs/core` or `@nestjs/common` (`docs/extractors/nestjs.md` section 1.3); the Prisma extractor runs for a package that lists `prisma` or `@prisma/client` (`docs/extractors/prisma.md`). Constructs are matched by import origin, not by version.

So no minimum or maximum version is enforced or promised. What has been exercised so far is on record:

- NestJS 11.1.19 and Prisma 7.7.0: the runtime oracle of the M1 exit measurement (`bench/m1-exit/RESULT.md`).
- Prisma 5.22 and 7.10: checked while writing the Prisma extractor (`docs/extractors/prisma.md`, answered questions 10 and 11).

A construct that behaves differently in a version not listed here is reported with the wrong-graph form, which asks for the framework version (section 1). There is no Next.js extractor yet.

## 4. Graph schema compatibility

The promise is in `docs/schema.md` section 12; this is a summary, not a second source.

- `schemaVersion` is one integer. It goes up only for a breaking change: removing or renaming a field or kind, changing a required type, or changing an ID rule.
- Adding an optional field, an optional `meta` key, a node kind or an edge kind is not breaking. Consumers ignore unknown fields and treat unknown kinds as generic nodes and edges.
- This holds before 1.0 as well. Before 1.0 the commands, flags, config keys and Action inputs may change, and the changes are listed in the changelog (`docs/cli.md` section 5).
- The promise is about the shape of the file. Extractor fixes and new patterns change which elements a graph contains without changing `schemaVersion`. Two graphs are only comparable if the same srcatlas version made them, which is why the Action analyses both sides of a pull request with one version (`docs/adr/0012-action-analyses-clean-checkouts-and-never-installs.md`).
- Behaviour today: the schema is at version 1 and the tools read only that. `srcatlas diff` and `check`, given a graph file with another `schemaVersion`, exit with code 2 (`docs/cli.md` section 2), and the differ refuses two graphs whose versions differ (`docs/schema.md` section 13). The error names the version this srcatlas reads.
- A change to `docs/schema.md` that affects serialised output is recorded as an ADR.

## 5. Not decided

- The range of framework versions that is supported (section 3). Needs a decision before 1.0, and a fixture or benchmark per version it names.
- `docs/schema.md` section 12 says an unsupported newer file produces an error that names the required tool version. The current error names the schema version the tool reads, not a tool version. Either the message or the sentence needs to change.
