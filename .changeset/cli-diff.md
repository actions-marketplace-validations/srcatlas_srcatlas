---
"srcatlas": minor
---

`srcatlas diff <base> <head>` compares two graphs: each side is a git ref, a graph file, or `WORKTREE` for the head. It writes `srcatlas.diff.json` and prints text, JSON, a Markdown pull request comment body with a Mermaid mini-graph, or the Mermaid graph alone; `--fail-on` turns new cycles, new cross-module edges and removed nodes into exit code 1. Graphs of git refs are cached by commit. The graph now has `depends_on` edges between workspace packages that import each other.
