# srcatlas: configuration reference (design)

Status: draft 1, 2026-10-09. Contract for config loading in `packages/cli` and the shapes validated in `packages/core`. CLI behaviour is in `docs/cli.md`.

## 1. File and loading

- Name: `srcatlas.config.ts` in the repository root. Also accepted: `.mts`, `.js`, `.mjs`. JSON is not supported (rules and globs benefit from comments and types).
- Export: default export of `defineConfig({...})`. `defineConfig` is an identity function with types, exported from `srcatlas`.
- Loading: the file is executed once at start (TypeScript transpiled on the fly) and its default export is validated with Zod. Executing the config has the same trust level as any build config (`vite.config.ts`). The analyser never executes the repository's application code.
- Validation: unknown keys are errors (typos should not pass silently). Errors list the path, e.g. `rules[2].to.module: expected string`. Exit code 2.
- No config is valid. Defaults and auto-detection apply (section 3).
- Config hash: a stable hash of the resolved config (after defaults) is part of the diff cache key. Changing config invalidates cached graphs.

Minimal example:

```ts
import { defineConfig } from 'srcatlas';

export default defineConfig({
  packages: ['apps/api', 'apps/web'],
});
```

Fuller example:

```ts
import { defineConfig } from 'srcatlas';

export default defineConfig({
  repository: 'github.com/acme/shop',
  packages: [
    { path: 'apps/api', name: 'api', extractors: ['nestjs', 'prisma'] },
    { path: 'apps/web', name: 'web', extractors: ['nextjs'] },
  ],
  exclude: ['**/__mocks__/**', 'src/generated/**'],
  extractors: {
    nestjs: { globalPrefix: 'api', versioning: { type: 'uri', defaultVersion: '1' } },
  },
  rules: [
    {
      id: 'controllers-not-direct-db',
      severity: 'error',
      type: 'forbidden-edge',
      from: { kind: 'controller' },
      to: { kind: 'model' },
      edgeKinds: ['reads', 'writes'],
      message: 'Controllers must go through a service.',
    },
    { id: 'no-module-cycles', severity: 'error', type: 'no-cycles', over: 'modules' },
  ],
  embed: { scope: 'all', output: 'docs/architecture.svg', theme: 'auto' },
});
```

## 2. Options

Types are shown in TypeScript notation. "Default" is what applies when the option is omitted.

### 2.1 Top level

| Option | Type | Default | Meaning |
|---|---|---|---|
| `repository` | `string` | from `git remote origin` | `host/owner/name`, used to build source links in the viewer and PR comment. |
| `defaultBranch` | `string` | from git, else `main` | Used by the Action for baseline lookup and embed commits. |
| `outDir` | `string` | `.srcatlas` | Directory for graph, report, diff and cache. |
| `packages` | `Array<string \| PackageConfig>` | auto-detected | Packages to analyse. A string is a path relative to the root. |
| `include` | `string[]` (globs) | `['**/*.ts', '**/*.tsx', '**/*.prisma']` | Files considered, relative to each package. |
| `exclude` | `string[]` (globs) | see below | Files ignored. Added to the defaults, not replacing them. |
| `extractors` | `Record<string, object>` | `{}` | Per-extractor options (section 2.3). |
| `rules` | `Rule[]` | `[]` | Architecture rules for `check` (section 2.4). P1. |
| `annotations` | `Annotations` | none | Manual nodes and edges (section 2.5). P1. |
| `embed` | `EmbedConfig` | none | README embed settings (section 2.6). |
| `analysis` | `AnalysisConfig` | defaults | Performance and strictness (section 2.7). |

Default excludes (always applied): `**/node_modules/**`, `**/dist/**`, `**/build/**`, `**/.next/**`, `**/coverage/**`, `**/*.d.ts`, `**/.srcatlas/**`. Test files are also excluded by default: `**/*.spec.ts`, `**/*.spec.tsx`, `**/*.test.ts`, `**/*.test.tsx`, `**/__tests__/**`. Mock classes and fixtures in tests carry framework decorators and would create nodes that are not part of the application. Set `analysis.includeTests: true` to analyse them (section 2.7).

### 2.2 `PackageConfig`

| Option | Type | Default | Meaning |
|---|---|---|---|
| `path` | `string` | required | Directory containing `package.json`, relative to the root. |
| `name` | `string` | `name` from its `package.json`, scope kept (`@acme/api`), else the directory name | Used in node IDs (`provider:<name>/OrdersService`). Must be unique across packages; duplicates are a config error. Valid characters are those allowed by schema ID rules. |
| `tsconfig` | `string` | `tsconfig.json` in the package, else `tsconfig.base.json` at root | The TypeScript project used for type resolution. Relative to the repository root, like `path`. |
| `extractors` | `string[]` | auto-detected by dependencies | Extractors to run on this package. Names: `nestjs`, `prisma`, `nextjs` (v1); `bullmq`, `socketio` (P1). |
| `include` / `exclude` | `string[]` | inherit top level | Per-package overrides. `exclude` adds to the inherited list. |

Auto-detection (when `packages` is omitted): workspaces from `pnpm-workspace.yaml` or `package.json#workspaces`; otherwise the root is the single package. A package with no recognised framework dependency gets no extractors and produces only a `package` node plus the import-graph fallback.

### 2.3 `extractors`

Options that the analyser cannot always infer statically. Every key is optional. Unknown extractor names are errors.

#### `extractors.nestjs`

| Option | Type | Default | Meaning |
|---|---|---|---|
| `globalPrefix` | `string` | detected from `setGlobalPrefix(...)` | Fallback when `setGlobalPrefix` is not statically resolvable (computed or read from env). Used only if detection fails; the route gets confidence `inferred`. |
| `globalPrefixExclude` | `string[]` | detected | Same, for the `exclude` option of `setGlobalPrefix`. |
| `versioning` | `{ type: 'uri' \| 'header' \| 'media-type' \| 'custom'; prefix?: string; defaultVersion?: string }` | detected from `enableVersioning(...)` | Fallback for versioning that cannot be resolved. Only `uri` changes route paths. |
| `entryFiles` | `string[]` | files calling `NestFactory.create` | Bootstrap files, where global prefix and versioning are read. Set when bootstrap lives in an unusual place. |

These map to the report codes and patterns in `docs/extractors/nestjs.md`. Config values never override a successfully detected value; they only fill gaps.

#### `extractors.prisma`

| Option | Type | Default | Meaning |
|---|---|---|---|
| `schema` | `string \| string[]` | `prisma/schema.prisma`, `prisma/schema/*.prisma` | Schema file locations (multi-file schemas supported). |
| `clientNames` | `string[]` | `['prisma', 'prismaService', 'db']` plus injected `PrismaClient` subclasses | Identifiers treated as Prisma clients when type resolution cannot prove it. Matching by type is preferred; names only apply when the type is `any` or unresolved, with confidence `inferred`. |

#### `extractors.nextjs`

| Option | Type | Default | Meaning |
|---|---|---|---|
| `appDir` | `string` | `app` or `src/app` | App Router root. |
| `basePath` | `string` | from `next.config.*` if statically readable | Prefix for all routes. |

Extractor options for BullMQ and Socket.IO are defined with their extractor docs (P1).

### 2.4 `rules` (P0)

Each rule has `id` (unique, kebab-case), `severity` (`'error' | 'warn'`, default `'error'`), optional `message`, optional `minConfidence` (default `'inferred'`: `unresolved` elements never cause violations), and a `type`.

Selector shape used by several rules:

```ts
type Selector = {
  kind?: NodeKind | NodeKind[];     // 'controller', 'provider', 'model', ...
  package?: string;                 // glob against package name
  module?: string;                  // glob against module node name, e.g. 'Orders*'
  file?: string;                    // glob against source.file
  role?: string;                    // provider meta.role, e.g. 'service'
};
```

| `type` | Fields | Violation when |
|---|---|---|
| `forbidden-edge` | `from: Selector`, `to: Selector`, `edgeKinds?: EdgeKind[]` (default: all) | An edge exists from a matching node to a matching node with one of the kinds. |
| `no-cycles` | `over: 'modules' \| 'packages'` | The head graph has a cycle over `imports` edges between modules (or `depends_on` between packages). One violation per strongly connected component. |
| `max-fan-out` | `of: Selector`, `edgeKinds: EdgeKind[]`, `max: number` | A matching node has more than `max` outgoing edges of the listed kinds. |
| `layering` | `layers: Selector[]` (top to bottom), `allowSkip?: boolean` (default `true`) | An edge goes from a lower layer to a higher layer. With `allowSkip: false`, an edge may only go to the next layer. Applies to edges of kinds `injects`, `calls`, `imports`. |

**Selector semantics (v1).** A node matches a selector when every field that is set matches; an empty selector matches every node.

- `kind`: the node's kind is the one given, or one of the list.
- `package`: a glob against the package name (the part of the node's `package` ID after `package:`, scope kept), for example `@acme/*`.
- `module`: a glob against the name of the module node in the node's `module` field. A node with `module: null`, module nodes included, does not match when this field is set.
- `file`: a glob against `source.file`. A node without a `source` does not match when this field is set.
- `role`: equals the provider's `meta.role`. A node without that key does not match.
- Globs use picomatch syntax (`*` does not cross `/`, `**` does).

**What counts as a violation.** An element takes part only if its confidence is at least the rule's `minConfidence`. For `forbidden-edge` that covers the edge and both of its nodes. The effective level is the higher of the rule's `minConfidence` and `check --min-confidence`. Violations come out in the order of the rules in the config, then by edge (`from`, `kind`, `to`) or, for cycles, by the first member.

**`forbidden-edge`.** An `except` entry with `from`, `to` or both excuses an edge when each field it has equals the edge's endpoint ID. An entry with neither field excuses nothing. An entry is *stale* when it excused no edge that would otherwise be a violation; `check` then prints a warning (below) and the exit code is unaffected.

**`no-cycles`.** The cycles are the strongly connected components with more than one member (`docs/schema.md` 13.1). The violation has `members` (node IDs, sorted) and `over` instead of `from`, `to` and `edgeKind`, and `sites` holds the sites of the edges inside the component, sorted by file and line.

**Default messages.** `forbidden-edge`: `<from> <edgeKind> <to> is not allowed`. `no-cycles`: `cycle over <over>: <members, comma separated>`. A rule's own `message` replaces them.

**Not evaluated yet.** `max-fan-out` and `layering` pass config validation but `check` does not evaluate them in v1.0; it prints `rule <id>: type <type> is not supported yet, skipped` as a warning. Stale exceptions print `rule <id>: stale exception <entry as JSON>`.

Example, a controller must not read or write a Prisma model directly:

```ts
rules: [
  {
    id: 'controllers-not-direct-db',
    type: 'forbidden-edge',
    message: 'Controllers must go through a service.',
    from: { kind: 'controller' },
    to: { kind: 'model' },
    edgeKinds: ['reads', 'writes'],
  },
],
```

Violation output (stable shape, used by `check --format json`):

```json
{ "rule": "controllers-not-direct-db", "severity": "error", "message": "Controllers must go through a service.", "from": "controller:api/OrdersController", "to": "model:api/Order", "edgeKind": "reads", "sites": [{ "file": "src/orders/orders.controller.ts", "line": 21 }] }
```

A cycle violation: `{ "rule": "no-module-cycles", "severity": "error", "message": "...", "over": "modules", "members": ["module:api/A", "module:api/B"], "sites": [...] }`.

Rules apply to the graph only. They do not read source files. A rule cannot be disabled inline in code in v1; to allow an exception, narrow the selector or add an `except` list:

```ts
{ id: '...', type: 'forbidden-edge', from: {...}, to: {...}, except: [{ from: 'controller:api/HealthController' }] }
```

`except` entries match exact node IDs (`from`, `to`, or both). All patterns in `except` must resolve at least once, or `check` warns that the exception is stale.

### 2.5 `annotations` (P1)

For things the analyser cannot see (a provider created at runtime, a call through a dynamic dispatcher).

```ts
annotations: {
  edges: [
    { from: 'provider:api/NotificationsService', kind: 'calls', to: 'provider:api/SmsGateway', reason: 'Resolved by strategy map at runtime' },
  ],
  nodes: [],        // reserved; v1 allows edges between existing nodes only
}
```

Rules:
- Both endpoints must exist in the graph, or the annotation is reported as stale (`config.stale-annotation`) and ignored.
- Annotation edges obey the edge-kind matrix in `docs/schema.md` section 6.
- They are emitted with `extractor: "config"` and confidence `certain`, and `meta.reason` is required. The viewer marks them as manual.
- `nodes` stays empty in v1: adding nodes by hand makes diffs and IDs ambiguous.
- In-code `// srcatlas:` comments are **not** in v1 (open question 3).

### 2.6 `embed`

| Option | Type | Default | Meaning |
|---|---|---|---|
| `scope` | `'all' \| { module: string } \| { trace: string }` | `'all'` | Same as `export --scope`. `module` and `trace` take node IDs. |
| `output` | `string` | `docs/architecture.svg` | Path committed by the Action. |
| `theme` | `'light' \| 'dark' \| 'auto'` | `'auto'` | SVG theme. |
| `width` | `number` | `900` | Target width in px. |
| `badge` | `boolean \| string` | `false` | Also write a counts badge; a string sets its path (default `docs/architecture-badge.svg`). P1. |

### 2.7 `analysis`

| Option | Type | Default | Meaning |
|---|---|---|---|
| `workers` | `number` | CPU count − 1 (min 1) | Worker pool size. `--workers` overrides. |
| `strict` | `boolean` | `false` | Same as `--strict` on `analyze`. |
| `maxFileSizeKb` | `number` | `1024` | Files larger than this are skipped and reported (`core.file-too-large`). Guards against generated bundles. |
| `followSymlinks` | `boolean` | `false` | Whether to traverse symlinked directories. |
| `includeTests` | `boolean` | `false` | Analyse the test files that are excluded by default (section 2.1). |

## 3. Defaults summary and precedence

Precedence, highest first: CLI flag → environment variable → config file → built-in default.

Auto-detection never happens silently for rules or annotations; those exist only if written.

## 4. Validation behaviour (summary)

| Situation | Result |
|---|---|
| Unknown key | Error, exit 2, with the key path and the closest valid key if one is within edit distance 2. |
| Package path without `package.json` | Error, exit 2. |
| Duplicate package `name` | Error, exit 2. |
| Rule `id` duplicated | Error, exit 2. |
| `extractors` names an extractor not installed | Error, exit 2, with the install command. |
| Glob matches no files | Warning on stderr, not an error. |
| `repository` missing and no git remote | Warning. Source links omit the URL. |

## 5. Compatibility

- Config keys listed here are public from 1.0. Renaming or removing one is a major version. Adding a key is a minor version.
- The config schema ships as JSON Schema in the package (`srcatlas/config.schema.json`) so editors can validate.
- The `rules[].type` values and `Selector` fields are part of the public interface.

## 6. Open questions

1. ~~Config loader~~ Decided: `jiti`, see ADR 0008.
2. `annotations` edges with confidence `certain`: the schema has no "declared by user" level. Proposal: keep `certain`, mark with `extractor: "config"`. Add to `docs/schema.md` open questions before M2.
3. In-code `// srcatlas: ignore` / `// srcatlas: edge ...` comments (spec 6.2). Cost: a second parse path and ambiguity with decoys. Proposal: post-launch, only after config annotations prove insufficient.
4. `rules.except` matches by ID, which breaks on renames. Is a glob form needed? Proposal: no in v1.
5. Monorepo path aliases: `tsconfig.paths` is honoured through the TypeScript program. Package-level `exports` maps in workspace dependencies need a test fixture (`nest-monorepo`) to confirm.
6. Should rules be loadable from a separate file (`srcatlas.rules.ts`) for large rule sets? Proposal: no, one file until users ask.
