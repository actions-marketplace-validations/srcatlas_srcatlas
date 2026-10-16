import { defineConfig } from "tsdown";

// The workspace packages are private, so they are bundled into the one
// published package. Real dependencies (jiti, zod) stay external.
export default defineConfig({
  entry: ["src/bin.ts", "src/index.ts"],
  format: "esm",
  platform: "node",
  target: "node20",
  dts: true,
  clean: true,
  deps: { alwaysBundle: [/^@srcatlas\//] },
});
