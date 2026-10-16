import { describe, expect, it } from "vitest";
import { defineConfig, parseConfig } from "./config.js";

const errors = (input: unknown) => {
  const r = parseConfig(input);
  return r.ok ? [] : r.errors;
};

describe("parseConfig", () => {
  it("accepts an empty config and the docs/config.md example", () => {
    expect(parseConfig({}).ok).toBe(true);
    const full = defineConfig({
      repository: "github.com/acme/shop",
      packages: [
        { path: "apps/api", name: "api", extractors: ["nestjs", "prisma"] },
        "apps/web",
      ],
      exclude: ["**/__mocks__/**"],
      extractors: {
        nestjs: {
          globalPrefix: "api",
          versioning: { type: "uri", defaultVersion: "1" },
        },
      },
      rules: [
        {
          id: "controllers-not-direct-db",
          severity: "error",
          type: "forbidden-edge",
          from: { kind: "controller" },
          to: { kind: "model" },
          edgeKinds: ["reads", "writes"],
        },
        { id: "no-module-cycles", type: "no-cycles", over: "modules" },
      ],
      embed: { scope: "all", output: "docs/architecture.svg", theme: "auto" },
    });
    expect(parseConfig(full).ok).toBe(true);
  });

  it("rejects unknown keys at every depth, with the path", () => {
    expect(errors({ pakages: [] })[0]).toMatch(/^\(config\): .*pakages/);
    expect(errors({ analysis: { worker: 2 } })[0]).toMatch(
      /^analysis: .*worker/,
    );
  });

  it("reports nested paths like rules[1].to.module", () => {
    const e = errors({
      rules: [
        { id: "a", type: "no-cycles", over: "modules" },
        { id: "b", type: "forbidden-edge", from: {}, to: { module: 3 } },
      ],
    });
    expect(e).toEqual([expect.stringMatching(/^rules\[1\]\.to\.module: /)]);
  });

  it("rejects duplicate rule ids and duplicate package names", () => {
    const rule = { id: "x", type: "no-cycles", over: "modules" };
    expect(errors({ rules: [rule, rule] })[0]).toMatch(/duplicate rule id "x"/);
    const p = { path: "a", name: "n" };
    expect(errors({ packages: [p, { ...p, path: "b" }] })[0]).toMatch(
      /duplicate package name "n"/,
    );
  });

  it("rejects unknown extractor and node kind names", () => {
    expect(
      errors({ packages: [{ path: "a", extractors: ["rails"] }] }),
    ).not.toEqual([]);
    expect(
      errors({
        rules: [
          {
            id: "a",
            type: "max-fan-out",
            of: { kind: "widget" },
            edgeKinds: ["calls"],
            max: 1,
          },
        ],
      }),
    ).not.toEqual([]);
  });
});
