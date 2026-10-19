# srcatlas

## 0.13.0

### Minor Changes

- edf610c: `srcatlas init` writes a workflow that uses the `srcatlas/srcatlas@v0` Action (one pull request comment) instead of running `analyze`.

## 0.12.0

### Minor Changes

- 9f41445: `srcatlas diff --config-ref <ref>` loads the configuration from a git ref and never runs the working directory's config, for pull requests from forks. The Markdown and Mermaid output now neutralise backticks and line breaks in names taken from analysed code, and cap each list at 50 items. The repository has a GitHub Action (`action.yml`) that keeps one pull request comment with the diff.

## 0.11.0

### Minor Changes

- c1d521c: `srcatlas check` can adopt rules on a repository that already breaks them. `check --accept` records the current violations in `srcatlas.accepted.json`; later runs fail only on violations that are not in the file, and `check --accept` removes entries that no longer occur. New violations are added only with `--accept --add`.

## 0.10.0

### Minor Changes

- 3596f6e: `srcatlas check [graph]` evaluates the `rules` from the config against a graph: `forbidden-edge` and `no-cycles` rules, with `except` lists and `minConfidence`. It prints text, JSON or GitHub annotations, and exits 1 on an `error`-severity violation. `max-fan-out` and `layering` rules are accepted but skipped with a warning.

## 0.9.0

### Minor Changes

- 124f943: `srcatlas diff <base> <head>` compares two graphs: each side is a git ref, a graph file, or `WORKTREE` for the head. It writes `srcatlas.diff.json` and prints text, JSON, a Markdown pull request comment body with a Mermaid mini-graph, or the Mermaid graph alone; `--fail-on` turns new cycles, new cross-module edges and removed nodes into exit code 1. Graphs of git refs are cached by commit. The graph now has `depends_on` edges between workspace packages that import each other.

## 0.8.0

### Minor Changes

- 48651b8: `srcatlas init` detects NestJS and Prisma by dependencies and writes `srcatlas.config.ts`, with optional `.gitignore` and GitHub workflow files; it never overwrites without `--force`. A config that imports `defineConfig` from `srcatlas` now loads when srcatlas is run with npx and not installed in the project.

## 0.7.0

### Minor Changes

- 8b2a619: The NestJS extractor now emits `injects` edges from controllers to the providers their constructors ask for.

## 0.6.0

### Minor Changes

- 5311a92: The Prisma extractor finds client calls (`prisma.order.findMany()`, transactions, singletons, generator output paths) and the analyzer links them to `reads` and `writes` edges from the calling class to the model, with the operation names in `meta.operations`.

## 0.5.0

### Minor Changes

- 04ce184: The Prisma extractor reads schema files (single or multi-file) and emits a `model` node per model with its field count; malformed and duplicate models are reported.

## 0.4.0

### Minor Changes

- d7599f4: NestJS extractor: controllers, routes and the global prefix (N-R1 to N-R5, N-R8 to N-R10).

## 0.3.0

### Minor Changes

- 0718782: The NestJS extractor reads providers: class, value, factory and existing providers with their tokens, constructor and property injection resolved by module, scope and role, and the `contains` and `exports` edges from modules.

## 0.2.1

### Patch Changes

- 44bb6ba: The NestJS extractor follows dynamic modules (`forRoot`, `forRootAsync`, `register`) and reads `global: true` from the returned literal.

## 0.2.0

### Minor Changes

- b3f063e: The NestJS extractor reads modules: `@Module` classes become `module` nodes with `imports` edges, `meta.global` and re-exports. Packages that depend on `@nestjs/common` or `@nestjs/core` no longer use the file-level import graph.

## 0.1.0

### Minor Changes

- f0559b5: `srcatlas analyze` builds a graph and a report for a repository. Without a framework extractor it writes a file-level import graph; `--strict` exits 1 on parse errors or unresolved constructs.

## 0.0.1

### Patch Changes

- d897dc6: First pre-release: `srcatlas --version` and `--help`, config loading and validation. Commands are not implemented yet.
