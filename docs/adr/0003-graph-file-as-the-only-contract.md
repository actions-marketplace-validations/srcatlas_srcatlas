# ADR 0003: One graph file is the only contract between components

- Status: Accepted
- Date: 2026-10-09
- Deciders: Tunya

## Context
The product has an analyser, differ, rules engine, renderer, viewer, CLI and GitHub Action, built by one developer, partly by coding agents. Without a single boundary, components couple through shared in-memory types and cannot be tested or replaced alone. Later goals (MCP server, other languages, third-party extractors) need a stable interface.

## Decision
The analyser writes `srcatlas.graph.json`, defined by `docs/schema.md` and validated by a Zod schema in `packages/core`. Differ, rules, renderer, viewer, exporters and any future consumer read that file only. Dependencies point downward: `core` depends on nothing; extractors depend on `core`; consumers depend on `core` and never on `analyzer`. Extractors in other languages are executables that emit graph fragments conforming to the same schema.

## Alternatives considered
| Option | Why not |
|---|---|
| Shared in-process object model | Faster, but couples consumers to the analyser; the viewer could not run in a browser without bundling the compiler. |
| Database (SQLite) as the interface | Adds a dependency and binary format; not diffable in git or readable by agents. |
| One schema per consumer | Drift between schemas; no single place to validate. |

## Consequences
- Good: each component is testable with a hand-written graph; viewer and differ run in Node and in a browser; third-party extractors only need `core`; the file is readable by people and by LLM agents.
- Bad: the schema is a public interface from 1.0. Changes need version bumps and a compatibility policy (`docs/schema.md` section 12). Large repositories produce large JSON files; a compact encoding is possible later behind the same schema.

## Revisit when
- Graph files for 5,000-file monorepos exceed what the viewer can load in 2 seconds on a CI runner.
