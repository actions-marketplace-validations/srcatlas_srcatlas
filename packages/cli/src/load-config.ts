import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type Config, parseConfig } from "@srcatlas/core";
import { createJiti } from "jiti";
import { UsageError } from "./errors.js";

const NAMES = [
  "srcatlas.config.ts",
  "srcatlas.config.mts",
  "srcatlas.config.js",
  "srcatlas.config.mjs",
];

/**
 * docs/config.md section 1: find the config in `root` (or use `explicit`),
 * execute it with jiti, validate the default export. No config is valid and
 * gives `{}`. jiti's disk cache is off so loading never writes into the repo (ADR 0008).
 */
export async function loadConfig(
  root: string,
  explicit?: string,
): Promise<Config> {
  const file = explicit
    ? resolve(root, explicit)
    : NAMES.map((n) => resolve(root, n)).find((p) => existsSync(p));
  if (explicit && file && !existsSync(file)) {
    throw new UsageError(`config file not found: ${explicit}`);
  }
  if (!file) return {};

  // `import { defineConfig } from "srcatlas"` must work when srcatlas was started with npx and is
  // not installed in the project, which is what `srcatlas init` writes. Point it at this copy.
  const self = ["./index.js", "./index.ts"]
    .map((p) => fileURLToPath(new URL(p, import.meta.url)))
    .find((p) => existsSync(p));
  const jiti = createJiti(import.meta.url, {
    fsCache: false,
    moduleCache: false,
    ...(self ? { alias: { srcatlas: self } } : {}),
  });
  let value: unknown;
  try {
    value = await jiti.import(file, { default: true });
  } catch (e) {
    throw new UsageError(
      `could not load ${file}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  const r = parseConfig(value);
  if (!r.ok) {
    throw new UsageError(
      `invalid config ${file}:\n${r.errors.map((m) => `  ${m}`).join("\n")}`,
    );
  }
  return r.config;
}
