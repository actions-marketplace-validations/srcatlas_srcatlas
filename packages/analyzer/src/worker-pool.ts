import { Worker } from "node:worker_threads";

export type PoolResult =
  | { ok: true; value: unknown }
  | { ok: false; error: string };

/**
 * Runs `tasks` on up to `size` worker threads that each speak `{id, task}` in and
 * `{id, ok, value | error}` out. Results come back in input order. A task that errors,
 * or a worker that crashes, fails that task only; the worker is replaced.
 */
export function runInPool(
  workerUrl: URL,
  size: number,
  tasks: unknown[],
): Promise<PoolResult[]> {
  return new Promise((resolve) => {
    const results: PoolResult[] = new Array(tasks.length);
    let pending = tasks.length;
    let next = 0;
    if (pending === 0) return resolve(results);

    const settle = (i: number, r: PoolResult): void => {
      results[i] = r;
      if (--pending === 0) resolve(results);
    };

    const spawn = (): void => {
      const worker = new Worker(workerUrl);
      let current = -1;
      let dead = false;
      const feed = (): void => {
        if (next < tasks.length) {
          current = next++;
          worker.postMessage({ id: current, task: tasks[current] });
        } else {
          current = -1;
          void worker.terminate();
        }
      };
      const fail = (reason: string): void => {
        if (dead) return;
        dead = true;
        if (current >= 0) settle(current, { ok: false, error: reason });
        void worker.terminate();
        if (next < tasks.length) spawn();
      };
      worker.on(
        "message",
        (m: { id: number; ok: boolean; value?: unknown; error?: string }) => {
          settle(
            m.id,
            m.ok
              ? { ok: true, value: m.value }
              : { ok: false, error: m.error ?? "unknown error" },
          );
          feed();
        },
      );
      worker.on("error", (e) => fail(e.message));
      worker.on("exit", (code) => fail(`worker exited with code ${code}`));
      feed();
    };

    for (let i = 0; i < Math.min(size, tasks.length); i++) spawn();
  });
}
