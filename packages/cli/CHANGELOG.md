# srcatlas

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
