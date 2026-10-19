# Tier B corpus selection: stage 1 (NestJS)

Status: draft, not yet approved. Rules below are fixed before any repository is chosen and before srcatlas is run on any candidate (`docs/accuracy.md` section 3). Changing a rule after the candidate list exists needs its own commit with the reason.

## Scope

Stage 1 is 5 NestJS repositories. Stage 2 (3 Next.js, 2 full-stack) gets its own file section, committed before its run.

## Search query

Applied mechanically on the GitHub search API, on the date recorded in `candidates.md` when the list is generated:

```
language:TypeScript stars:500..5000 pushed:>=<date minus 12 months> archived:false fork:false
```

plus a content filter: `package.json` at the root or in a workspace package lists `@nestjs/core` in `dependencies`.

Results are sorted by stars descending. The full result list, as returned, is committed as `candidates.md` (name, stars, last push, licence, SHA of the default branch at that moment).

## Inclusion rules

Each candidate is checked in list order, top to bottom. The first 5 that pass all rules are selected.

1. Licence permits use and redistribution of a SHA reference (OSI-approved licence file present). The corpus stores URL + SHA + labels, never code.
2. At least 5,000 lines of TypeScript and at least 20 files the NestJS extractor targets (files with `@Module`, `@Controller` or `@Injectable`).
3. The repository contains a NestJS application (a `NestFactory.create` call), not only a library.
4. No more than 3 selected repositories above 50,000 lines of TypeScript. Once 3 are selected, a larger candidate is skipped.
5. At least 2 selected repositories are ones the maintainer has never read. The maintainer marks these in `candidates.md` before the tool is run; if fewer than 2 qualify, later qualifying candidates replace the last selected ones until the rule holds.

## Fixed afterwards

- Each selected repository is pinned to the SHA recorded in `candidates.md`.
- No repository is removed after seeing results, except for a non-accuracy reason (repository deleted, licence changed, SHA unreachable). The reason is written in `bench/corpus/<repo>/NOTES.md`.
- Ground truth: runtime oracle for modules, providers, `injects` and routes (`bench/oracles/nestjs-runtime/`); hand labels for edges without an oracle, only the first 60 files by sorted path when a repository is larger. Labels are committed before the tool is run on the repository.

## Open questions

1. Second labeller (`docs/accuracy.md` open question 3): unresolved.
2. Apps that cannot boot without external services: fall back to hand labels, recorded per repository in `NOTES.md`.
