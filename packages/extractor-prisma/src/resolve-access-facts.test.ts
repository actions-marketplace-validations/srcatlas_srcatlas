import type { AccessFact, Node } from "@srcatlas/core";
import { describe, expect, it } from "vitest";
import { resolveAccessFacts } from "./resolve-access-facts.js";

// docs/extractors/prisma.md section 3: hand-written facts and nodes, no source code.

const node = (kind: Node["kind"], name: string, file = "src/a.ts"): Node => ({
  id: `${kind}:p/${name}`,
  kind,
  name,
  language: kind === "model" ? "prisma" : "typescript",
  framework: kind === "model" ? "prisma" : "nestjs",
  package: "package:p",
  module: null,
  source: { file, line: 1 },
  extractor: "x",
  confidence: "certain",
  meta: kind === "model" ? { fieldCount: 1 } : {},
});

const fact = (over: Partial<AccessFact> = {}): AccessFact => ({
  kind: "access",
  extractor: "prisma",
  package: "p",
  callerFile: "src/a.ts",
  callerName: "Svc",
  delegate: "order",
  operation: "findMany",
  site: { file: "src/a.ts", line: 7 },
  proof: "type",
  ...over,
});

const NODES = [node("provider", "Svc"), node("model", "Order")];

describe("resolveAccessFacts", () => {
  it("a read is certain when the client was proven and the model is unique", () => {
    const out = resolveAccessFacts([fact()], NODES);
    expect(out.edges).toEqual([
      expect.objectContaining({
        from: "provider:p/Svc",
        kind: "reads",
        to: "model:p/Order",
        confidence: "certain",
        meta: { operations: ["findMany"] },
      }),
    ]);
  });

  it("a name proof gives an inferred edge", () => {
    expect(
      resolveAccessFacts([fact({ proof: "name" })], NODES).edges[0]?.confidence,
    ).toBe("inferred");
  });

  it("an operation outside the table gives no edge and an info entry", () => {
    const out = resolveAccessFacts([fact({ operation: "cursor" })], NODES);
    expect(out.edges).toEqual([]);
    expect(out.report).toEqual([
      expect.objectContaining({ code: "prisma.unknown-operation" }),
    ]);
  });

  it("two models with the same delegate: both edges are inferred and reported", () => {
    const out = resolveAccessFacts(
      [fact()],
      [...NODES, node("model", "order", "prisma/other.prisma")].map((n, i) => ({
        ...n,
        id: `${n.id}${i}`,
      })),
    );
    expect(out.edges.map((e) => e.confidence)).toEqual([
      "inferred",
      "inferred",
    ]);
    expect(out.report.map((r) => r.code)).toEqual(["prisma.ambiguous-model"]);
  });

  it("a package without any model reports no-schema-found once", () => {
    const out = resolveAccessFacts(
      [fact(), fact({ site: { file: "src/a.ts", line: 9 } })],
      [node("provider", "Svc")],
    );
    expect(out.edges).toEqual([]);
    expect(out.report.map((r) => r.code)).toEqual(["prisma.no-schema-found"]);
  });

  it("a caller without a node is counted, not reported", () => {
    const out = resolveAccessFacts([fact({ callerName: "Loose" })], NODES);
    expect(out).toEqual({
      edges: [],
      report: [],
      summary: { "prisma.access-outside-node": 1 },
    });
  });
});
