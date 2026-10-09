# ADR 0002: ts-morph over the TypeScript compiler API

- Status: Accepted
- Date: 2026-10-09
- Deciders: Tunya

## Context
Following dependency injection needs symbol and type resolution: re-exported classes, path aliases, `typeof` tokens, injected constructor parameter types, decorators matched by import origin. Syntax-only parsers cannot answer these without reimplementing module resolution and type checking.

## Decision
Analysis uses `ts-morph`, a wrapper over the TypeScript compiler API, with one TypeScript program per package, run in a `worker_threads` pool. The language is TypeScript and the runtime is Node 20 or newer.

## Alternatives considered
| Option | Why not |
|---|---|
| Raw TypeScript compiler API | Same capability, more boilerplate; ts-morph exposes it with a navigable AST. Escape hatch stays available (`node.compilerNode`). |
| Babel, SWC, oxc | Fast, syntax only: no type or symbol resolution. |
| tree-sitter | Same limitation, and one grammar per language. Useful later for non-TypeScript extractors, which are separate processes (see multi-language note in the spec). |
| Rust or Go analyser | Faster parsing, but needs type resolution reimplemented or a second toolchain. Contributors in the target audience write TypeScript. |

## Consequences
- Good: accurate resolution of imports, aliases and re-exports; one language across packages; direct access to the compiler.
- Bad: slower than native parsers; memory-heavy on large monorepos. Mitigated by one program per package, workers, incremental analysis (P1) and the budgets in spec section 15 (500 files under 20 s on 4 cores; under 2 GB on 5,000 files).
- Bad: ts-morph tracks TypeScript versions with a lag. The analyser must handle the analysed repository's TypeScript syntax even if it is newer than the bundled compiler; unparsable files are skipped and reported.

## Revisit when
- Benchmarks miss the performance budgets on the largest tier B repository after optimisation.
- A non-TypeScript framework is added: that extractor is an out-of-process executable emitting graph fragments, not part of this decision.
