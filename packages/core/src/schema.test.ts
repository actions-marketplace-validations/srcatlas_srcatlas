import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GraphFile, graphJsonSchema } from "./index.js";

const doc = readFileSync(
  new URL("../../../docs/schema.md", import.meta.url),
  "utf8",
);
// biome-ignore lint/suspicious/noExplicitAny: test mutates a JSON fixture freely
const example: any = JSON.parse(
  /```json\n([\s\S]*?)\n```/.exec(doc)?.[1] ?? "null",
);

describe("GraphFile schema", () => {
  it("accepts the worked example from docs/schema.md", () => {
    expect(GraphFile.safeParse(example).success).toBe(true);
  });

  it("rejects a known kind with missing required meta", () => {
    const bad = structuredClone(example);
    delete bad.nodes[0].meta.basePath;
    expect(GraphFile.safeParse(bad).success).toBe(false);
  });

  it("rejects a known kind with a wrongly typed meta value", () => {
    const bad = structuredClone(example);
    bad.nodes[1].meta.fieldCount = "5";
    expect(GraphFile.safeParse(bad).success).toBe(false);
  });

  it("keeps unknown meta keys and accepts unknown kinds", () => {
    const g = structuredClone(example);
    g.nodes[0].meta["nestjs.hostname"] = "x";
    g.nodes.push({
      ...g.nodes[0],
      id: "widget:api/W",
      kind: "widget",
      meta: {},
    });
    const r = GraphFile.parse(g);
    expect(r.nodes[0]?.meta).toHaveProperty("nestjs.hostname");
    expect(r.nodes).toHaveLength(g.nodes.length);
  });

  it("rejects wrong schemaVersion, bad commit and zero line", () => {
    expect(GraphFile.safeParse({ ...example, schemaVersion: 2 }).success).toBe(
      false,
    );
    expect(
      GraphFile.safeParse({ ...example, repo: { commit: "abc" } }).success,
    ).toBe(false);
    const bad = structuredClone(example);
    bad.nodes[0].source.line = 0;
    expect(GraphFile.safeParse(bad).success).toBe(false);
  });

  it("exports a JSON Schema", () => {
    expect(graphJsonSchema()).toMatchObject({ type: "object" });
  });
});
