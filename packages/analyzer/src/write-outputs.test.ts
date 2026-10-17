import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeOutputs } from "./write-outputs.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "srcatlas-out-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("writeOutputs", () => {
  it("creates directories and replaces existing files", () => {
    writeFileSync(join(dir, "a.json"), "old");
    writeOutputs([
      { path: join(dir, "a.json"), content: "new-a" },
      { path: join(dir, "deep", "er", "b.json"), content: "new-b" },
    ]);
    expect(readFileSync(join(dir, "a.json"), "utf8")).toBe("new-a");
    expect(readFileSync(join(dir, "deep", "er", "b.json"), "utf8")).toBe(
      "new-b",
    );
  });

  it("leaves every previous file untouched, and no temp files, when one write fails", () => {
    writeFileSync(join(dir, "a.json"), "old-a");
    mkdirSync(join(dir, "blocked")); // renaming a file onto a directory fails
    expect(() =>
      writeOutputs([
        { path: join(dir, "a.json"), content: "new-a" },
        { path: join(dir, "blocked"), content: "new-b" },
      ]),
    ).toThrow();
    expect(readFileSync(join(dir, "a.json"), "utf8")).toBe("old-a");
    expect(readdirSync(dir).sort()).toEqual(["a.json", "blocked"]);
  });
});
