import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  GraphFile,
  parseConfig,
  type Rule,
  validateGraph,
} from "@srcatlas/core";
import { fixturePath } from "@srcatlas/core/testing";
import { describe, expect, it } from "vitest";
import { evaluateRules } from "./evaluate.js";

const json = (file: string): unknown =>
  JSON.parse(readFileSync(join(fixturePath("rules-basic"), file), "utf8"));

const graph = GraphFile.parse(json("graph.json"));
const parsed = parseConfig({ rules: json("rules.json") });
if (!parsed.ok) throw new Error(parsed.errors.join("\n"));
const rules = parsed.config.rules as Rule[];

const only = (...ids: string[]) => rules.filter((r) => ids.includes(r.id));

// Fixture rules-basic and its expected output are hand-written from docs/config.md 2.4.
// Decoys in the graph: a controller excused by `except`, a provider reading the same model
// (not a controller), an `injects` edge (not reads/writes), an edge below minConfidence, a
// controller calling the mailer (no `role`), a service in another module, a provider in
// another package, and an acyclic package graph.
describe("evaluateRules", () => {
  it("the fixture graph is valid", () => {
    expect(validateGraph(graph)).toEqual([]);
  });

  it("returns the expected violations, in rule order, and the expected warnings", () => {
    const r = evaluateRules(graph, rules);
    expect(r.violations).toEqual(json("expected.violations.json"));
    expect(r.warnings).toEqual(json("expected.warnings.json"));
  });

  it("the documented example: a controller must not read or write a model", () => {
    const r = evaluateRules(graph, only("controllers-not-direct-db"));
    expect(r.violations.map((v) => "edgeKind" in v && v.edgeKind)).toEqual([
      "reads",
      "writes",
    ]);
  });

  it("an exception that excused nothing is stale, one that excused an edge is not", () => {
    const r = evaluateRules(graph, only("controllers-not-direct-db"));
    expect(r.warnings).toEqual([
      'rule controllers-not-direct-db: stale exception {"from":"controller:api/GhostController"}',
    ]);
  });

  it("a rule's minConfidence and the check level combine: the higher wins", () => {
    const loose: Rule[] = [
      {
        id: "provider-reads",
        type: "forbidden-edge",
        from: { kind: "provider" },
        to: { kind: "model" },
        edgeKinds: ["reads"],
      },
    ];
    const ids = (minConfidence?: "certain" | "inferred" | "unresolved") =>
      evaluateRules(graph, loose, minConfidence ? { minConfidence } : {})
        .violations.map((v) => ("from" in v ? v.from : ""))
        .sort();
    const all = [
      "provider:api/OrdersService",
      "provider:api/UsersService",
      "provider:web/WebCache",
    ];
    expect(ids()).toEqual(all);
    expect(ids("certain")).toEqual([
      "provider:api/OrdersService",
      "provider:web/WebCache",
    ]);
    // `unresolved` is lower than the rule's default, so it changes nothing.
    expect(ids("unresolved")).toEqual(all);
  });

  it("a cycle violation covers the whole component once", () => {
    const [v] = evaluateRules(graph, only("no-module-cycles")).violations;
    expect(v).toMatchObject({
      over: "modules",
      members: ["module:api/OrdersModule", "module:api/UsersModule"],
    });
    expect(v?.sites).toHaveLength(2);
  });

  it("an acyclic package graph gives no violation", () => {
    expect(evaluateRules(graph, only("no-package-cycles")).violations).toEqual(
      [],
    );
  });

  it("an empty selector matches every node; an empty exception excuses nothing", () => {
    const any: Rule[] = [
      {
        id: "any-injects",
        type: "forbidden-edge",
        from: {},
        to: {},
        edgeKinds: ["injects"],
        except: [{}],
      },
    ];
    const r = evaluateRules(graph, any);
    expect(r.violations).toHaveLength(1);
    expect(r.warnings).toEqual(["rule any-injects: stale exception {}"]);
  });

  it("severity defaults to error", () => {
    const [v] = evaluateRules(graph, only("no-module-cycles")).violations;
    expect(v?.severity).toBe("error");
  });
});
