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
  exclude: ['**/*.spec.ts', '**/__mocks__/**'],
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

Default excludes (always applied): `**/node_modules/**`, `**/dist/**`, `**/build/**`, `**/.next/**`, `**/coverage/**`, `**/*.d.ts`, `**/.srcatlas/**`. Test files are *not* excluded by default; add them with `exclude` if tests contain framework decorators that create decoys.

### 2.2 `PackageConfig`

| Option | Type | Default | Meaning |
|---|---|---|---|
| `path` | `string` | required | Directory containing `package.json`, relative to the root. |
| `name` | `string` | `name` from its `package.json`, scope removed | Used in node IDs (`provider:<name>/OrdersService`). Must be unique across packages; duplicates are a config error. Valid characters are those allowed by schema ID rules. |
| `tsconfig` | `string` | `tsconfig.json` in the package, else `tsconfig.base.json` at root | The TypeScript project used for type resolution. |
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

### 2.4 `rules` (P1)

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

Violation output (stable shape, used by `check --format json`):

```json
{ "rule": "controllers-not-direct-db", "severity": "error", "message": "Controllers must go through a service.", "from": "controller:api/OrdersController", "to": "model:api/Order", "edgeKind": "reads", "sites": [{ "file": "src/orders/orders.controller.ts", "line": 21 }] }
```

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

1. Config loader: use `jiti`, `c12`, or `unconfig`? Decide in an ADR; criteria are Windows support, ESM/CJS handling, and dependency size.
2. `annotations` edges with confidence `certain`: the schema has no "declared by user" level. Proposal: keep `certain`, mark with `extractor: "config"`. Add to `docs/schema.md` open questions before M2.
3. In-code `// srcatlas: ignore` / `// srcatlas: edge ...` comments (spec 6.2). Cost: a second parse path and ambiguity with decoys. Proposal: post-launch, only after config annotations prove insufficient.
4. `rules.except` matches by ID, which breaks on renames. Is a glob form needed? Proposal: no in v1.
5. Monorepo path aliases: `tsconfig.paths` is honoured through the TypeScript program. Package-level `exports` maps in workspace dependencies need a test fixture (`nest-monorepo`) to confirm.
6. Should rules be loadable from a separate file (`srcatlas.rules.ts`) for large rule sets? Proposal: no, one file until users ask.
