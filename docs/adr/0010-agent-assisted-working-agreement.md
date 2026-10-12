# ADR 0010: Working agreement for agent-assisted development

- Status: Proposed
- Date: 2026-10-12
- Deciders: Tunya

## Context
- A coding agent writes most of the code. The maintainer directs the work, reviews it and owns the result (ADR 0009).
- The project's value depends on trust in its output. The risks of agent-written code are specific: a golden file generated from the extractor's own output proves nothing; a failing test can be "fixed" by weakening it; accuracy claims can be typed from memory; a spec gap can be filled with invented behaviour; a report of success can be wrong.
- CLAUDE.md already sets rules for the agent (sections 1, 6, 7, 8). It says nothing about what the maintainer checks personally, and nothing about how an agent reports its own work.

## Decision
The agent follows the rules below and the maintainer holds the checkpoints below. The rules that bind the agent are summarised in CLAUDE.md section 6; this ADR holds the reasons and the maintainer's side.

### The agent
1. **Reads first.** Reads CLAUDE.md and the document for the task. If a document and the code disagree, stops and says so.
2. **Works in small steps.** One pattern or one feature per change, on a branch, through a pull request. Never pushes to `main`.
3. **Splits an extractor pattern into two commits.** First: the fixture, the golden file written from the pattern's specification (never from extractor output), and a failing test. The maintainer approves this commit. Second: the implementation.
4. **Never weakens a check to make it pass.** Golden files, expected reports, thresholds and gates are not edited to turn a run green. If the agent believes the specification or the golden file is wrong, it stops and reports. A legitimate change to one of them is its own commit, with the pattern ID and the reason in the message.
5. **Never types accuracy numbers.** Numbers come from `bench/results/` only (`docs/accuracy.md` section 8).
6. **Reports, does not resolve.** Ambiguity goes to the maintainer or to the document's "Open questions". The agent does not invent behaviour.
7. **Reports what it ran.** Every task ends with the exact commands run and their results. Anything skipped is stated as "not run". A task is not called done on the agent's word; section "Independent checks" decides.
8. **Leaves protected files alone without approval.** `docs/schema.md` and the Zod schema, `docs/adr/`, CLAUDE.md, CI and release configuration, the licence, and the dependency list.

### The maintainer
| Checkpoint | When | What to look at |
|---|---|---|
| A. Approve the golden file | Before the implementation commit of each extractor pattern | Does the fixture match the specification, and is there a decoy? |
| B. Review interface changes | Any change to the schema, config or CLI interface, or an ADR | Is the document changed in the same commit, with the version policy followed? |
| C. Review test changes | Any diff that touches a test, fixture expectation or gate | Did a check get weaker? Is the reason written down? |
| D. Look at real output | Each milestone exit gate | Run the tool on a real repository and read the graph and the report. Do not rely on the agent's summary. |
| E. Own accuracy | Before every release | Run `pnpm bench` yourself. Read the unresolved report for one real repository. |
| F. Decide scope | Always | Order of work, new frameworks, what is deferred. |

Pull request checklist, short: golden file approved; decoy present; CI green on all three operating systems; determinism test passes; no weakened assertion; documents updated; report codes listed in the extractor document; no new dependency without a one-line reason.

### Independent checks
Do not trust an agent's statement of success when one of these can say it instead: the CI matrix, the determinism byte-compare, the runtime oracle (`docs/accuracy.md` section 2), and hand labels committed before the first scored run. A second agent can review a change as a supplement, but the same model reviewing its own family's output is not an independent check.

### Briefing an agent
A task names the issue number and the document section, for example "implement N-M1 from `docs/extractors/nestjs.md`, fixture `nest-basic`". The issue's "Done when" list is the acceptance criteria.

## Alternatives considered
| Option | Why not |
|---|---|
| CLAUDE.md rules only, with no maintainer checkpoints | Rules without a human check drift. The cases that hurt most (a weakened test, a typed number) are the ones an agent will not flag. |
| The maintainer reviews every line | Not feasible at the intended pace, and not needed if the checkpoints sit where errors do the most harm. |
| Let a second agent review everything | Useful as a supplement. It shares blind spots with the first and does not replace the oracle or CI. |

## Consequences
- Good: errors that would damage the accuracy claim are caught by design; the maintainer's time goes where it matters; the agent's reports become checkable.
- Bad: the approval step before each pattern's implementation is a deliberate bottleneck.
- Bad: the maintainer must understand the specifications well enough to approve a golden file.

## Revisit when
- Approvals start to be given without reading.
- A defect reaches a user that one of the checkpoints should have caught.
- The way of working changes (for example, several agents in parallel).
