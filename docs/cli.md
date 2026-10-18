# srcatlas: CLI reference (design)

Status: draft 1, 2026-10-09. This is the contract for `packages/cli`. Commands, flags, output and exit codes are fixed here before implementation. Config options are in `docs/config.md`. Graph and diff formats are in `docs/schema.md`.

Priorities follow the spec: P0 for v1.0 launch, P1 if time allows, P2 after launch.

## 1. Conventions

| Topic | Rule |
|---|---|
| Binary | `srcatlas`. Run with `npx srcatlas <command>`. |
| Working directory | The repository root is the directory given as `[path]`, default `.`. All paths in output files are relative to it, with `/` separators. |
| Config discovery | `srcatlas.config.ts` (also `.mts`, `.js`, `.mjs`) in the root. `--config <file>` overrides. No config is allowed: defaults plus auto-detection apply. |
| Output files | Written to `.srcatlas/` by default (`outDir` in config): `srcatlas.graph.json`, `srcatlas.report.json`, `srcatlas.diff.json`. `init` adds `.srcatlas/` to `.gitignore` after confirmation. |
| Streams | Data a script would consume (`--json`, graph on stdout with `-o -`) goes to stdout. Progress, warnings and summaries go to stderr. |
| Colour and TTY | Colour only on a TTY. `NO_COLOR` disables it. Progress bars only on a TTY; in CI, plain lines. |
| Network | `analyze`, `diff`, `check`, `export`, `explain` make no network calls. `serve` binds `127.0.0.1` only. Nothing else listens or connects. No telemetry. |
| Determinism | Machine-readable outputs follow `docs/schema.md` section 9. Human-readable output (tables, colours) is not stable and must not be parsed; use `--json`. |
| Global flags | `--config <file>`, `--quiet` (errors only), `--verbose` (extra diagnostics on stderr), `--no-color`, `--version`, `--help`. |

## 2. Exit codes

| Code | Meaning |
|---|---|
| 0 | Success. For `check`: no rule violations at `error` severity. |
| 1 | Findings: `check` found violations at `error` severity; `analyze --strict` found parse errors or unresolved constructs; `diff --fail-on` condition met. |
| 2 | Usage or configuration error: unknown flag, invalid config, unknown git ref, file not found, unsupported graph `schemaVersion`. |
| 3 | Internal error (bug). Prints the error, a report-an-issue link, and never partial output files. |

Parse errors in a single analysed file never produce exit code 2 or 3. The file is skipped and recorded in the report (spec flow E).

## 3. Commands

### 3.1 `srcatlas init [path]` (P0)

Detects frameworks and writes a starting config.

| Flag | Default | Meaning |
|---|---|---|
| `--yes`, `-y` | off | Accept all prompts (non-interactive). |
| `--no-workflow` | off | Do not offer the GitHub workflow file. |
| `--force` | off | Overwrite an existing `srcatlas.config.ts`. |

Behaviour:
1. Find `package.json` files (workspaces: pnpm, npm, yarn, Turborepo, Nx).
2. Detect frameworks by dependencies: `@nestjs/core` → nestjs, `next` → nextjs, `prisma` / `@prisma/client` → prisma. Later: `bullmq` / `@nestjs/bullmq`, `socket.io`.
3. Write `srcatlas.config.ts` with the detected packages and extractors, with comments for every option left at its default.
4. After confirmation, write `.github/workflows/srcatlas.yml` (PR comment workflow, using only `GITHUB_TOKEN`) and add `.srcatlas/` to `.gitignore`.
5. Print the next command: `srcatlas analyze`.

Refuses to overwrite files without `--force` (exit 2). With `--yes`, existing files are still never overwritten without `--force`.

v1 details:
- Nothing is written before every refusal has been checked: an existing `srcatlas.config.ts` or workflow file with no `--force` is exit 2 and leaves the directory as it was. `.gitignore` is only appended to, and not at all when it already ignores `.srcatlas`.
- Questions are asked on a terminal. With no terminal and no `--yes`, `init` writes the config and skips the optional files, saying so.
- Next.js is detected, but while its extractor is not available the package is listed without it and a comment says so.
- Until the GitHub Action exists (M2), the workflow runs `npx srcatlas@<version> analyze` on pull requests and uploads `.srcatlas` as an artifact, with `contents: read` only. It is replaced by the PR comment workflow with the Action.
- The config imports `defineConfig` from `srcatlas`; the config loader resolves that import to the running CLI, so it works when srcatlas is not installed in the project.

### 3.2 `srcatlas analyze [path]` (P0)

Builds the graph.

| Flag | Default | Meaning |
|---|---|---|
| `-o, --out <file>` | `.srcatlas/srcatlas.graph.json` | Graph output path. `-` writes the graph to stdout (summary goes to stderr). |
| `--report <file>` | `.srcatlas/srcatlas.report.json` | Report output path. |
| `--strict` | off | Exit 1 if there is any parse error or `unresolved` construct. Use in CI to gate on analysis health. |
| `--watch` | off | Re-analyse on file change, incrementally (P1 for incremental; P0 may re-run fully). |
| `--workers <n>` | CPU count − 1, minimum 1 | Worker pool size. |
| `--only <extractor>` | all configured | Run only the named extractors (repeatable). Cross-extractor links that need a skipped extractor are omitted and reported. |
| `--json` | off | Print the summary as JSON on stdout. |

Behaviour:
- Pipeline: load config → detect packages → build one TypeScript program per package → run extractors in the worker pool → link pass → validate against schema invariants → write files.
- Writes are atomic (write to temp file in the same directory, rename). A failed run leaves the previous output files untouched.
- Validation failure of the produced graph is an internal error (exit 3), never a user error.
- Unknown framework or no extractors matched: falls back to a file-level import graph, says so on stderr, exit 0.

Summary (stderr, human format):

```
srcatlas 0.1.0 · schema 1
packages   2      modules   14    providers  41
routes     62     models    18    queues      3
edges      487    unresolved 7 (see .srcatlas/srcatlas.report.json)
done in 4.2 s
```

`--json` summary shape:

```json
{ "schemaVersion": 1, "counts": { "nodes": {"module": 14}, "edges": {"injects": 80} }, "report": { "parseErrors": 0, "unresolved": 7 }, "graphFile": ".srcatlas/srcatlas.graph.json" }
```

### 3.3 `srcatlas serve [graph]` (P0)

Starts the local viewer on a graph file (default `.srcatlas/srcatlas.graph.json`; runs `analyze` first if missing, with a message).

| Flag | Default | Meaning |
|---|---|---|
| `--port <n>` | 4173 | Port. If busy, tries the next 10 ports, then exits 2. |
| `--open` / `--no-open` | open on a TTY | Open the browser. |
| `--diff <file>` | none | Open in diff mode on a `srcatlas.diff.json`. |
| `--watch` | off | Re-analyse on change and push the new graph to the viewer. |

Serves the prebuilt viewer shipped inside the CLI package. Binds `127.0.0.1`. Source links in the detail panel use `repository` from config (or the git remote) to build GitHub URLs; with neither, they show file and line only.

### 3.4 `srcatlas diff <base> <head>` (P0)

Compares two graphs.

`<base>` and `<head>` are each one of:
- a path to a graph file,
- a git ref (branch, tag, SHA). The CLI creates a temporary `git worktree` for the ref, runs `analyze` there, deletes the worktree, and caches the graph keyed by `(commit SHA, srcatlas version, config hash)` in `.srcatlas/cache/`.
- `WORKTREE` as `<head>`: the current working tree, including uncommitted changes.

| Flag | Default | Meaning |
|---|---|---|
| `-o, --out <file>` | `.srcatlas/srcatlas.diff.json` | Diff file. |
| `--format <f>` | `text` | `text`, `json`, `markdown`, `mermaid`. `markdown` is the PR comment body (summary table plus Mermaid mini-graph). |
| `--fail-on <cond>` | none | Exit 1 when a condition is met. Repeatable. Conditions: `new-cycle`, `new-cross-module-edge`, `removed-node`, `any-change`. |
| `--min-confidence <c>` | `inferred` | Ignore elements below this level (`certain`, `inferred`, `unresolved`). |
| `--max-nodes <n>` | 40 | Cap on nodes in the Mermaid mini-graph; the rest are summarised as "+N more". |

Semantics are in `docs/schema.md` section 13 (moves, cycles, cross-module edges). The summary line is fixed: `+1 module, +4 routes, +2 cross-module edges, 0 new cycles`.

Errors (exit 2): unknown ref, ref not reachable (shallow clone: message tells the user to use `fetch-depth: 0` or pass a graph file), `schemaVersion` mismatch between files.

#### 3.4.2 `diff` details (v1)

- **Root.** `diff` takes no `[path]`: the repository root is the working directory. It must be inside a git work tree when either input is a git ref or `WORKTREE`.
- **Resolving an input.** In this order: (1) `WORKTREE`, exact and upper case, is the working tree and is valid only as `<head>` (as `<base>` it is exit 2); (2) a string that names an existing file is a graph file; (3) anything else is a git ref. A file wins over a ref of the same name.
- **Graph file.** Read as JSON. A `schemaVersion` other than the one this CLI supports, or a file that fails the graph schema, is exit 2.
- **Git ref.** Resolved to a commit SHA with `git rev-parse --verify <ref>^{commit}`. A ref that does not resolve is exit 2; in a shallow clone the message says to use `fetch-depth: 0` or pass a graph file. The graph for that SHA comes from the cache if present. Otherwise the CLI runs `git worktree add --detach` into a new directory under the system temporary directory, analyses it, and removes the worktree and the directory afterwards, also when the analysis fails. The worktree is analysed with the configuration loaded for the current run, so both sides of a diff use the same settings. The worktree has no installed dependencies, which can change the graph (`docs/extractors/nestjs.md`, open question 5); to compare graphs analysed in the same environment, pass graph files.
- **`WORKTREE`.** Analysed in place, uncommitted changes included, and never cached.
- **Cache.** `<outDir>/cache/<key>.graph.json`, with key = SHA-256 (hex) of the commit SHA, the srcatlas version and the canonical JSON of the configuration, separated by NUL. Only git refs are cached. A cache file that is not a valid graph is ignored and replaced.
- **`--min-confidence`.** Applied to both graphs before comparing: nodes and edges below the level are dropped, and so are edges whose endpoint was dropped. Order: `certain` > `inferred` > `unresolved`.
- **Output.** The diff file is always written to `--out`. The chosen `--format` is printed to stdout: `json` is the diff file's bytes; `mermaid` is section 3.4.1; `text` and `markdown` below. Progress and warnings go to stderr.
- **`text`.** First line is the summary line, then one line per added (`+`), removed (`-`), changed (`~`) and moved (`>`) node and edge, then new cross-module edges and new cycles. Not stable; scripts use `json`.
- **`markdown`.** Empty when the diff has no node or edge entry, so the Action posts nothing. Otherwise: a heading, the summary line, a table of counts (added, removed, changed, moved) for nodes and edges, the new cycles and new cross-module edges as lists when there are any, and the Mermaid mini-graph in a fenced `mermaid` block. The "Moved" cell of the edges row is `-`.
- **`--fail-on`.** Exit 1 when any given condition holds: `new-cycle` (`cycles` is not empty), `new-cross-module-edge` (`crossModuleEdges` is not empty), `removed-node` (`nodes.removed` is not empty; a move is not a removal), `any-change` (any node or edge entry). An unknown condition is exit 2.

#### 3.4.1 Mermaid mini-graph

`--format mermaid` prints, and `--format markdown` embeds in a fenced `mermaid` block, a flowchart of the **changed neighbourhood**. The renderer (`renderMermaid(diff, { maxNodes })` in `packages/renderer`) reads only the diff file.

- **Nodes.** Every node in `nodes.added`, `nodes.removed`, `nodes.changed` (the `after` node) and `nodes.moved` (the `to` node), plus every endpoint of an edge in `edges.added`, `edges.removed` and `edges.changed` (the `after` edge). An endpoint that is not in a node list is **context**: the diff file has no record of it beyond its ID, so its label is the ID.
- **Classes.** `added`, `removed`, `changed`, `moved`, `context`, each with a fixed `classDef`. Labels are the node `name`.
- **Edges.** `-->` added, `-.->` removed, `==>` changed. The label is the edge kind, in quotes. An edge is drawn only if both endpoints are shown.
- **Cap.** Each node has a weight: 1 if it is in a node list, plus 1 for every listed edge that touches it. When there are more nodes than `--max-nodes`, the highest weights are kept, ties by node ID in code-unit order, and one extra context node `+N more` (N = nodes left out) is added. Edges to left-out nodes are not drawn.
- **Names.** Nodes are `n0`, `n1`, … in code-unit order of their IDs, so the text is deterministic. In labels `#`, `&`, `"`, `<`, `>` and `|` are written as Mermaid entity codes (`#35;`, `#amp;`, `#quot;`, `#lt;`, `#gt;`, `#124;`).
- **Empty diff.** A diff with no node and no edge entries renders as an empty string, so the Action has nothing to post.
- `--max-nodes` must be a positive integer.

### 3.5 `srcatlas check [graph]` (P0)

Evaluates the rules from config against a graph (default: analyses first).

| Flag | Default | Meaning |
|---|---|---|
| `--format <f>` | `text` | `text`, `json`, `github` (GitHub workflow commands for annotations: `::error file=...,line=...::message`). |
| `--min-confidence <c>` | `inferred` | Ignore violations whose elements are below this level. |

Output lists each violation with rule id, severity, message, and `file:line` of the offending edge site(s). Exit 1 if any `error`-severity violation; `warn` never changes the exit code.

#### 3.5.1 `check` details (v1)

- **Input.** `[graph]` is a graph file, read as in 3.4.2 (unsupported `schemaVersion` or an invalid graph is exit 2). Without it, `check` analyses the working directory in memory and writes no file. The rules come from the config; with no rules it prints `no rules configured` on stderr and exits 0. The root is the working directory.
- **`--min-confidence`.** Combined with each rule's `minConfidence` as in `docs/config.md` 2.4.
- **`json`.** The array of violations (shape in `docs/config.md` 2.4), canonical key order, 2-space indent, one trailing newline. Nothing else goes to stdout.
- **`text`.** Per violation `<severity> <rule>: <message>` and one line `  at <file>:<line>` per site; then a line `<n> errors, <n> warnings` (singular for 1). `warn` is the severity word for `warn` rules.
- **`github`.** One workflow command per site: `::error file=<file>,line=<line>,title=<rule>::<message>` (`::warning ...` for `warn`). A violation with no site prints the command without `file` and `line`. Values are escaped as GitHub requires: `%`, CR and LF in messages; also `:` and `,` in properties.
- **Warnings.** Stale exceptions and rules that are not evaluated yet go to stderr in every format, one per line, prefixed `warning: `; `--quiet` suppresses them.

#### 3.5.2 Accepted violations (the ratchet)

So that a repository with existing violations can adopt rules: `check` can read a committed file of accepted violations and fail only on the others.

| Flag | Default | Meaning |
|---|---|---|
| `--accepted <file>` | `srcatlas.accepted.json` | The accepted-violations file, relative to the root. |
| `--accept` | off | Write the file (below). |
| `--add` | off | With `--accept`: also record violations that are not in an existing file. |

- **File.** JSON, canonical key order, 2-space indent, one trailing newline: `{ "version": 1, "violations": [...] }`. An entry is a violation without `severity`, `message` and `sites`: `{ "rule", "from", "edgeKind", "to" }`, or for a cycle `{ "rule", "over", "members" }`. Entries are sorted by rule ID, then by `from`, `edgeKind`, `to` (or by the members) in code-unit order. Unknown keys and a `version` other than 1 are exit 2, as is a file that is not JSON.
- **Identity.** A violation is accepted when an entry has the same rule and the same `from`, `edgeKind` and `to` (or the same `over` and `members`). Sites do not take part, so a line moving does not un-accept it. A cycle that gains or loses a member is a different violation.
- **Plain `check`.** If the file exists, accepted violations are left out of the output and of the exit code, and `check` says `<n> accepted violation(s) not shown` on stderr. A violation not in the file is reported and fails as usual. An entry whose violation no longer occurs gets a warning `accepted violation no longer occurs: <rule> <from> <edgeKind> <to>` (members for a cycle) with a hint to run `check --accept`; it does not change the exit code. Plain `check` never writes the file. A file named with `--accepted` that does not exist is exit 2; the default file that does not exist is ignored.
- **`--accept`.** Writes the file and then reports as a plain run against the new file, so a successful adoption exits 0. If the file does not exist, it is created with every current violation. If it exists, it keeps the entries whose violation still occurs and drops the others: the file shrinks. Violations that are not in it are **not** added, are reported as usual and keep the exit code at 1; `--add` records them too. After writing, stderr says `<path>: <n> added, <n> kept, <n> removed`, and, when it did not add, how many new violations it left out.
- **Guard.** `--accept` with a `--min-confidence` other than `inferred` is exit 2, because a stricter level would make accepted violations look gone and remove them.

### 3.6 `srcatlas export [graph]` (P1)

| Flag | Default | Meaning |
|---|---|---|
| `--format <f>` | `svg` | `svg`, `png`, `mermaid`, `dot`. |
| `-o, --out <file>` | `docs/architecture.<ext>` | Output path. `-` for stdout (not for `png`). |
| `--scope <s>` | `all` | `all` (modules aggregated), `module:<id>` (one module expanded), `trace:<route id>` (downstream path of one route). |
| `--theme <t>` | `auto` | `light`, `dark`, `auto` (SVG uses `prefers-color-scheme`). |
| `--width <px>` | 900 | Target width for SVG and PNG. |

SVG requirements are in the spec section 14: self-contained, deterministic, `<title>` on every node. Same graph and options give byte-identical SVG. PNG is rendered with resvg and is not guaranteed byte-identical across resvg versions.

### 3.7 `srcatlas explain <node> [graph]` (P2)

Prints a node's metadata, incoming and outgoing edges grouped by kind, and up to 3 shortest paths to/from the nearest `route` or `model` nodes. `<node>` is an exact ID or a unique name; ambiguous names list candidates and exit 2. `--json` for output. Shares its query logic with `packages/query` (also used by the MCP server in v1.1).

## 4. Environment variables

| Variable | Effect |
|---|---|
| `NO_COLOR` | Disable colour. |
| `SRCATLAS_CONFIG` | Config path (lower priority than `--config`). |
| `SRCATLAS_WORKERS` | Default for `--workers`. |
| `CI` | When set, progress output is plain lines. |

No variable enables telemetry. There is none.

## 5. Compatibility and stability

- Commands, flags and exit codes listed here are the public interface from 1.0. Removing or changing one is a major version.
- Human-readable output may change in any release.
- JSON outputs carry `schemaVersion`; their shapes change only per the compatibility policy in `docs/schema.md` section 12.
- Before 1.0 (versions 0.x), any of this may change; changes are listed in the changelog.

## 6. Out of scope for this document

- GitHub Action inputs and outputs (to be written with `packages/action`, M2).
- Publishing (`srcatlas publish`), MCP server (`srcatlas mcp`), and the agent-facing export (`srcatlas export --format agents-md`): v1.1, specified separately.

## 7. Open questions

1. `diff` with git refs creates worktrees. Is shelling out to `git` acceptable, or should the CLI require a graph file and leave ref handling to the Action? Proposal: shell out to `git`, fail clearly if absent.
2. Cache location for ref graphs (`.srcatlas/cache/`) can grow. Add `srcatlas cache clear`, or an LRU cap of 20 entries? Proposal: LRU cap, no command.
3. `--watch` on `serve` and `analyze` at the same time: should `serve --watch` own the analysis loop? Proposal: yes, one watcher per process.
4. Windows: `git worktree` and long paths. Needs a CI test in M2.
5. Should `check` run automatically in `diff` when rules exist, so the PR comment includes violations without a second command? Proposal: the Action calls both; the CLI keeps them separate.
