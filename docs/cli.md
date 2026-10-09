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

### 3.5 `srcatlas check [graph]` (P1)

Evaluates the rules from config against a graph (default: analyses first).

| Flag | Default | Meaning |
|---|---|---|
| `--format <f>` | `text` | `text`, `json`, `github` (GitHub workflow commands for annotations: `::error file=...,line=...::message`). |
| `--min-confidence <c>` | `inferred` | Ignore violations whose elements are below this level. |

Output lists each violation with rule id, severity, message, and `file:line` of the offending edge site(s). Exit 1 if any `error`-severity violation; `warn` never changes the exit code.

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

- GitHub Action inputs and outputs (to be written with `packages/action`, M4).
- Publishing (`srcatlas publish`), MCP server (`srcatlas mcp`), and the agent-facing export (`srcatlas export --format agents-md`): v1.1, specified separately.

## 7. Open questions

1. `diff` with git refs creates worktrees. Is shelling out to `git` acceptable, or should the CLI require a graph file and leave ref handling to the Action? Proposal: shell out to `git`, fail clearly if absent.
2. Cache location for ref graphs (`.srcatlas/cache/`) can grow. Add `srcatlas cache clear`, or an LRU cap of 20 entries? Proposal: LRU cap, no command.
3. `--watch` on `serve` and `analyze` at the same time: should `serve --watch` own the analysis loop? Proposal: yes, one watcher per process.
4. Windows: `git worktree` and long paths. Needs a CI test in M2.
5. Should `check` run automatically in `diff` when rules exist, so the PR comment includes violations without a second command? Proposal: the Action calls both; the CLI keeps them separate.
