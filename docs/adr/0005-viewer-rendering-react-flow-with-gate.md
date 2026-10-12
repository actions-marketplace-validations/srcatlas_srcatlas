# ADR 0005: React Flow and ELK for the viewer, with a benchmark gate

- Status: Accepted
- Date: 2026-10-09
- Deciders: Tunya

## Context
The viewer must show graphs with hundreds to thousands of nodes, with collapsed modules, search, filters, focus and trace modes, and a diff mode. Rendering is the highest-risk UI decision: a general node-graph library is fast to build with but may not hold frame rate; a custom Canvas renderer holds frame rate but costs weeks.

## Decision
Layout uses ELK (layered algorithm) in a web worker. Rendering uses React Flow inside a Vite + React + Tailwind + shadcn/ui + Zustand app. The initial view shows modules collapsed with aggregated, weighted module-to-module edges, which bounds the number of rendered nodes. A benchmark gate at the start of M5 (the viewer milestone) requires 60 fps while panning and zooming with 300 visible nodes. If React Flow fails the gate, the renderer is replaced with a custom Canvas renderer before further viewer work.

## Alternatives considered
| Option | Why not |
|---|---|
| Cytoscape.js | Strong at large graphs, weaker React integration and compound-node styling. Kept as fallback candidate. |
| D3 force layout | No layered layout; force layouts are unstable between runs, which conflicts with ADR 0004. |
| Custom Canvas / WebGL first | Highest performance, highest cost; premature before measuring. |
| Mermaid or Graphviz output only | Not interactive; remains the export path. |

## Consequences
- Good: faster path to a usable viewer; accessible DOM nodes; ecosystem components.
- Bad: DOM-based nodes limit scale; mitigated by collapsing and the gate.
- Bad: ELK adds bundle size and layout time on large graphs; layout runs in a worker and is cached per collapse state.
- The layout must be deterministic for the same graph and collapse state, so shared URLs reproduce the same picture.

## Revisit when
- The M5 benchmark fails (replace the renderer), or tier B repositories need more than 300 simultaneous visible nodes in normal use.
