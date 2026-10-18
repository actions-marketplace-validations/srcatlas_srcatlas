---
"srcatlas": minor
---

`srcatlas init` detects NestJS and Prisma by dependencies and writes `srcatlas.config.ts`, with optional `.gitignore` and GitHub workflow files; it never overwrites without `--force`. A config that imports `defineConfig` from `srcatlas` now loads when srcatlas is run with npx and not installed in the project.
