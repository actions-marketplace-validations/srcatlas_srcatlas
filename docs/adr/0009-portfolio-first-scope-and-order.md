# ADR 0009: Portfolio first: scope, order of work, definition of done

- Status: Accepted (item 5 amended 2026-10-12 after `docs/research/rule-tools.md`)
- Date: 2026-10-12
- Deciders: Tunya

## Context
- Maintainer goals, stated 2026-10-12: (1) a portfolio piece that stands out; (2) open-source traction, as a signal that the maintainer can find unusual solutions to problems other developers have. Long-term aim: high measured accuracy on any TypeScript or JavaScript framework or tool, giving a useful view of a program's architecture, and then adaptation to coding agents.
- Development is directed and reviewed by the maintainer while a coding agent writes the code. Calendar estimates are not reliable under that workflow, so the plan carries no dates. Progress is decided by evidence (the spike, the accuracy gates), not by dates.
- No money is needed until outside users appear. Budget is not a planning input.
- Demand validation with potential users is skipped for now, by choice. Whether enough developers want this is unproven. This ADR records that as a known risk, not as an assumption.
- Two advisory reviews (2026-10-11 and 2026-10-12; prompts for thinking, not evidence) converged on: the largest risks are static-analysis accuracy and scope, not named competitors; the diagram is a vitamin and the PR check is the painkiller; the DI spike stays the first gate and should also score injection edges; an unfinished repository is worth less than a small finished one; architecture-rule tools and agent repo-map tools are not yet researched. They disagreed on whether agents should be the headline now.
- Before this ADR the backlog reached the Action late, after Next.js, the accuracy corpus and the viewer.
- `docs/research/landscape.md` and `docs/accuracy.md` section 7 already define the spike gate and the tier B gates.

## Decision
1. **Goal order.** Portfolio first, traction second. Stars and installs are welcome signals, not gates: no milestone is stopped for low traction.
2. **No dates.** Milestones carry no due dates, hours budget or kill date. Stop and narrow decisions are gate-based (item 8).
3. **Technical gates stay.** The DI spike and the tier B gates in `docs/accuracy.md` section 7 still apply. If a gate is missed, print the lower measured number or narrow scope; never print a target.
4. **Order of work.** Pre-work, M0 Foundations, M1 NestJS + Prisma, M2 Diff + Action, M3 NestJS accuracy + launch. After the M3 gate is met, coding-agent adaptation (query, MCP, agent export) starts and is a priority. M4 (Next.js and remaining NestJS patterns) and M5 (viewer, SVG export, docs site) are not committed: they are ordered by priority after M3, alongside agent work. `scripts/backlog.json` is the source of truth for issues.
5. **Framing.** Lead with what changed in a pull request: the diff of the architecture (new routes, queues, cross-module edges, module import cycles, new global modules). Rules are a complement, not the pitch, and are shown with examples that need framework knowledge, such as no import cycles between modules or "module X must not write model Y". Import-level layering (a controller importing the database client) is already served by existing rule tools (`docs/research/rule-tools.md`), so it is not claimed as unique. The map and the viewer are secondary.
6. **Adoption on existing repositories.** Rules support an accepted-violations file (a ratchet), so a new install fails only on new violations. The Action posts nothing when the diff has no architectural change.
7. **Scope discipline.** Package skeletons are created when their milestone starts, not all in M0. Frameworks are added one at a time, each with its own extractor document first (CLAUDE.md sections 6 and 11).
8. **Minimum finish and stop rules.**
   - Minimum finish: NestJS + Prisma extractor, differ, the Action, rules with ratchet, a real PR comment screenshot from a dogfood run, and an honest accuracy note.
   - If the DI spike misses its bar, narrow to Prisma models and a route-level graph, or stop and write up what was learned. A partial result with honestly printed limits is an acceptable outcome.
   - The maintainer's own projects (for example crwsync) are used for the spike and the dogfood demo. They stay out of the published accuracy number (`docs/accuracy.md` section 3, tier C).
9. **Definition of done for the portfolio (milestone M3).**
   - CI green on Linux, macOS and Windows.
   - Hand-written golden files and decoys for every shipped pattern.
   - Measured NestJS accuracy generated from `bench/results/`, with the limits in `docs/accuracy.md` section 9 printed.
   - A real PR comment from the Action, on a repository the maintainer has permission to use, shown in the README.
   - The README opens with the one-sentence pitch, the screenshot and the accuracy table.
   - A written account of the technique and what was hard.
   - Not part of done: star count, install count.
10. **Long-term direction.** High measured accuracy on any TypeScript or JavaScript framework or tool, added one at a time and measured with the same method. JavaScript (not only TypeScript) projects are a direction, not current scope. This does not relax the rule against accuracy claims without a measured number (`docs/accuracy.md` section 8).

## Alternatives considered
| Option | Why not |
|---|---|
| Keep the previous order (Next.js and viewer before the Action) | The first shareable result arrives late and most work stays unseen by anyone until the end. |
| Keep calendar due dates | Agent-assisted development makes dates unreliable and adds false precision; gates carry the decisions. |
| Run demand interviews first | The maintainer chose to skip them. See "Revisit when". |
| Collapse everything into one package | Loses the dependency direction rules in CLAUDE.md section 1. Instead, create skeletons only when needed. |
| Make agents the headline now | Unvalidated, and widens scope before the base is accurate. Agent work starts after the M3 gate. |

## Consequences
- Good: a shareable artifact after M2, a launchable release after M3; a smaller surface to keep correct before launch; decisions tied to evidence.
- Bad: no evidence of demand, so traction may be low. The most visual part (the viewer) is not committed; the Mermaid diagram in the PR comment is the visual at launch.
- Bad: Next.js-only repositories are not served by the first release.
- Harder: README claims about Next.js and Prisma wait for their own measured gates. Without dates, nothing forces a decision to stop; the gates must be honoured.

## Revisit when
- M3 has shipped and the launch posts bring no outside installs, issues or stars.
- The maintainer's goal changes (for example, wanting adoption or income).
- The DI spike fails or narrows scope.
- The maintainer decides to run demand interviews.
- Research on rule tools and agent repo-map tools changes the framing.
