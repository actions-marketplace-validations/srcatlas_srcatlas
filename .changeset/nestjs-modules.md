---
"srcatlas": minor
---

The NestJS extractor reads modules: `@Module` classes become `module` nodes with `imports` edges, `meta.global` and re-exports. Packages that depend on `@nestjs/common` or `@nestjs/core` no longer use the file-level import graph.
