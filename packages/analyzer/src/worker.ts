// Thread entry for the pool. Kept thin: the logic is in runPackage.
import { parentPort } from "node:worker_threads";
import { builtinExtractors } from "./registry.js";
import { type PackageTask, runPackage } from "./run-package.js";

parentPort?.on(
  "message",
  async ({ id, task }: { id: number; task: PackageTask }) => {
    try {
      const value = await runPackage(task, builtinExtractors);
      parentPort?.postMessage({ id, ok: true, value });
    } catch (e) {
      parentPort?.postMessage({
        id,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  },
);
