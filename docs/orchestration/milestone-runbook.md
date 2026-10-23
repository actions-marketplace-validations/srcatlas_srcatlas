# Milestone runbook

A reusable checklist for running one milestone with Orchestrator: one worker per issue, each in its own worktree, each opening one PR. Replace `<slug>` with the milestone slug and `<N>` with issue numbers.

Worker behaviour is defined in [`worker-rules.md`](worker-rules.md). That file must exist on the branch workers start from.

## Checklist

1. **Prepare issues.** Create one issue per unit of work from the `agent-task` template (`.github/ISSUE_TEMPLATE/agent-task.md`). Fill in scope, acceptance criteria with commands, and `Depends on #N` lines.
2. **Create the integration branch.** From the default branch:
   ```sh
   git fetch origin
   git switch -c milestone/<slug> origin/main
   git push -u origin milestone/<slug>
   ```
3. **Point Orchestrator at it.** In Orchestrator Project Settings set `defaultBranch` to `milestone/<slug>`. After the first worker PR opens, check that its base is `milestone/<slug>`. If not, stop the run and fix the setting.
4. **Start the orchestrator** with a prompt like the template below.
5. **Cap workers at 3.** The orchestrator orders issues by their `Depends on #N` lines.
6. **Review and merge worker PRs** into `milestone/<slug>` yourself. Dependent issues start only after their dependencies are merged.
7. **Finish.** When every PR is merged:
   - Run `pnpm build && pnpm lint && pnpm typecheck && pnpm test && pnpm check:deps` on `milestone/<slug>`.
   - Review the combined diff against the default branch.
   - Open one PR from `milestone/<slug>` to the default branch. List `Closes #<N>` for every issue in the body, one per line.
   - Merge it.
8. **Reset** `defaultBranch` in Orchestrator Project Settings to the repository default branch, and delete `milestone/<slug>`.

GitHub closes issues automatically only when a PR merges into the default branch. Merging worker PRs into the integration branch leaves their issues open until step 7.

## Orchestrator prompt template

```text
Milestone: <slug>. Issues: #<N1>, #<N2>, #<N3>.
Read all of these issues first. Order them by their "Depends on #N" lines.
Spawn one worker per issue, at most 3 at once. Each worker follows docs/orchestration/worker-rules.md
and opens one PR against the integration branch milestone/<slug> with "Closes #<its issue>".
Do not merge any PR. Tell me which PRs are ready for review, and summarise when all workers are done.
```
