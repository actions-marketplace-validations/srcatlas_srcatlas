# srcatlas

## 0.2.0

### Minor Changes

- b3f063e: The NestJS extractor reads modules: `@Module` classes become `module` nodes with `imports` edges, `meta.global` and re-exports. Packages that depend on `@nestjs/common` or `@nestjs/core` no longer use the file-level import graph.

## 0.1.0

### Minor Changes

- f0559b5: `srcatlas analyze` builds a graph and a report for a repository. Without a framework extractor it writes a file-level import graph; `--strict` exits 1 on parse errors or unresolved constructs.

## 0.0.1

### Patch Changes

- d897dc6: First pre-release: `srcatlas --version` and `--help`, config loading and validation. Commands are not implemented yet.
