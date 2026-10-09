# ADR 0006: Configuration is an executable TypeScript file

- Status: Accepted (loader library: proposed)
- Date: 2026-10-09
- Deciders: Tunya

## Context
Users need typed, commented configuration with globs and architecture rules. The target audience already uses `vite.config.ts`, `next.config.ts` and similar. `docs/config.md` defines the options.

## Decision
Configuration is `srcatlas.config.ts` with a default export from `defineConfig`. It is executed once at start and validated with Zod; unknown keys are errors. Executing the config file is documented as the same trust level as any build config. The analyser never executes the repository's application code (ADR 0001). The loader library (`jiti`, `c12` or `unconfig`) is chosen in the M0 scaffold by these criteria: Windows support, ESM and CJS handling, install size, maintenance activity.

## Alternatives considered
| Option | Why not |
|---|---|
| JSON or YAML | No types, no comments (JSON), awkward for rules and reuse. |
| TypeScript file only via `ts-node` | Heavy, slower start, extra dependency chain. |
| Config in `package.json` | Cramped for rules; mixes concerns. |

## Consequences
- Good: autocomplete and type checking in editors; shared helpers possible.
- Bad: the config can run arbitrary code, so running `srcatlas` on an untrusted repository executes that repository's config. Mitigation: documented; the GitHub Action runs with a read-only token on fork PRs and a mode that ignores the config file from the PR head is planned (see open question below).
- Bad: a JSON Schema for editors must be generated from the Zod schema.

## Open question
For pull requests from forks, the Action should load the config from the base branch, not the PR head, to avoid running PR-supplied code. Decide with the Action design in M4.

## Revisit when
- A security report, or the Action design shows the base-branch rule is insufficient.
