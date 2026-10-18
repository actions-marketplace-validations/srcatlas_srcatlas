---
"srcatlas": minor
---

`srcatlas check [graph]` evaluates the `rules` from the config against a graph: `forbidden-edge` and `no-cycles` rules, with `except` lists and `minConfidence`. It prints text, JSON or GitHub annotations, and exits 1 on an `error`-severity violation. `max-fan-out` and `layering` rules are accepted but skipped with a warning.
