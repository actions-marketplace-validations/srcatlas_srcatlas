// Test double for the pool: behaviour is chosen by the task payload.
import { parentPort, threadId } from "node:worker_threads";

parentPort.on("message", async ({ id, task }) => {
  if (task.mode === "crash") process.exit(1);
  if (task.mode === "throw") {
    parentPort.postMessage({ id, ok: false, error: "boom" });
    return;
  }
  await new Promise((r) => setTimeout(r, task.delayMs ?? 0));
  parentPort.postMessage({
    id,
    ok: true,
    value: { echo: task.value, threadId },
  });
});
