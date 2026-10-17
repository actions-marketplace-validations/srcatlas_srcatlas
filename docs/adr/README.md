# Architecture decision records

One file per decision that is expensive to reverse. Format: `docs/adr/_template.md`. Numbers are never reused. A decision is changed by a new ADR that supersedes the old one; the old one stays, with its status updated.

| # | Title | Status |
|---|---|---|
| [0001](0001-static-analysis-over-runtime-graph.md) | Static analysis, not a running app | Accepted |
| [0002](0002-ts-morph-for-analysis.md) | ts-morph over the TypeScript compiler API | Accepted |
| [0003](0003-graph-file-as-the-only-contract.md) | One graph file is the only contract between components | Accepted |
| [0004](0004-deterministic-identity-and-output.md) | Deterministic node identity and byte-stable output | Accepted |
| [0005](0005-viewer-rendering-react-flow-with-gate.md) | React Flow and ELK for the viewer, with a benchmark gate | Accepted |
| [0006](0006-executable-typescript-config.md) | Configuration is an executable TypeScript file | Accepted |
| [0007](0007-mit-licence-and-local-first.md) | MIT licence, local-first, no hosted dependency | Accepted |
| [0008](0008-config-loader-jiti.md) | Load `srcatlas.config.ts` with jiti | Accepted |
| [0009](0009-portfolio-first-scope-and-order.md) | Portfolio first: scope, order of work, definition of done | Accepted |
| [0010](0010-agent-assisted-working-agreement.md) | Working agreement for agent-assisted development | Proposed |
| [0011](0011-access-facts-and-link-pass.md) | Extractors emit facts; the link pass turns them into edges | Accepted |

When to write a new ADR: the decision changes the graph schema, a public interface, a dependency that is hard to swap, or a stated project principle. Not for naming, formatting or single-feature choices.
