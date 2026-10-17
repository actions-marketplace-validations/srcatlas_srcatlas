import { defineConfig } from "vitest/config";

// Fixtures contain *.spec.ts files that are test data, and dist holds compiled copies of the tests.
export default defineConfig({
  // analyze tests start worker threads and load the TypeScript compiler; slow CI runners need more than 5 s.
  test: { include: ["packages/*/src/**/*.test.ts"], testTimeout: 30_000 },
});
