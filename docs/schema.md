# SrcAtlas graph schema, version 1

Status: draft for implementation. This document is the source of truth for `packages/core`. The Zod schema, the exported JSON Schema, the differ, the viewer and every extractor must match it. If code and this document disagree, fix one of them in the same pull request.

Terminology: **node** and **edge** are graph elements. **Extractor** is a component that emits nodes and edges for one framework. **Site** is a source location (file and line) where an edge was observed.

## 1. Principles

1. **Framework-neutral.** Node and edge kinds describe architecture concepts, not NestJS or Next.js concepts. Framework details go in `framework` and `meta`.
2. **Structure only.** A graph never contains source text, comments, string contents beyond identifiers and route/queue/event names, or absolute paths.
3. **Deterministic.** The same repository state and the same tool version produce byte-identical files on every operating system (section 9).
4. **Honest.** Every element carries a confidence level. Anything the analyser could not resolve is reported, never guessed (section 7).
5. **Stable identity.** IDs survive file moves and line changes where the concept itself did not change (section 5).
6. **Additive evolution.** New optional fields and new kinds can appear without a version bump. Consumers ignore what they do not know (section 12).

## 2. File format

The graph file is UTF-8 JSON, written as `srcatlas.graph.json` by default.

```ts
interface GraphFile {
  schemaVersion: 1;                       // integer, bumped only on breaking change
  generator: { name: 'srcatlas'; version: string };
  repo: { commit?: string };              // full 40-character git SHA; omitted outside git
  nodes: Node[];                          // sorted by id
  edges: Edge[];                          // sorted by from, kind, to
}
```

No timestamps, hostnames, usernames, absolute paths, timings or branch names appear anywhere in the file. Those belong in the report file (`srcatlas.report.json`, section 11).

## 3. Node

```ts
interface Node {
  id: string;                             // section 5
  kind: NodeKind;                         // section 4
  name: string;                           // display name, e.g. "OrdersService" or "GET /orders"
  language: string;                       // e.g. "typescript"
  framework: string;                      // e.g. "nestjs", "nextjs", "prisma", "bullmq"
  package: string;                        // id of the owning package node, e.g. "package:api"
  module: string | null;                  // id of the single registering module node, or null
  source: Site | null;                    // primary definition site; null for synthetic nodes
  extractor: string;                      // extractor name, e.g. "nestjs"
  confidence: Confidence;                 // section 7
  meta: Record<string, JsonValue>;        // kind-specific fields, section 4
}

interface Site { file: string; line: number }   // file: repo-root-relative, POSIX separators; line: 1-based
type Confidence = 'certain' | 'inferred' | 'unresolved';
```

Rules:

- `module` is set only when exactly one module registers the node. If several modules register it, `module` is `null` and each module has its own `contains` edge. The edges are the full truth; `module` is a convenience for grouping in the viewer.
- `package` for a package node refers to itself.
- `source` is `null` only for nodes that have no definition in the repository, such as `external` nodes.

## 4. Node kinds

| Kind | Meaning | Typical sources | Required `meta` | Optional `meta` |
| --- | --- | --- | --- | --- |
| `package` | A workspace package (or the repo root in a single-package repo) | `package.json` | `root` (repo-relative directory) | `version` |
| `module` | A logical grouping of other nodes | NestJS `@Module`; Next.js route group | `dynamic` (boolean), `global` (boolean) | `routeGroup` |
| `provider` | An injectable class or custom provider | NestJS `@Injectable`, custom providers | `providerType` (`class`, `value`, `factory`, `existing`), `scope` (`default`, `request`, `transient`), `role` (`service`, `processor`, `guard`, `interceptor`, `pipe`, `filter`, `other`) | `token` |
| `controller` | A class that handles HTTP requests | NestJS `@Controller` | `basePath` | `version` |
| `route` | One HTTP endpoint or page | NestJS handler; Next.js `route.ts`, `page.tsx` | `method` (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`, `ALL`, `PAGE`), `path`, `type` (`handler`, `page`) | `version`, `handlerName`, `guards`, `interceptors`, `pipes`, `filters` (each a sorted array of class names) |
| `action` | A server action | Next.js `"use server"` function | `exportName` | |
| `model` | A database model or table | Prisma `model` | `fieldCount` | `schemaFile` |
| `queue` | A background job queue | BullMQ `Queue`, `@Processor`, `@InjectQueue` | `name`, `library` (`bullmq`, `bull`) | |
| `gateway` | A WebSocket gateway | NestJS `@WebSocketGateway` | `namespace` | `port` |
| `event` | A named realtime event | `@SubscribeMessage`, `emit` | `namespace`, `name` | |
| `external` | A service outside the repository | Stripe SDK, S3 client, HTTP client | `name` | `via` (`sdk`, `http`) |
| `file` | A source file, used only by the fallback import-graph mode | any `.ts` file | `path` | |
| `job` | **Reserved, not emitted in v1.** A job type inside a queue | | | |

Notes:

- A BullMQ `@Processor` class is a `provider` with `meta.role = "processor"`, plus a `consumes` edge to its `queue`. There is no separate processor kind.
- Guards, interceptors, pipes and filters are not separate nodes in v1. They are recorded as class names in route `meta`. Classes that implement them are still `provider` nodes when decorated with `@Injectable`, with the matching `role`.
- `route.meta.path` is the full normalised path including global prefix and version prefix (section 5.3).
- For `meta` keys not listed in the table, an extractor may add its own, prefixed with its name (for example `nestjs.hostname`). Consumers must ignore unknown keys.

## 5. Identity

IDs are opaque strings. Compare them exactly: case-sensitive, Unicode NFC-normalised, no control characters. They are never derived from content hashes or from line numbers.

### 5.1 Format

| Kind | ID format | Example |
| --- | --- | --- |
| `package` | `package:<name>` | `package:api` |
| `module` | `module:<package>/<ClassName>` | `module:api/OrdersModule` |
| `provider` | `provider:<package>/<ClassName>` | `provider:api/OrdersService` |
| `controller` | `controller:<package>/<ClassName>` | `controller:api/OrdersController` |
| `gateway` | `gateway:<package>/<ClassName>` | `gateway:api/ChatGateway` |
| `route` | `route:<package>/<METHOD> <path>` | `route:api/GET /v1/orders/:id` |
| `action` | `action:<package>/<file without extension>#<exportName>` | `action:web/app/orders/actions#createOrder` |
| `model` | `model:<package>/<ModelName>` | `model:api/Order` |
| `queue` | `queue:<name>` | `queue:email` |
| `event` | `event:<namespace>#<name>` | `event:/#chat:send` |
| `external` | `external:<name>` | `external:stripe` |
| `file` | `file:<package>/<path>` | `file:api/src/main.ts` |

`<package>` is the package name from `package.json`, with any leading `@scope/` kept (`@acme/api`). In a repository without workspaces it is the root `package.json` name, or the repository directory name if that is missing.

Queues, events and externals are not package-scoped. Two packages that use the same queue name share one node, which is how a producer in one service links to a consumer in another.

### 5.2 Collisions

If two nodes of the same kind in the same package would get the same ID (two classes named `ConfigService` in different folders), both receive the suffix `@<directory>`, where `<directory>` is the repo-relative directory of the source file: `provider:api/ConfigService@src/legacy`. Both nodes get the suffix, not only the second one, so adding a new class never renames an existing node. This is the only case where an ID depends on a file path.

### 5.3 Route path normalisation

- Path segments joined with single `/`, one leading `/`, no trailing `/` (except the root path `/`).
- Dynamic segments use `:name`. NestJS `:id` stays as is. Next.js `[id]` becomes `:id`.
- Catch-all segments use `*name`. Next.js `[...slug]` becomes `*slug`; `[[...slug]]` becomes `*slug` with `meta.optionalCatchAll = true`. An unnamed wildcard (NestJS `files/*`) stays `*`.
- Route groups `(group)` and parallel-route slots `@slot` do not appear in paths.
- NestJS global prefix and URI version prefix are included when statically known: `/api/v1/orders`. When the prefix cannot be resolved, the route is emitted without it, `confidence` is `inferred`, and a report entry is added.
- Methods are uppercase. A Next.js page uses the method `PAGE`.

### 5.4 Renames

When a node disappears and another of the same kind and with the same `name` and `package` appears, the differ reports a **move**, not a removal plus an addition. Matching beyond that rule is not part of v1.

## 6. Edge

```ts
interface Edge {
  from: string;                           // node id
  to: string;                             // node id
  kind: EdgeKind;
  sites: Site[];                          // where observed, sorted by file then line; may be empty
  extractor: string;
  confidence: Confidence;
  meta: Record<string, JsonValue>;
}
```

Identity: an edge is identified by `(from, kind, to)`. Observing the same relation in several places yields one edge with several `sites`, not several edges. Details that vary per observation (called method names, database operations, job names) are merged into sorted, de-duplicated arrays in `meta`.

### 6.1 Edge kinds and allowed endpoints

| Kind | Meaning | From | To | `meta` |
| --- | --- | --- | --- | --- |
| `contains` | The module registers this node in its metadata | `module` | `module`, `provider`, `controller`, `gateway` | |
| `imports` | Module imports module; file imports file (fallback mode only) | `module`, `file` | same kind as `from` | |
| `exports` | Module makes a provider available to importers | `module` | `provider` | |
| `depends_on` | Package imports another workspace package | `package` | `package` | |
| `injects` | Constructor, property or token injection | `provider`, `controller`, `gateway` | `provider`, `queue` | `tokens` (sorted array of token names, when not a plain class) |
| `handles` | The controller handles this route | `controller` | `route` | |
| `calls` | A method on the target is called | `controller`, `provider`, `gateway`, `route`, `action` | `provider`, `action` | `methods` (sorted array of method names) |
| `reads` | Reads from a database model | `provider`, `controller`, `gateway`, `route`, `action` | `model` | `operations` (sorted array) |
| `writes` | Writes to a database model | same as `reads` | `model` | `operations` (sorted array) |
| `enqueues` | Adds jobs to a queue | `provider`, `controller`, `gateway`, `route`, `action` | `queue` | `jobNames` (sorted array of literal job names) |
| `consumes` | Processes jobs from a queue | `provider` | `queue` | `jobNames` (sorted array of literal job names handled) |
| `emits` | Produces a realtime event | `provider`, `controller`, `gateway`, `route`, `action` | `event` | |
| `listens` | Handles a realtime event | `gateway`, `provider` | `event` | |
| `uses_external` | Calls an outside service | `provider`, `controller`, `gateway`, `route`, `action` | `external` | |

Rules that follow from the table:

- No self-edges. Recursion and calls within one class are not modelled.
- A call that resolves to a Prisma client model operation (`this.prisma.order.findMany()`) produces `reads` or `writes` to the model and **no** `calls` edge to the Prisma client provider. The client is infrastructure, not a collaborator.
- `calls` is recorded at class granularity. A method call on an injected member produces one edge from the calling class to the class that owns the method, with the method name in `meta.methods`.
- Route containment is expressed by `node.module`, not by `contains` edges.

## 7. Confidence and provenance

| Level | Meaning | Examples |
| --- | --- | --- |
| `certain` | Derived from an explicit declaration or a resolved type | `@Controller('orders')`, constructor parameter type, `@InjectQueue('email')` |
| `inferred` | Derived by a documented heuristic | A route prefix guessed from `main.ts` when the call was only partly static; a `fetch('/api/orders')` string matched to a known route |
| `unresolved` | The element exists but its contribution is known to be incomplete | A module imported through a dynamic module method whose return value could not be followed. Its providers may be missing |

Rules:

- An element with confidence `unresolved` is still emitted so that the viewer can show that something is there. Elements that cannot be named at all (for example `emit(prefix + name)`) are **not** emitted; they appear only in the report.
- An edge is never more confident than the less confident of its endpoints, unless the edge itself was observed directly. Extractors do not need to enforce this; the link pass does.
- Provenance is `extractor` plus `sites`. Every element must have a non-empty `extractor`.

## 8. Worked example

A single-package repository `api` with an orders feature and a Prisma `Order` model. Files:

```text
src/app.module.ts                AppModule imports OrdersModule
src/orders/orders.module.ts      OrdersModule: controllers [OrdersController], providers [OrdersService], imports [PrismaModule], exports [OrdersService]
src/orders/orders.controller.ts  @Controller('orders'): @Get() findAll, @Post() create, both call OrdersService
src/orders/orders.service.ts     injects PrismaService; findAll uses prisma.order.findMany; create uses prisma.order.create
src/prisma/prisma.module.ts      PrismaModule: providers [PrismaService], exports [PrismaService]
src/prisma/prisma.service.ts     PrismaService
prisma/schema.prisma             model Order
```

```json
{
  "schemaVersion": 1,
  "generator": { "name": "srcatlas", "version": "0.1.0" },
  "repo": {},
  "nodes": [
    { "id": "controller:api/OrdersController", "kind": "controller", "name": "OrdersController", "language": "typescript", "framework": "nestjs", "package": "package:api", "module": "module:api/OrdersModule", "source": { "file": "src/orders/orders.controller.ts", "line": 6 }, "extractor": "nestjs", "confidence": "certain", "meta": { "basePath": "/orders" } },
    { "id": "model:api/Order", "kind": "model", "name": "Order", "language": "prisma", "framework": "prisma", "package": "package:api", "module": null, "source": { "file": "prisma/schema.prisma", "line": 10 }, "extractor": "prisma", "confidence": "certain", "meta": { "fieldCount": 5, "schemaFile": "prisma/schema.prisma" } },
    { "id": "module:api/AppModule", "kind": "module", "name": "AppModule", "language": "typescript", "framework": "nestjs", "package": "package:api", "module": null, "source": { "file": "src/app.module.ts", "line": 4 }, "extractor": "nestjs", "confidence": "certain", "meta": { "dynamic": false, "global": false } },
    { "id": "module:api/OrdersModule", "kind": "module", "name": "OrdersModule", "language": "typescript", "framework": "nestjs", "package": "package:api", "module": null, "source": { "file": "src/orders/orders.module.ts", "line": 8 }, "extractor": "nestjs", "confidence": "certain", "meta": { "dynamic": false, "global": false } },
    { "id": "module:api/PrismaModule", "kind": "module", "name": "PrismaModule", "language": "typescript", "framework": "nestjs", "package": "package:api", "module": null, "source": { "file": "src/prisma/prisma.module.ts", "line": 4 }, "extractor": "nestjs", "confidence": "certain", "meta": { "dynamic": false, "global": false } },
    { "id": "package:api", "kind": "package", "name": "api", "language": "typescript", "framework": "node", "package": "package:api", "module": null, "source": { "file": "package.json", "line": 1 }, "extractor": "core", "confidence": "certain", "meta": { "root": "." } },
    { "id": "provider:api/OrdersService", "kind": "provider", "name": "OrdersService", "language": "typescript", "framework": "nestjs", "package": "package:api", "module": "module:api/OrdersModule", "source": { "file": "src/orders/orders.service.ts", "line": 6 }, "extractor": "nestjs", "confidence": "certain", "meta": { "providerType": "class", "role": "service", "scope": "default" } },
    { "id": "provider:api/PrismaService", "kind": "provider", "name": "PrismaService", "language": "typescript", "framework": "nestjs", "package": "package:api", "module": "module:api/PrismaModule", "source": { "file": "src/prisma/prisma.service.ts", "line": 5 }, "extractor": "nestjs", "confidence": "certain", "meta": { "providerType": "class", "role": "service", "scope": "default" } },
    { "id": "route:api/GET /orders", "kind": "route", "name": "GET /orders", "language": "typescript", "framework": "nestjs", "package": "package:api", "module": "module:api/OrdersModule", "source": { "file": "src/orders/orders.controller.ts", "line": 12 }, "extractor": "nestjs", "confidence": "certain", "meta": { "handlerName": "findAll", "method": "GET", "path": "/orders", "type": "handler" } },
    { "id": "route:api/POST /orders", "kind": "route", "name": "POST /orders", "language": "typescript", "framework": "nestjs", "package": "package:api", "module": "module:api/OrdersModule", "source": { "file": "src/orders/orders.controller.ts", "line": 17 }, "extractor": "nestjs", "confidence": "certain", "meta": { "handlerName": "create", "method": "POST", "path": "/orders", "type": "handler" } }
  ],
  "edges": [
    { "from": "controller:api/OrdersController", "kind": "calls", "to": "provider:api/OrdersService", "sites": [{ "file": "src/orders/orders.controller.ts", "line": 13 }, { "file": "src/orders/orders.controller.ts", "line": 18 }], "extractor": "nestjs", "confidence": "certain", "meta": { "methods": ["create", "findAll"] } },
    { "from": "controller:api/OrdersController", "kind": "handles", "to": "route:api/GET /orders", "sites": [{ "file": "src/orders/orders.controller.ts", "line": 12 }], "extractor": "nestjs", "confidence": "certain", "meta": {} },
    { "from": "controller:api/OrdersController", "kind": "handles", "to": "route:api/POST /orders", "sites": [{ "file": "src/orders/orders.controller.ts", "line": 17 }], "extractor": "nestjs", "confidence": "certain", "meta": {} },
    { "from": "controller:api/OrdersController", "kind": "injects", "to": "provider:api/OrdersService", "sites": [{ "file": "src/orders/orders.controller.ts", "line": 8 }], "extractor": "nestjs", "confidence": "certain", "meta": {} },
    { "from": "module:api/AppModule", "kind": "imports", "to": "module:api/OrdersModule", "sites": [{ "file": "src/app.module.ts", "line": 5 }], "extractor": "nestjs", "confidence": "certain", "meta": {} },
    { "from": "module:api/OrdersModule", "kind": "contains", "to": "controller:api/OrdersController", "sites": [{ "file": "src/orders/orders.module.ts", "line": 9 }], "extractor": "nestjs", "confidence": "certain", "meta": {} },
    { "from": "module:api/OrdersModule", "kind": "contains", "to": "provider:api/OrdersService", "sites": [{ "file": "src/orders/orders.module.ts", "line": 10 }], "extractor": "nestjs", "confidence": "certain", "meta": {} },
    { "from": "module:api/OrdersModule", "kind": "exports", "to": "provider:api/OrdersService", "sites": [{ "file": "src/orders/orders.module.ts", "line": 12 }], "extractor": "nestjs", "confidence": "certain", "meta": {} },
    { "from": "module:api/OrdersModule", "kind": "imports", "to": "module:api/PrismaModule", "sites": [{ "file": "src/orders/orders.module.ts", "line": 11 }], "extractor": "nestjs", "confidence": "certain", "meta": {} },
    { "from": "module:api/PrismaModule", "kind": "contains", "to": "provider:api/PrismaService", "sites": [{ "file": "src/prisma/prisma.module.ts", "line": 5 }], "extractor": "nestjs", "confidence": "certain", "meta": {} },
    { "from": "module:api/PrismaModule", "kind": "exports", "to": "provider:api/PrismaService", "sites": [{ "file": "src/prisma/prisma.module.ts", "line": 6 }], "extractor": "nestjs", "confidence": "certain", "meta": {} },
    { "from": "provider:api/OrdersService", "kind": "injects", "to": "provider:api/PrismaService", "sites": [{ "file": "src/orders/orders.service.ts", "line": 8 }], "extractor": "nestjs", "confidence": "certain", "meta": {} },
    { "from": "provider:api/OrdersService", "kind": "reads", "to": "model:api/Order", "sites": [{ "file": "src/orders/orders.service.ts", "line": 11 }], "extractor": "prisma", "confidence": "certain", "meta": { "operations": ["findMany"] } },
    { "from": "provider:api/OrdersService", "kind": "writes", "to": "model:api/Order", "sites": [{ "file": "src/orders/orders.service.ts", "line": 15 }], "extractor": "prisma", "confidence": "certain", "meta": { "operations": ["create"] } }
  ]
}
```

Things to notice: the routes carry `module` although no `contains` edge points at them; `OrdersService` has no `calls` edge to `PrismaService` (rule in section 6.1); the `calls` edge has two sites but is one edge; `package:api` is a node.

## 9. Determinism rules

| Rule | Detail |
| --- | --- |
| Ordering | `nodes` sorted by `id`; `edges` sorted by `from`, then `kind`, then `to`; `sites` sorted by `file`, then `line`; arrays in `meta` sorted unless the extractor documents that order carries meaning |
| Comparison | Compare strings by UTF-16 code units (`a < b`). Never use `localeCompare` or any locale-aware sort |
| Keys | Object keys are written in code-unit order at every depth |
| Paths | Repo-root-relative, `/` separators, no leading `./`, case as on disk |
| Whitespace | 2-space indentation in the written file, `\n` line endings, one trailing newline |
| Numbers | Integers only |
| Absent values | Absent optional fields are omitted. `null` is used only where this document says so (`module`, `source`) |
| Forbidden content | Timestamps, durations, absolute paths, hostnames, usernames, environment values, branch names, random values |

The canonical writer lives in `packages/core`. Nothing else serialises graphs.

## 10. Validation invariants

The Zod schema checks structure. A second function, `validateGraph`, checks the following, and the analyser runs it before writing.

1. Every `id` is unique.
2. Every `edge.from` and `edge.to` refers to an existing node.
3. Each edge's `kind` is allowed for the kinds of its endpoints (section 6.1).
4. `node.package` refers to a `package` node. `node.module`, when set, refers to a `module` node.
5. No self-edges.
6. Required `meta` keys for the node's kind are present and have the listed types.
7. Every `source.file` is relative, uses `/` and contains no `..` segment.
8. `extractor` is a non-empty string on every node and edge.
9. Nodes and edges appear in canonical order.
10. No two edges share `(from, kind, to)`.

## 11. Companion files

| File | Purpose | Deterministic |
| --- | --- | --- |
| `srcatlas.graph.json` | The graph described here | Yes |
| `srcatlas.report.json` | Parse errors, unresolved constructs, per-extractor timings, counts | No (timings) |
| `srcatlas.diff.json` | Comparison of two graphs (section 13) | Yes |

Report entry shape:

```ts
interface ReportEntry {
  level: 'error' | 'warning' | 'info';
  code: string;                           // stable machine-readable code, e.g. "nest.unresolved-dynamic-module"
  message: string;
  extractor: string;
  site?: Site;
}
```

Report codes are catalogued in each extractor's document (for NestJS, `docs/extractors/nestjs.md`).

## 12. Compatibility policy

- `schemaVersion` is a single integer. It increases only for breaking changes: removing or renaming a field or kind, changing a required type, or changing an ID rule.
- Adding an optional field, an optional `meta` key, a new node kind or a new edge kind is **not** breaking. Consumers must ignore unknown fields and treat unknown kinds as generic nodes and edges.
- The viewer and differ read the current and the previous `schemaVersion`. A newer file than the tool supports produces an error that names the required tool version.
- Any change to this document that affects serialised output is recorded as a decision in `docs/adr/`.

## 13. Diff semantics

The differ compares two valid graphs and writes `srcatlas.diff.json`.

- **Node identity** is `id`. A node is **changed** if its `kind`, `module`, `confidence`, or any `meta` value changed. A change of `source.line` alone is not a change. A change of `source.file` is a change only if the node's ID did not change, because the node then moved within the package.
- **Edge identity** is `(from, kind, to)`. An edge is **changed** if its `meta` or `confidence` changed. Differences in `sites` are not reported as changes. The summary may show the site count.
- **Moves** follow section 5.4.
- **Cycles.** The differ computes strongly connected components over `imports` edges between modules, and over `depends_on` edges between packages, in both graphs. A cycle that exists in the head graph but not in the base graph is reported as new.
- **Cross-module edges.** An edge whose endpoints have different non-null `module` values, and which was not present in the base graph, is reported as a new cross-module dependency.

### 13.1 Diff file

`srcatlas.diff.json` is written with the same canonical rules as the graph (section 9). It holds no timestamps, paths outside the repository, or ref names.

```ts
interface DiffFile {
  schemaVersion: number;                  // of the two graphs, which must be equal
  base: { commit?: string };              // copied from graph.repo
  head: { commit?: string };
  summary: {
    modules: number;                      // added minus removed, by node kind
    routes: number;
    crossModuleEdges: number;             // crossModuleEdges.length
    newCycles: number;                    // cycles.length
  };
  nodes: {
    added: Node[];                        // sorted by id
    removed: Node[];                      // sorted by id
    changed: { before: Node; after: Node }[]; // same id; sorted by id
    moved: { from: Node; to: Node }[];    // sorted by to.id
  };
  edges: {
    added: Edge[];                        // sorted by from, kind, to
    removed: Edge[];
    changed: { before: Edge; after: Edge }[];
  };
  crossModuleEdges: Edge[];               // subset of edges.added; same order
  cycles: {                               // cycles in head that are new; sorted by kind, then members[0]
    kind: 'modules' | 'packages';
    members: string[];                    // node IDs, sorted
  }[];
}
```

- A node in `moved` appears in neither `added` nor `removed`.
- A move needs exactly one removed and exactly one added node with the same `kind`, `name` and `package`. If more than one removed or more than one added node share that triple, the differ reports none of them as moved. It does not guess.
- Edges are not rewritten for moves: edges of a moved node appear as removed (old ID) and added (new ID).
- Two graphs with different `schemaVersion` values are an error, not a diff.
- `crossModuleEdges` holds the added edges (by edge identity, so an edge that exists in base and only changed is not listed) whose two endpoints both have a non-null `module`, and those values differ. Module nodes have `module: null`, so `imports` edges between modules are never listed; the cycle check covers them.
- A cycle is a strongly connected component with more than one member. For `modules` the edges are `imports` edges whose endpoints are both `module` nodes; for `packages` they are `depends_on` edges. Other kinds, such as `imports` between `file` nodes, are ignored. A head component is **new** unless all its members lie in one component of the base graph, so a cycle that grows is new and one that shrinks or stays the same is not.

### 13.2 Summary line

The summary line is fixed: `+1 module, +4 routes, +2 cross-module edges, 0 new cycles`.

- Node counts are signed net counts (added minus removed): `+1 module`, `-2 routes`, `0 modules`. The noun is singular only for an absolute count of 1.
- `cross-module edges` is the count of new cross-module edges, signed with `+` when above zero. `new cycles` is the count of new cycles, without a sign.

## 14. Open questions

Record answers as decisions in `docs/adr/` when resolved.

1. Should `exports` edges stay P1, or be part of the first release? They are cheap to extract and make module-boundary rules possible.
2. Should a `guard`/`interceptor` become its own node kind when boundary rules need to reference them? Revisit after M4.
3. Should `job` nodes be emitted once the BullMQ extractor ships? Today job names live in edge `meta.jobNames`.
4. Should moved nodes rewrite the edges that touch them, so a moved provider does not show as removed and added edges? Section 13.1 leaves edges as they are.
