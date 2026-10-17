import { describe, expect, it } from "vitest";
import { runInPool } from "./worker-pool.js";

const url = new URL("./test-workers/echo-worker.mjs", import.meta.url);

describe("runInPool", () => {
  it("returns results in input order", async () => {
    const out = await runInPool(url, 2, [
      { value: "a", delayMs: 50 },
      { value: "b" },
      { value: "c" },
    ]);
    expect(
      out.map((r) => (r.ok ? (r.value as { echo: string }).echo : null)),
    ).toEqual(["a", "b", "c"]);
  });

  it("runs tasks on separate threads in parallel", async () => {
    const out = await runInPool(url, 2, [
      { value: 1, delayMs: 100 },
      { value: 2, delayMs: 100 },
    ]);
    const ids = out.map((r) =>
      r.ok ? (r.value as { threadId: number }).threadId : -1,
    );
    expect(new Set(ids).size).toBe(2);
  });

  it("isolates a failing task and a crashing worker", async () => {
    const out = await runInPool(url, 1, [
      { mode: "throw" },
      { mode: "crash" },
      { value: "after" },
    ]);
    expect(out[0]).toEqual({ ok: false, error: "boom" });
    expect(out[1]?.ok).toBe(false);
    expect(out[2]).toMatchObject({ ok: true, value: { echo: "after" } });
  });

  it("handles an empty task list", async () => {
    expect(await runInPool(url, 4, [])).toEqual([]);
  });
});
