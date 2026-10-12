# Architecture-rule tools and agent repo-map tools: research notes

Status: draft 1, 2026-10-12. Done for the backlog issue "Research architecture-rule tools and agent repo-map tools; zero-outreach demand check". Read with `docs/research/landscape.md`.

Naming: tools that meet the inclusion rule in `landscape.md` section 1 are named. Small single-maintainer projects are described by category with their approximate star count and are not named (CLAUDE.md section 9).

## 1. Method and limits

- Documentation and READMEs were read on 2026-10-12. Star counts are from the project pages that day.
- GitHub code search was used for a zero-outreach demand check. Its totals are approximate, count files and not repositories, and include forks, templates and tutorials. Treat them as orders of magnitude.
- Not checked: pricing, release cadence, and behaviour in the newest versions beyond what each README states.

## 2. What rule tools can express

| Tool | Matches on | How rules are written | Framework awareness |
|---|---|---|---|
| Nx `enforce-module-boundaries` (lint rule; Nx has 29.3k stars) | Project tags in an Nx workspace | `depConstraints` with `sourceTag`, `onlyDependOnLibsWithTags`, `notDependOnLibsWithTags` | None; project level. Only meaningful in an Nx workspace |
| dependency-cruiser (7.2k stars) | Files and folders; regular expressions on paths and dependency types | `forbidden` rules with `from` and `to` | None; imports only |
| An ESLint plugin for element boundaries (about 1.0k stars) | Elements defined by path patterns | `allow` and `disallow` policies between element types | None described; path and import based |
| An ArchUnit-style test library for TypeScript (about 0.5k stars) | File and folder import relations; class metrics | Rules written as tests (Jest, Vitest, Jasmine) | None described; generic, works with any folder structure |
| A tag and barrel-file module tool (about 0.3k stars) | Tags and public-API barrel files | Dependency rules between tags | None described |

All of them match on files, folders, tags and imports. None of the README or documentation pages read describes reading decorators, dependency-injection registrations, routes, queues or database access.

## 3. What naming conventions can already do

Two public dependency-cruiser configurations were inspected. Between them they contain rules of these shapes:
- `\.controller\.ts$` must not depend on `\.repository\.ts$` (warning);
- `\.service\.ts$` must not depend on `\.controller\.ts$` (error);
- a "prisma-stays-in-db" rule: nothing outside `db/` may import `@prisma/`, `prisma/` or `.prisma/`;
- layer rules between `entities/`, `services/`, `controllers/`, `routes/` and `db/`.

So controller-to-database layering, the example used in the README, can already be enforced with import rules when files follow naming conventions.

What import rules do not see:
- injection by token (`@Inject(DB)`) or through a re-export, where the class is never imported at the call site;
- layers defined by what a class is (a decorator) rather than where it lives;
- Nest module relations: which module registers which provider, and module-level import cycles, which differ from file-level cycles;
- anything that is not an import: routes, guards on a route, queues and their consumers, models written by a handler.

## 4. Demand signal from GitHub code search (zero outreach)

Run 2026-10-12. Each count is files that satisfy both conditions.

| Query (files named `package.json` unless stated) | Files |
|---|---|
| Lists `@nestjs/core` | about 279,000 |
| ... and an ESLint element-boundary plugin | 108 (about 0.04%) |
| ... and dependency-cruiser | 227 (about 0.08%) |
| ... and an ArchUnit-style test library | 2 |
| ... and a tag and barrel module tool | 2 |
| ... and `@nx/eslint-plugin` | 4,752 (about 1.7%; shows Nx workspaces, not that boundaries are used) |
| dependency-cruiser config files mentioning "controller" and "service" | 143 (`.js`) and 76 (`.cjs`) |
| Files mentioning `boundaries/elements`, "controller" and "service" | 318 |
| Files mentioning `enforce-module-boundaries` and `@nestjs/core` | 75 |

Reading:
- Explicit architecture-rule tooling is rare in NestJS repositories: well under 1% for each dedicated tool.
- Where it is used, controller and service layering does appear (section 3).
- This cannot separate "a need nobody has served" from "a need few people have". The counts are upper bounds: of the first results inspected, many were templates, tutorials or tool documentation.

## 5. NestJS Devtools: graph source (resolved)

`landscape.md` listed as unverified whether Devtools builds its graph statically or at runtime. The Devtools overview documentation describes a runtime, metadata-based approach:
- with `snapshot: true` in `NestFactory.create()`, Nest collects graph metadata during bootstrap;
- a failed bootstrap can write a partial graph (`abortOnError: false`);
- a serialised graph can be saved and previewed offline, but it is produced from an initialised app.

So the Devtools graph is runtime-derived. The CI/CD plan requirement was not re-checked here.

## 6. Agent repo-map tools

| Tool | What it provides | Notes |
|---|---|---|
| Aider repo map (49.5k stars, Apache-2.0) | A map of files and their key symbols, sent with each request. A graph ranking algorithm over file dependencies picks the most relevant parts; the default budget is 1k tokens (`--map-tokens`) | Built per session; not a stored artefact; no framework concepts described |
| Sourcegraph SCIP and `scip-typescript` | A precise, compiler-accurate index of definitions and references for TypeScript and JavaScript, language-agnostic | Commercial owner; symbol level, not architecture |
| MCP servers that build a code graph | Several small open-source servers exist that turn a TypeScript or JavaScript repository into a graph with queries such as neighbours and impact analysis | Names withheld. Maintenance and framework awareness were not checked |

File-level and symbol-level context for agents is a crowded space. No tool read here describes framework-level facts (DI wiring, routes, queues, database access) with source citations. Whether coding agents do better with such a file is untested.

## 7. Conclusions for the plan

1. The direction in ADR 0009 holds: lead with what changed in a pull request. No tool read here produces a PR-time diff of framework-level architecture.
2. The example "a controller must not read or write a model directly" is the weakest claim. Import rules approximate it in projects that follow naming conventions (section 3). Recommended for a maintainer decision, not made here:
   - reword the README "Check" bullet and ADR 0009 item 5 to give examples that need framework knowledge, such as a new route without a guard, a new global module, a new queue consumer, a module import cycle, or a provider outside module X writing model Y;
   - keep the rules engine and the ratchet as a complement to the diff, not as the pitch.
3. Do not claim layering enforcement as a unique feature (`landscape.md` section 5, "Do not claim").
4. The agent angle stays after the M3 gate (ADR 0009). Add a small test first: put about ten structural questions to a coding agent on a real repository with and without the graph file, and compare answers and tokens. Proposed backlog task, not yet created.

## 8. Open questions

1. Is rare adoption of rule tools a sign of low demand or of an unserved need? Only conversations with developers can answer; ADR 0009 defers them.
2. Do dependency-cruiser's baseline features overlap with the ratchet? Not checked.
3. Are any of the small agent MCP servers framework-aware? Not checked.
