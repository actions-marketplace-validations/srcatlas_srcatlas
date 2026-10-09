# ADR 0007: MIT licence, local-first, no hosted dependency

- Status: Accepted
- Date: 2026-10-09
- Deciders: Tunya

## Context
`docs/research/landscape.md` identifies the opening: NestJS's CI/CD tooling is on an Enterprise plan and tied to a hosted registry, AI-wiki tools are not reproducible, and an earlier PR-visualisation product (CodeSee) was acquired and stopped being independent. Adoption of a developer tool depends on zero-friction trial and on teams trusting that code does not leave their CI. The project is built by one developer as a portfolio and open-source effort.

## Decision
- Licence: MIT for all packages in the repository.
- Local-first: every core capability (`analyze`, `diff`, `check`, `export`, viewer, PR comment) works with a repository checkout and `GITHUB_TOKEN` only. No account, no API key, no hosted service.
- Optional hosting: the publish feature (Cloudflare Worker + R2, P1) is optional, off by default, and never required by another feature.
- No telemetry. If it is ever added, it is opt-in and documented.
- Graph files contain names and paths, never source text.

## Alternatives considered
| Option | Why not |
|---|---|
| Apache-2.0 | Patent grant is useful, but friction for a small project; MIT matches the target ecosystem. |
| AGPL or source-available with a commercial tier | Reduces adoption and corporate use; a hosted business is not a goal. |
| Open-core with paid CI features | Recreates the gap the product fills. |

## Consequences
- Good: lowest adoption friction; privacy claims are checkable in the code; matches positioning.
- Bad: no revenue path from the tool itself. The project's return is reputation and portfolio value, which is the intent.
- Bad: no contributor licence agreement means relicensing needs every contributor's consent. Acceptable for MIT.

## Revisit when
- The project needs a funded hosted service to survive; that would be a new, separately licensed component, not a change to the core.
