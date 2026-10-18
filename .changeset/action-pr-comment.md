---
"srcatlas": minor
---

`srcatlas diff --config-ref <ref>` loads the configuration from a git ref and never runs the working directory's config, for pull requests from forks. The Markdown and Mermaid output now neutralise backticks and line breaks in names taken from analysed code, and cap each list at 50 items. The repository has a GitHub Action (`action.yml`) that keeps one pull request comment with the diff.
