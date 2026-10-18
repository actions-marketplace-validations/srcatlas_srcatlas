import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AcceptedFile,
  acceptedKey,
  GraphFile,
  parseConfig,
  type Rule,
  serializeAccepted,
} from "@srcatlas/core";
import { fixturePath } from "@srcatlas/core/testing";
import { describe, expect, it } from "vitest";
import { applyAccepted, recordAccepted, toEntry } from "./accepted.js";
import { evaluateRules } from "./evaluate.js";

const json = (file: string): unknown =>
  JSON.parse(readFileSync(join(fixturePath("rules-basic"), file), "utf8"));

const graph = GraphFile.parse(json("graph.json"));
const parsed = parseConfig({ rules: json("rules.json") });
if (!parsed.ok) throw new Error(parsed.errors.join("\n"));
const violations = evaluateRules(
  graph,
  parsed.config.rules as Rule[],
).violations;
const expected = AcceptedFile.parse(json("expected.accepted.json")).violations;

// docs/cli.md 3.5.2. The expected file is hand-written, sorted by rule ID, then from,
// edgeKind, to (or the members).
describe("accepted violations", () => {
  it("an entry is a violation without severity, message and sites", () => {
    expect(violations.map(toEntry)).toEqual(expect.arrayContaining(expected));
    expect(violations.map(toEntry)).toHaveLength(expected.length);
  });

  it("the file is written sorted, whatever the order of the entries", () => {
    const shuffled = [...expected].reverse();
    expect(serializeAccepted(shuffled)).toBe(serializeAccepted(expected));
    expect(JSON.parse(serializeAccepted(shuffled)).violations).toEqual(
      expected,
    );
  });

  it("the key ignores sites, severity and message", () => {
    const [v] = violations;
    if (!v) throw new Error("fixture has violations");
    const moved = {
      ...v,
      severity: "warn" as const,
      message: "other",
      sites: [],
    };
    expect(acceptedKey(toEntry(moved))).toBe(acceptedKey(toEntry(v)));
  });

  it("applyAccepted separates new, accepted and stale", () => {
    const [first, ...rest] = expected;
    if (!first) throw new Error("fixture has entries");
    const ghost = {
      rule: "gone",
      from: "provider:api/A",
      edgeKind: "calls",
      to: "provider:api/B",
    };
    const r = applyAccepted(violations, [...rest, ghost]);
    expect(r.fresh.map(toEntry)).toEqual([first]);
    expect(r.accepted).toHaveLength(rest.length);
    expect(r.stale).toEqual([ghost]);
  });

  it("a cycle that gains a member is a new violation", () => {
    const cycle = expected.find((e) => "members" in e);
    if (!cycle || !("members" in cycle)) throw new Error("fixture has a cycle");
    const grown = {
      ...cycle,
      members: [...cycle.members, "module:api/ZModule"],
    };
    const r = applyAccepted(violations, [grown]);
    expect(r.stale).toEqual([grown]);
    expect(r.fresh).toHaveLength(violations.length);
  });

  describe("recordAccepted", () => {
    const [first, ...rest] = expected;
    const ghost = {
      rule: "gone",
      from: "provider:api/A",
      edgeKind: "calls",
      to: "provider:api/B",
    };

    it("without a file, records every violation", () => {
      expect(recordAccepted(violations, undefined, false)).toEqual(
        expect.arrayContaining(expected),
      );
      expect(recordAccepted(violations, undefined, false)).toHaveLength(
        expected.length,
      );
    });
    it("with a file, drops what no longer occurs and adds nothing", () => {
      const next = recordAccepted(violations, [...rest, ghost], false);
      expect(next).toHaveLength(rest.length);
      expect(next).not.toContainEqual(ghost);
      expect(first && next).not.toContainEqual(first);
    });
    it("with a file and add, records the new ones too", () => {
      const next = recordAccepted(violations, [...rest, ghost], true);
      expect(next).toHaveLength(expected.length);
      expect(next).toContainEqual(first);
    });
  });
});
