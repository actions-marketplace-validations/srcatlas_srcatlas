# ADR 0009: Portfolio first: scope, order of work, definition of done

- Status: Proposed
- Date: 2026-10-12
- Deciders: Tunya

## Context
- Maintainer goals, stated 2026-10-12: (1) a portfolio piece that stands out; (2) open-source traction, as a signal that the maintainer can find unusual solutions to problems other developers have. Expected development time and money are low.
- Demand validation with potential users is skipped for now, by choice. Whether enough developers want this is unproven. This ADR records that as a known risk, not as an assumption.
- An advisory review on 2026-10-11 (not evidence, a prompt for thinking) converged on three points: the largest risks are static-analysis accuracy and scope, not named competitors; the diagram is a vitamin and the PR check is the painkiller; the DI spike stays the first gate. It disagreed on whether coding agents are a primary audience.
- Before this ADR the backlog reached the Action in M4, after Next.js, the accuracy corpus and the viewer. The first shareable result came last.
- `docs/research/landscape.md` and `docs/accuracy.md` section 7 already define the spike gate and the tier B gates.

## Decision
1. **Goal order.** Portfolio first, traction second. Stars and installs are welcome signals, not gates: no milestone is stopped for low traction.
2. **Technical gates stay.** The DI spike and the tier B gates in `docs/accuracy.md` section 7 still apply. If a gate is missed, print the lower measured number or narrow scope; never print a target.
3. **Order of work.** Pre-work, M0 Foundations, M1 NestJS + Prisma, M2 Diff + Action, M3 NestJS accuracy + launch, M4 Next.js + breadth, M5 Viewer + embeds, v1.1. The first public release follows M3. `scripts/backlog.json` is the source of truth for issues.
4. **Framing.** Lead with the pull request check: what changed in the architecture, and rules such as "a controller must not read or write a model directly". The map and the viewer are secondary.
5. **Adoption on existing repositories.** Rules support an accepted-violations file (a ratchet), so a new install fails only on new violations. The Action posts nothing when the diff has no architectural change.
6. **Deferred until after launch.** Next.js extractor, viewer, SVG export, docs site, MCP, agent export, further frameworks. Package skeletons are created when their milestone starts, not all in M0.
7. **Definition of done for the portfolio (milestone M3).**
   - CI green on Linux, macOS and Windows.
   - Hand-written golden files and decoys for every shipped pattern.
   - Measured NestJS accuracy generated from `bench/results/`, with the limits in `docs/accuracy.md` section 9 printed.
   - A real PR comment from the Action, on a repository the maintainer has permission to use, shown in the README.
   - A written account of the technique and what was hard.
   - Not part of done: star count, install count.
8. **Open.** Time budget and a stop date are not set. Set them before M2 starts.

## Alternatives considered
| Option | Why not |
|---|---|
| Keep the previous order (Next.js and viewer before the Action) | The first shareable result arrives late and most work stays unseen by anyone until the end. |
| Run demand interviews first | The maintainer chose to skip them: the cost is not justified by a portfolio-first goal. See "Revisit when". |
| Collapse everything into one package | Loses the dependency direction rules in CLAUDE.md section 1. Instead, create skeletons only when needed. |

## Consequences
- Good: a shareable artifact (PR comment) after M2, a launchable release after M3; a smaller surface to keep correct before launch.
- Bad: no evidence of demand, so traction may be low. The most visual part (the viewer) comes late; the Mermaid diagram in the PR comment is the visual at launch.
- Bad: Next.js-only repositories are not served by the first release.
- Harder: README claims about Next.js and Prisma wait for their own measured gates.

## Revisit when
- M3 has shipped and four weeks pass with no outside installs, issues or stars.
- The maintainer's goal changes (for example, wanting adoption or income).
- The DI spike fails or narrows scope.
- The maintainer decides to run demand interviews.
