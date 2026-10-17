import { defineConfig } from "vitest/config";

// Fixtures contain *.spec.ts files that are test data, and dist holds compiled copies of the tests.
export default defineConfig({
  test: { include: ["packages/*/src/**/*.test.ts"] },
});
