---
"srcatlas": minor
---

`srcatlas check` can adopt rules on a repository that already breaks them. `check --accept` records the current violations in `srcatlas.accepted.json`; later runs fail only on violations that are not in the file, and `check --accept` removes entries that no longer occur. New violations are added only with `--accept --add`.
