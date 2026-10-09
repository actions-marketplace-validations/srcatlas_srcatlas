# Security policy

## Reporting a vulnerability

Use GitHub's private vulnerability reporting for this repository (Security tab → Report a vulnerability). Do not open a public issue.

Include: affected version, what an attacker can do, and steps to reproduce. Expect an acknowledgement within 7 days. This is a one-person project; fix timelines depend on severity and are communicated in the advisory thread.

## Supported versions

Pre-1.0: only the latest published version receives fixes. After 1.0: the latest minor release of the latest major.

## Threat model (summary)

srcatlas analyses repositories it does not trust. What it is designed to guarantee:

| Property | Statement |
|---|---|
| No execution of analysed code | The analyser reads source and project files only. It does not import, run or build the analysed application (ADR 0001). |
| No network access in analysis | `analyze`, `diff`, `check`, `export` and `explain` make no network calls. `serve` binds `127.0.0.1` only. |
| No source text in outputs | Graph files contain names, paths and line numbers, not source code. |

## Known trust boundaries

- **The config file executes.** `srcatlas.config.ts` is loaded as code, like any build config (ADR 0006). Running srcatlas on an untrusted repository runs that repository's config. In CI on pull requests from forks, the Action must load the config from the base branch, not the pull request head. This is a design requirement for the Action (open question in ADR 0006).
- **Pathological input.** Very large or deeply nested files can exhaust memory or time. Limits exist (`analysis.maxFileSizeKb`); reports of denial-of-service inputs are in scope.
- **Path handling.** Graph paths are repository-relative. A report showing absolute paths, `..` segments, or reads outside the repository root is a vulnerability.
- **Viewer.** The viewer renders names taken from analysed code. Any way to inject script through a node name or path is a vulnerability.

## Out of scope

- Findings that require the user to run untrusted code they chose to run themselves, other than through the config-loading boundary above.
- Missing hardening of third-party services the user connects (GitHub, Cloudflare).
