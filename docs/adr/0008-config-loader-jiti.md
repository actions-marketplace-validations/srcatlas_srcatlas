# ADR 0008: Load `srcatlas.config.ts` with jiti

- Status: Accepted
- Date: 2026-10-12
- Deciders: Tunya

## Context
ADR 0006 makes the configuration an executable TypeScript file and leaves the loader open: `jiti`, `c12` or `unconfig`, judged on Windows support, ESM and CJS handling, install size and maintenance (`docs/config.md` section 6, question 1).

srcatlas needs little from a loader: find one known file (`srcatlas.config.ts` and its `.mts`/`.js` variants), execute it, return the default export to Zod. It does not need rc files, `package.json` fields, `.env` loading, `extends`, remote config or watch mode.

Facts below were measured on 2026-10-12 (npm registry, GitHub, and a local test on Windows 11 with Node 24):

| | jiti | unconfig | c12 |
|---|---|---|---|
| Version | 2.7.0 (released 2026-05-05) | 7.5.0 (2026-02-14) | 4.0.0-rc.2 (2026-09-22); stable line is 3.3.4 |
| Role | The TypeScript/ESM executor itself | Config discovery on top of jiti | Config discovery, merging, `.env`, `extends` on top of jiti |
| Depends on jiti | n/a | Yes, as a dependency | 3.x: dependency. 4.x: optional peer, so a TS config needs jiti installed too |
| Install size in a clean `npm install` | 1.7 MB, 1 package | 1.9 MB, 6 packages | 4.x: 0.6 MB, 8 packages (+ jiti 1.7 MB for TS). 3.x: 3.1 MB, 15 packages |
| Repository activity | pushed 2026-10-12; 53 open issues | pushed 2026-10-12; 7 open issues | pushed 2026-10-10; 21 open issues |
| Windows issues (GitHub search, "windows" in title or body) | 8 total, 1 open (stack traces do not normalise Windows paths) | 2 total, 0 open | 3 total, 0 open |
| Loaded a TS config with a relative `.ts` import and a CJS `require` config, on Windows from a different working directory | Yes | Yes | Yes (4.0.0-rc.2 with jiti, and 3.3.4) |
| Licence | MIT | MIT | MIT |

Limits of this evidence: one Windows machine, one Node version (24), two tiny configs, no macOS or Linux run, no timing comparison worth quoting (first-run caches distort it). The Windows-issue counts are keyword searches, not a review of the issues. jiti documents ESM/CJS interop (`interopDefault`) and states Node 20+ for its global hook; its README does not mention Windows.

## Decision
We will load the config with `jiti` directly, through `createJiti(...).import(path, { default: true })`, and write the few lines of file discovery ourselves. `c12` and `unconfig` both execute the file with jiti; their added features are ones srcatlas does not use. jiti is pinned to an exact version and run with its filesystem cache disabled, so loading the config writes nothing into the analysed repository (to be verified in M0).

## Alternatives considered
| Option | Why not |
|---|---|
| `unconfig` | Adds multi-source config discovery and 4 more packages beyond jiti (top-level count), for logic that is about ten lines here. A reasonable fallback. |
| `c12` | The stable 3.x line pulls 15 packages (file watching, `.env`, template download) and 4.x is a release candidate that needs jiti installed anyway. Its merging and `extends` are out of scope (`docs/config.md`). |
| Node's native type stripping | Not available on every supported Node 20 version, and does not resolve extensionless imports. Revisit when the minimum Node version allows it (see below). |
| `ts-node` | Already rejected in ADR 0006. |

## Consequences
- Good: one runtime dependency with no transitive dependencies; the smallest surface to audit; the loader is the same engine the alternatives would use.
- Good: ESM and CJS config files and relative TypeScript imports worked in the Windows test.
- Bad: we own file discovery and error messages for a missing or throwing config.
- Bad: jiti is about 1.7 MB unpacked, larger than `c12` 4.x alone.
- Bad: the config still runs arbitrary code (ADR 0006); this decision does not change that.
- Needs work in M0: a test that loads a config on Linux, macOS and Windows in CI (CLAUDE.md section 8), and a check that the cache is really off.
- New dependency (CLAUDE.md section 1, item 7): `jiti`, justified above. The maintainer approved adding it on 2026-10-12; it is added when the CLI package is scaffolded in M0.

## Revisit when
- CI shows a platform-specific jiti failure on Windows, macOS or Linux.
- jiti has no release for 12 months while its issues grow.
- The minimum supported Node version ships stable native TypeScript loading that handles our config shape.
- srcatlas needs `extends`, rc files or `.env` support, at which point `c12` becomes worth its weight.
