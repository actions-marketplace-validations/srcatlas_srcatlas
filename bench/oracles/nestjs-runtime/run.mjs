// Boots a NestJS app in preview mode and writes what the framework resolved as a srcatlas graph.
// Usage: node run.mjs <app-dir> <entry.ts> <RootModuleName> [--out graph.json] [--work dir] [--keep]
//   --install name@version  adds a package the app imports but does not list (repeatable)
//   <entry.ts>  the file exporting the root module, relative to <app-dir> (for example src/app.module.ts)
// Works on a copy of the app in a temporary directory, so the app is never modified:
//   1. copies the sources (not node_modules, dist or expected.* files)
//   2. rewrites `import type` to `import` in the copy: `import type` makes TypeScript emit `Object`
//      for decorated constructor parameters, which hides every injection from the framework
//   3. installs the app's dependencies, with the Nest platform and reflect-metadata (needs network)
//   4. compiles with decorator metadata, then runs dump.cjs and convert.mjs
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const take = (flag, withValue) => {
  const i = argv.indexOf(flag);
  if (i < 0) return undefined;
  return withValue ? argv.splice(i, 2)[1] : (argv.splice(i, 1), true);
};
// --install name@version adds a package the app needs at runtime but does not list (repeatable).
const extra = [];
for (let i = argv.indexOf("--install"); i >= 0; i = argv.indexOf("--install")) extra.push(argv.splice(i, 2)[1]);
const outPath = take("--out", true);
const workOpt = take("--work", true);
const keep = take("--keep", false);
const [appDir, entry, exportName] = argv;
if (!exportName) {
  console.error("usage: run.mjs <app-dir> <entry.ts> <RootModuleName> [--out file] [--work dir] [--keep]");
  process.exit(2);
}
const app = path.resolve(appDir);
const work = path.resolve(workOpt ?? fs.mkdtempSync(path.join(os.tmpdir(), "srcatlas-oracle-")));

const run = (cmd, args, cwd, capture = false) => {
  const r = spawnSync(cmd, args, { cwd, shell: process.platform === "win32", encoding: "utf8", stdio: capture ? ["ignore", "pipe", "inherit"] : ["ignore", "inherit", "inherit"] });
  return r;
};

// 1 + 2
fs.mkdirSync(work, { recursive: true });
(function copy(from, to) {
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    if (["node_modules", "dist"].includes(e.name) || /^expected\./.test(e.name)) continue;
    const src = path.join(from, e.name);
    const dst = path.join(to, e.name);
    if (e.isDirectory()) {
      fs.mkdirSync(dst, { recursive: true });
      copy(src, dst);
    } else if (/\.ts$/.test(e.name)) {
      fs.writeFileSync(dst, fs.readFileSync(src, "utf8").replace(/^import type \{/gm, "import {"));
    } else fs.copyFileSync(src, dst);
  }
})(app, work);

// 3
const manifest = JSON.parse(fs.readFileSync(path.join(app, "package.json"), "utf8"));
const deps = { ...manifest.dependencies };
const nest = deps["@nestjs/core"] ?? deps["@nestjs/common"] ?? "10.4.0";
deps["@nestjs/common"] ??= nest;
deps["@nestjs/core"] ??= nest;
deps["@nestjs/platform-express"] ??= nest;
deps["reflect-metadata"] ??= "0.2.2";
deps.rxjs ??= "7.8.1";
for (const spec of extra) {
  const at = spec.lastIndexOf("@");
  deps[at > 0 ? spec.slice(0, at) : spec] = at > 0 ? spec.slice(at + 1) : "latest";
}
fs.writeFileSync(
  path.join(work, "package.json"),
  JSON.stringify({ name: manifest.name, version: manifest.version, private: true, dependencies: deps, devDependencies: { typescript: "5.6.3", "@types/node": "20.17.0" } }, null, 2),
);
fs.writeFileSync(
  path.join(work, "tsconfig.json"),
  JSON.stringify({
    compilerOptions: { target: "ES2021", module: "commonjs", moduleResolution: "node", experimentalDecorators: true, emitDecoratorMetadata: true, esModuleInterop: true, skipLibCheck: true, strict: false, noEmitOnError: false, outDir: "dist", rootDir: "." },
    include: ["src/**/*.ts"],
  }),
);
if (!fs.existsSync(path.join(work, "node_modules"))) {
  if (run("npm", ["install", "--no-audit", "--no-fund", "--ignore-scripts", "--loglevel=error"], work).status !== 0) process.exit(1);
}

// 4: type errors do not stop the emit, only a missing output does
run("node", [path.join("node_modules", "typescript", "bin", "tsc"), "-p", "tsconfig.json"], work);
const entryJs = path.posix.join("dist", entry.replace(/\.ts$/, ".js"));
if (!fs.existsSync(path.join(work, entryJs))) {
  console.error(`compilation produced no ${entryJs}`);
  process.exit(1);
}
const dump = run("node", [path.join(here, "dump.cjs"), work, entryJs, exportName], work, true);
if (dump.status !== 0) process.exit(1);
const rawPath = path.join(work, "oracle.raw.json");
fs.writeFileSync(rawPath, dump.stdout);
const convertArgs = [path.join(here, "convert.mjs"), rawPath, app, manifest.name, ...(outPath ? ["--out", path.resolve(outPath)] : [])];
const conv = run("node", convertArgs, work, !outPath);
if (!outPath) process.stdout.write(conv.stdout);
if (!keep && !workOpt) fs.rmSync(work, { recursive: true, force: true });
process.exit(conv.status ?? 1);
