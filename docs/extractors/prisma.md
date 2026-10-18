# Prisma extractor: pattern catalogue

Status: draft for review (milestone M1 for P0 items). Package: `packages/extractor-prisma`.

This document defines **what the extractor must emit for each Prisma construct**. It is the specification the fixtures are written from. Output shapes follow `docs/schema.md`; read that first. The NestJS side of the same code is in `docs/extractors/nestjs.md`.

Each pattern has an ID (`PR-<group><number>`), a priority and a snippet, followed by the expected graph elements. A pattern is done when its fixture exists, the golden file matches, and any report codes it lists are produced.

Priorities: **P0** = needed for the first release. **P1** = planned for the first release if time allows. **P2** = after launch.

Items marked *proposed* are design choices that this draft makes so that the catalogue is complete. They are listed again in section 8 and need a decision before the code is written.

## 1. Conventions

### 1.1 Shorthand in this document

- Package is `api` in every example, so `model:api/Order` is the model `Order` in package `api`.
- Expected output lists only the elements the pattern is about. The `package:api` node and unrelated nodes are omitted.
- "Delegate" means the property on a Prisma client that carries a model's operations, such as `order` in `prisma.order.findMany()`.

### 1.2 What the extractor produces

The extractor has two parts.

1. **Schema part.** Reads Prisma schema files and emits `model` nodes (section 4.1).
2. **Client part.** Reads TypeScript and finds calls of the form `<client>.<delegate>.<operation>(...)` (section 4.2). It does not emit edges directly. It emits **access facts**, and the link pass turns them into `reads` and `writes` edges (section 3). *Proposed.* The reason is that the node that makes the call belongs to another extractor (NestJS), and the model it touches may be in another package.

Access facts are an internal interface between the extractor and the analyzer. They are not part of the graph file.

### 1.3 Hard rules

1. **The client is matched by import origin, not by name.** An expression is a Prisma client only if its declaration resolves to `PrismaClient` imported from `@prisma/client` (or from the `output` path of a `generator` block in the schema), or to a class that extends it. A local class called `PrismaClient`, or an object called `prisma`, must not produce output unless the name-based fallback in PR-C5 applies. Every fixture set includes decoys for this.
2. **Names are a fallback, never a proof.** Name-based matching (`clientNames` in `docs/config.md` section 2.3) applies only when the receiver's type cannot be resolved, and the result is `inferred`.
3. **No code execution.** The extractor never runs `prisma generate`, never loads the Prisma engines and never connects to a database. It reads text and types only.
4. **Never guess a model.** A delegate that matches no model in a visible schema produces no edge and a report entry.
5. **Test and build files** are excluded by default and follow the `include`, `exclude` and `analysis.includeTests` settings in `docs/config.md` sections 2.1 and 2.7.
6. **Stable ordering is the core's job.** The extractor emits in any order; `packages/core` sorts.

### 1.4 Detection

- **Schema part:** runs for a package when its `package.json` lists `prisma` or `@prisma/client` in `dependencies`, `devDependencies` or `peerDependencies`, or when `extractors: ['prisma']` is configured. It looks for schema files at the `schema` setting (default `prisma/schema.prisma` and `prisma/schema/*.prisma`, relative to the package).
- **Client part:** runs on the same packages. In a monorepo where the schema lives in a shared package (for example `packages/db`) and the application only imports that package, the client part also runs on a package that has a direct workspace dependency on a package the schema part ran on (P1, fixture `prisma-monorepo`).

## 2. Schema reading

The extractor reads `.prisma` files with a small purpose-built parser in the package, with no new dependency. *Proposed.* The parser recognises top-level blocks (`model`, `enum`, `type`, `view`, `datasource`, `generator`) and counts the field lines inside `model` blocks.

Rules:
- Comments (`//` and `///`) and string literals are skipped before blocks are recognised, so a commented-out `model` or a brace inside a string produces nothing (PR-S7).
- Only the block name and the lines it spans matter. Field types, attributes, defaults and relations are not interpreted in v1 (see section 7).
- A block that cannot be delimited (unbalanced braces) is skipped and reported (PR-S5). Blocks before and after it are still read.
- Files are read in code-unit order of their repository-relative path. Order never affects the output, because the core sorts, but it decides which of two duplicate models is kept (PR-S6).

## 3. Resolving an access fact

An access fact records one observed call:

| Field | Meaning |
|---|---|
| `callerFile`, `callerName` | File and name of the class that contains the call (for Next.js, the function; PR-C12) |
| `delegate` | The property name, such as `order` |
| `operation` | The method name, such as `findMany` |
| `site` | File and line of the call |
| `proof` | `type` (the client was proven by import origin) or `name` (matched by `clientNames`) |

The link pass resolves a fact in this order:

1. **Caller.** Find the node whose `source.file` equals `callerFile` and whose `name` equals `callerName`, among nodes of kind `provider`, `controller`, `gateway`, `route` or `action`. If there is none, drop the fact and count it in the report summary (`prisma.access-outside-node`, info).
2. **Model.** Find the model whose name, with the first letter lower-cased, equals `delegate`. Search the schemas visible to the caller's package: its own, then those of packages it directly depends on. If no model matches, emit nothing and report `prisma.unknown-model-access`. If several match, use all of them, mark each edge `inferred` and report `prisma.ambiguous-model`.
3. **Kind.** Classify `operation` with the table in PR-C2. `reads` or `writes`. An operation not in the table produces nothing and is reported `prisma.unknown-operation`.
4. **Confidence.** `certain` when `proof` is `type` and the model was found uniquely. Otherwise `inferred`.
5. **Merge.** Facts with the same caller, model and kind become one edge. Sites accumulate; `meta.operations` is the sorted, de-duplicated list of operation names (schema section 6).

## 4. Patterns

### 4.1 Schema (group S)

#### PR-S1 Model block (P0)

```prisma
model Order {
  id        Int      @id @default(autoincrement())
  total     Decimal
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id])
  userId    Int

  @@index([userId])
}
```

Expected:
- Node `model:api/Order`, `framework: "prisma"`, `language: "prisma"`, `extractor: "prisma"`, `confidence: certain`, `module: null`.
- `source`: the schema file and the line of the `model Order {` header.
- `meta.fieldCount = 5`, `meta.schemaFile` = the schema file.

`fieldCount` counts field lines, including relation fields. It does not count block attributes (`@@...`), comments or blank lines. *Proposed.*

#### PR-S2 Multi-file schema (P0)

Models spread over `prisma/schema/orders.prisma` and `prisma/schema/users.prisma`.

Expected: every model gets its own `source.file` and `meta.schemaFile`. The `datasource` and `generator` blocks may be in any one file.

#### PR-S3 Mapped names (P0)

```prisma
model Order {
  id Int @id
  @@map("orders")
}
```

Expected: the ID uses the model name, not the table name: `model:api/Order`. The table name is not emitted in v1.

#### PR-S4 Other blocks (P0)

`enum`, `type` (composite type), `view`, `datasource` and `generator` blocks produce no node in v1. Enums and relation targets are parsed only far enough to skip them correctly. The `generator` block's `output` value is read for PR-C1 origin matching.

#### PR-S5 Malformed block (P0)

A `model` whose braces are unbalanced, or a file that ends inside a block.

Expected: that block produces nothing. Report `prisma.schema-parse-error` (error) with the site of the block header. Other blocks in the same and other files are still read.

#### PR-S6 Duplicate model name (P0)

Two files each declare `model Order`.

Expected: one node, from the file that sorts first by code-unit order. Report `prisma.duplicate-model` (error) with the site of the one that was dropped.

#### PR-S7 Comments and strings (P0)

```prisma
// model Ghost {
/// model Phantom { }
model Real {
  id   Int    @id
  note String @default("} model Fake {")
}
```

Expected: only `model:api/Real`, `fieldCount = 2`. Nothing for `Ghost`, `Phantom` or `Fake`.

### 4.2 Client usage (group C)

#### PR-C1 Delegate call through a proven client (P0)

```ts
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient {}

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}
  findAll() { return this.prisma.order.findMany(); }
}
```

Expected: an access fact with `delegate = "order"`, `operation = "findMany"`, `proof = type`. After linking: edge `reads` from `provider:api/OrdersService` to `model:api/Order`, `meta.operations = ["findMany"]`, `confidence: certain`, `extractor: "prisma"`.

Proof of a client, any one of:
1. The receiver's declared type is `PrismaClient` imported from `@prisma/client`, or from the generator `output` path.
2. The receiver's declared type is a class that extends such a class (here `PrismaService`), directly or through further base classes in the repository.
3. The receiver is a variable initialised with `new PrismaClient(...)`, or with `x ?? new PrismaClient(...)` (the common singleton form), where `PrismaClient` has an origin as in 1.
4. The receiver is the first parameter of a callback passed to `$transaction` on a proven client (PR-C3).

Whether the type checker can prove 1 and 2 when `prisma generate` has not been run is open question 4. The syntactic forms in 3 and 4 do not depend on it.

The NestJS side is unchanged: `OrdersService` keeps its `injects` edge to `PrismaService`, and there is no `calls` edge to it (schema section 6.1, N-C5).

#### PR-C2 Operation classification (P0)

| Edge kind | Operations |
|---|---|
| `reads` | `findUnique`, `findUniqueOrThrow`, `findFirst`, `findFirstOrThrow`, `findMany`, `count`, `aggregate`, `groupBy` |
| `writes` | `create`, `createMany`, `createManyAndReturn`, `update`, `updateMany`, `updateManyAndReturn`, `upsert`, `delete`, `deleteMany` |

`upsert` is a write. A caller that both reads and writes the same model gets two edges, one of each kind, as in the schema worked example.

An operation name that is not in the table is not guessed: no edge, and `prisma.unknown-operation` (info). New Prisma operations are added to the table with a fixture.

#### PR-C3 Transactions (P0)

```ts
await this.prisma.$transaction(async (tx) => {
  await tx.order.create({ data });
  await tx.payment.create({ data });
});
await this.prisma.$transaction([this.prisma.order.update(a), this.prisma.payment.update(b)]);
```

Expected: `writes` edges to `Order` and `Payment`. In the callback form `tx` is proven because it is the first parameter of a callback passed to `$transaction` on a proven client. In the array form the calls are ordinary calls (PR-C1). `confidence: certain`.

#### PR-C4 Client singleton module (P0)

```ts
// lib/prisma.ts
export const prisma = globalForPrisma.prisma ?? new PrismaClient();
// orders.service.ts
import { prisma } from './lib/prisma';
prisma.order.findMany();
```

Expected: `reads` edge, proof as in PR-C1 rule 3. The import is followed through the type checker's alias resolution.

#### PR-C5 Name-based fallback (P0)

```ts
constructor(private readonly db: any) {}
this.db.order.findMany();
```

Expected: when the receiver's type is `any` or cannot be resolved, and the identifier is in `clientNames` (default `prisma`, `prismaService`, `db`), the fact has `proof = name` and the edge is `inferred`. If the identifier is not in `clientNames`, nothing. If the type resolves to something that is not a Prisma client, nothing, whatever the name.

#### PR-C6 Raw queries and client methods (P0)

```ts
this.prisma.$queryRaw`SELECT * FROM "Order"`;
this.prisma.$executeRawUnsafe(sql);
this.prisma.$connect();
```

Expected: no edge. For `$queryRaw`, `$queryRawUnsafe`, `$executeRaw` and `$executeRawUnsafe`, report `prisma.raw-query` (info) with the call site. The SQL is not parsed. Members starting with `$` are client methods, never delegates.

#### PR-C7 Dynamic model access (P0)

```ts
this.prisma[modelName].findMany();
```

Expected: no edge. Report `prisma.dynamic-model-access` (warning). A string literal or an `as const` constant is evaluated and treated as a normal delegate: `this.prisma['order']` is `order`.

#### PR-C8 Caller attribution (P0)

The caller is the class that contains the call. A call in a method of `OrdersService` is attributed to `provider:api/OrdersService`. A call in a class that has no node (not registered, not a controller) is dropped and counted (`prisma.access-outside-node`, info). Calls in top-level code or in standalone functions are handled the same way until PR-C12.

The graph records one hop, class to model. If a controller calls `OrdersService` and the service reads the model, the controller has a `calls` edge (NestJS) and no `reads` edge. This is what makes the rule "controllers must not touch models directly" (`docs/config.md` section 2.4) mean something.

#### PR-C9 Delegate alias (P1)

```ts
const orders = this.prisma.order;
return orders.findMany();
```

Expected: when a single `const` in the same function holds a delegate of a proven client, calls on it count as in PR-C1. Anything more indirect (passed as an argument, stored in a field, returned) is not followed.

#### PR-C10 Related models, nested writes and `include` (P2, documented limit)

```ts
this.prisma.user.create({ data: { orders: { create: [{ total: 1 }] } } });
this.prisma.user.findMany({ include: { orders: true } });
```

Not followed in v1. Only the top-level model (`User`) gets an edge. The related model (`Order`) is read or written too, so recall for these is lower. Printed with the accuracy number as a known limit.

#### PR-C11 Client extensions (P2, documented limit)

A client built with `$extends`, or a type that wraps the client in a way the extractor cannot see through, is not proven. The name-based fallback (PR-C5) applies if the receiver's type cannot be resolved. Otherwise nothing.

#### PR-C12 Next.js callers (P1, with the Next.js extractor)

A direct call inside a server action (`action:web/app/orders/actions#createOrder`), a route handler (`route:web/GET /api/orders`) or a page server component (`route:web/PAGE /orders`) is attributed to that node. Specified here so the fact format is shared; implemented with the Next.js extractor (not committed, see ADR 0009).

#### PR-C13 Several schemas or clients (P2)

A repository with two schemas, each with its own generator `output`. A receiver is matched to the schema whose `output` equals the origin of its `PrismaClient`. If that cannot be decided, edges go to every candidate as `inferred` with `prisma.ambiguous-model`.

## 5. Report codes

| Code | Level | Raised by |
|---|---|---|
| `prisma.schema-parse-error` | error | PR-S5 |
| `prisma.duplicate-model` | error | PR-S6 |
| `prisma.no-schema-found` | info | A package has access facts but sees no schema; raised once per package by the link pass |
| `prisma.unknown-model-access` | warning | Section 3 step 2 |
| `prisma.ambiguous-model` | warning | Section 3 step 2, PR-C13 |
| `prisma.unknown-operation` | info | PR-C2 |
| `prisma.raw-query` | info | PR-C6 |
| `prisma.dynamic-model-access` | warning | PR-C7 |
| `prisma.access-outside-node` | info | Section 3 step 1, PR-C8 |

Codes are stable. Changing a code's meaning needs an ADR. New codes may be added.

## 6. Fixture plan

Each fixture is a small, self-contained application under `fixtures/<name>/` with its own `package.json`, plus `expected.graph.json` and `expected.report.json` (codes, levels and sites only, no timings). The client fixtures use a minimal NestJS app so that the callers have nodes.

**Anti-hard-coding rules** are the same as in `docs/extractors/nestjs.md` section 6: no two fixtures share class or model names; every fixture contains at least one decoy; golden files are written by hand from this document before the extractor exists and are never regenerated from extractor output.

| Fixture | Patterns covered | Decoys | Priority | Milestone |
|---|---|---|---|---|
| `prisma-schema` | PR-S1, PR-S2, PR-S3, PR-S4, PR-S7 | A commented-out model; braces inside a default string; an `enum` and a `type` block that must produce no node | P0 | M1 |
| `prisma-schema-errors` | PR-S5, PR-S6 | A well-formed model next to the broken one, which must still be emitted | P0 | M1 |
| `prisma-client` | PR-C1, PR-C2, PR-C3, PR-C4, PR-C6, PR-C7, PR-C8 | See next row | P0 | M1 |
| `prisma-client-decoys` | PR-C5 and origin matching | A local `class PrismaClient {}` not from `@prisma/client`; an object literal named `prisma` with its own `order.findMany`; `db.query.users.findMany()` (the client is not the direct receiver of the delegate); a TypeORM-style `orderRepo.findMany()`. Expected output: models only, no `reads` or `writes` | P0 | M1 |
| `prisma-alias` | PR-C9 | An alias passed to a function (not followed) | P1 | M2 |
| `prisma-monorepo` | Schema in `packages/db`, application in `apps/api` with a workspace dependency (section 1.4, section 3 step 2) | A second package with a same-named model, which must give `prisma.ambiguous-model` | P1 | M2 |

The Next.js fixtures (PR-C12) are added with the Next.js extractor.

## 7. Out of scope for v1

Relations and enums as graph elements; field-level access (which fields a call reads or writes); nested writes and relation loading (PR-C10); the SQL inside raw queries; table, column and index names; migrations; client extensions (PR-C11); other ORMs and query builders (TypeORM, Drizzle, Mongoose, MikroORM, Kysely). Each is a candidate for a later pattern group or its own extractor.

## 8. Open questions

Record answers as decisions in `docs/adr/`.

1. **Access facts and caller identity.** Decided in ADR 0011 (proposed): extractors emit facts, the link pass builds the edges; `extractor-prisma` exports the resolver. Original question: The caller node belongs to another extractor and the model may be in another package. The proposal is that extractors emit access facts and the link pass builds the edges. This interface is not defined anywhere yet. Decide before the extractor runner interface is built (backlog M1, "worker pool and extractor runner interface"), and record it in an ADR. The graph file does not change.
2. **Relations and enums.** The backlog issue "prisma extractor: models, relations, enums" says more than schema v1 supports: there is no enum node and no model-to-model edge. Options: (a) an additive `relates_to` edge kind between models, which is a schema change (schema section 12 allows it without a version bump, but `docs/schema.md` and the Zod schema must change together); (b) prefixed `meta` keys; (c) leave them out. This draft does (c). The backlog title should be corrected either way.
3. **Hand-written schema parser or a library.** The proposal is a small parser (section 2). Reasons: the data needed is tiny, line numbers come for free, there is no new runtime dependency (CLAUDE.md section 1.7), and the declared oracle for Prisma models (`docs/accuracy.md` section 2) uses the official parser, so the extractor should not share it. Revisit if the parser proves fragile on real schemas.
4. **Proof without `prisma generate`.** Can the type checker prove that a receiver is a `PrismaClient` (PR-C1 rules 1 and 2) when `@prisma/client` is installed but its client has not been generated, or is not installed at all? If not, rule 3 and the name-based fallback carry more of the load. Check in the DI spike or the first real-repository run. Also check how the generator `output` option changes where `PrismaClient` is imported from in current Prisma versions.
5. **Views.** Prisma `view` blocks can be queried like models. Should they be `model` nodes? This draft says no (PR-S4), so access to a view gives `prisma.unknown-model-access`.
6. **Name of the delegate.** The rule "model name with the first letter lower-cased" matches how Prisma names client properties as far as this draft's author knows. Confirm against a generated client in the first fixture run before relying on it.
7. PR-S5: a block whose header is followed by another block header before its braces close is unterminated: it is reported at its own header and skipped, and the next header starts a new block. A block that is still open at the end of the file is reported the same way. This applies to every block kind, not only `model`. A block opened and closed on its header line (`model A { id Int }`) is reported too, because the field lines cannot be counted without guessing.
8. PR-S6: duplicates are detected across all schema files of one package. The same model name in two packages is not a duplicate (IDs differ by package).
9. Section 1.4: v1 reads only the default schema locations (`prisma/schema.prisma`, `prisma/schema/*.prisma` directly under the package root). The `schema` setting of `docs/config.md` is not read yet, because the extractor context carries no package config.
