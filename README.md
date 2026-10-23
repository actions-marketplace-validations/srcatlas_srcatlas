# srcatlas

Catch architecture changes in pull requests before they merge. srcatlas turns your TypeScript repository into a diffable architecture file, generated from code and checked on every pull request.

> **Status: pre-alpha, design phase.** Nothing is published yet. The commands below describe the planned interface (`docs/cli.md`). There are no accuracy numbers because nothing has been measured (`docs/accuracy.md`).

srcatlas reads a repository without running it and writes `srcatlas.graph.json`: modules, providers, controllers, routes, database models, queues and the edges between them. It understands NestJS, Next.js (App Router) and Prisma first. A GitHub Action compares the graph of a pull request with its base and comments with what changed.

## What it will do

- **Review:** `srcatlas diff main WORKTREE` and the GitHub Action report added and removed routes, models, queues and cross-module edges, and new dependency cycles.
- **Check:** `srcatlas check` enforces rules over the architecture graph, such as no import cycles between modules or "module X must not write model Y". On an existing repository it can accept today's violations and fail only on new ones.
- **Map:** `srcatlas analyze` writes a deterministic graph file. Same commit, same bytes.
- **Show:** `srcatlas serve` opens an interactive viewer; `srcatlas export` writes SVG, PNG, Mermaid or DOT for your README. The viewer and exports come after the first release.

## Principles

- Static analysis only. The analysed application is never executed.
- No account, no API key, no hosted service. `GITHUB_TOKEN` is enough in CI.
- No telemetry. Graph files contain names and paths, never source text.
- Unresolved constructs are reported, not guessed.

## Planned usage

```sh
npx srcatlas init
npx srcatlas analyze
npx srcatlas serve
```

## Documentation

| Document | Content |
|---|---|
| [`docs/schema.md`](docs/schema.md) | Graph file format |
| [`docs/extractors/nestjs.md`](docs/extractors/nestjs.md) | NestJS pattern catalogue |
| [`docs/extractors/prisma.md`](docs/extractors/prisma.md) | Prisma pattern catalogue |
| [`docs/cli.md`](docs/cli.md) | Commands, flags, exit codes |
| [`docs/config.md`](docs/config.md) | `srcatlas.config.ts` reference |
| [`docs/action.md`](docs/action.md) | GitHub Action: usage, permissions, fork pull requests |
| [`docs/maintenance.md`](docs/maintenance.md) | Report triage, supported versions, schema compatibility |
| [`docs/accuracy.md`](docs/accuracy.md) | How accuracy is measured and what may be claimed |
| [`docs/research/landscape.md`](docs/research/landscape.md) | Alternatives and positioning |
| [`docs/adr/`](docs/adr/README.md) | Architecture decision records |

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). The most useful early contribution is a "wrong graph" report with a minimal repository.

## Licence

[MIT](LICENSE)
