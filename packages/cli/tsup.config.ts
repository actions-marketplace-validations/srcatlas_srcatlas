import { defineConfig } from "tsup";

// The workspace packages are private, so they are bundled into the one
// published package. Real dependencies (jiti, zod, ts-morph, picomatch) stay external.
export default defineConfig({
  // The analyser loads its worker threads by file name, so the worker is its own entry.
  entry: {
    bin: "src/bin.ts",
    index: "src/index.ts",
    worker: "../analyzer/src/worker.ts",
  },
  format: "esm",
  platform: "node",
  target: "node20",
  dts: true,
  clean: true,
  noExternal: [/^@srcatlas\//],
});
