// Performance gate of ADR 0002 / spec section 15: 500 files under 20 s on 4 cores, under 2 GB
// on 5,000 files. Generates one synthetic NestJS package of N files in a temp directory, runs the
// built CLI on it, and reports wall time and peak memory.
// Usage: node bench/perf/run.mjs [--files 500] [--workers 3] [--budget-seconds 20 (500 files only)] [--budget-mb 2048]
//          [--out bench/results/perf-500.json]
// Needs `pnpm build` first. One package is the worst case: the pool parallelises per package.
// Peak memory is process.resourceUsage().maxRSS of the CLI process, which works on every OS.
// ponytail: workers default to 3 to stand in for a 4-core runner (the CLI default is cores - 1);
// real 4-core numbers come from the CI runner.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? dflt : process.argv[i + 1];
};
const files = Number(arg("--files", 500));
const workers = Number(arg("--workers", 3));
// The time budget is stated for 500 files only; larger runs are checked against memory alone.
const budgetSeconds = Number(arg("--budget-seconds", files <= 500 ? 20 : Number.POSITIVE_INFINITY));
const budgetMb = Number(arg("--budget-mb", 2048));
const out = arg("--out");

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const bin = path.join(repoRoot, "packages/cli/dist/bin.js");
if (!fs.existsSync(bin)) throw new Error("packages/cli/dist/bin.js missing: run pnpm build first");

// Five files per feature (module, controller, service, repository, dto) plus app.module and main.
const pascal = (i) => `Feature${i}`;
function generate(root) {
  const write = (rel, text) => {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, text);
  };
  write(
    "package.json",
    JSON.stringify(
      { name: "perf-app", private: true, dependencies: { "@nestjs/common": "10.4.0", "@nestjs/core": "10.4.0" } },
      null,
      2,
    ),
  );
  const features = Math.floor((files - 2) / 5);
  for (let i = 0; i < features; i++) {
    const N = pascal(i);
    const dir = `src/f${i}`;
    // Each service also injects the previous feature's service, so there are cross-module edges.
    const prev = i > 0 ? pascal(i - 1) : undefined;
    write(`${dir}/f${i}.dto.ts`, `export interface ${N}Dto {\n  id: string;\n  name: string;\n}\n`);
    write(
      `${dir}/f${i}.repository.ts`,
      `import { Injectable } from "@nestjs/common";\nimport type { ${N}Dto } from "./f${i}.dto";\n\n@Injectable()\nexport class ${N}Repository {\n  find(): ${N}Dto[] {\n    return [];\n  }\n}\n`,
    );
    write(
      `${dir}/f${i}.service.ts`,
      `import { Injectable } from "@nestjs/common";\n${prev ? `import { ${prev}Service } from "../f${i - 1}/f${i - 1}.service";\n` : ""}import { ${N}Repository } from "./f${i}.repository";\n\n@Injectable()\nexport class ${N}Service {\n  constructor(\n    private readonly repo: ${N}Repository,\n${prev ? `    private readonly prev: ${prev}Service,\n` : ""}  ) {}\n}\n`,
    );
    write(
      `${dir}/f${i}.controller.ts`,
      `import { Controller, Get, Post } from "@nestjs/common";\nimport { ${N}Service } from "./f${i}.service";\n\n@Controller("f${i}")\nexport class ${N}Controller {\n  constructor(private readonly svc: ${N}Service) {}\n\n  @Get() findAll() {}\n  @Post() create() {}\n}\n`,
    );
    write(
      `${dir}/f${i}.module.ts`,
      `import { Module } from "@nestjs/common";\n${prev ? `import { ${prev}Module } from "../f${i - 1}/f${i - 1}.module";\n` : ""}import { ${N}Controller } from "./f${i}.controller";\nimport { ${N}Repository } from "./f${i}.repository";\nimport { ${N}Service } from "./f${i}.service";\n\n@Module({\n  imports: [${prev ? `${prev}Module` : ""}],\n  controllers: [${N}Controller],\n  providers: [${N}Service, ${N}Repository],\n  exports: [${N}Service],\n})\nexport class ${N}Module {}\n`,
    );
  }
  const names = Array.from({ length: features }, (_, i) => pascal(i));
  write(
    "src/app.module.ts",
    `import { Module } from "@nestjs/common";\n${names.map((n, i) => `import { ${n}Module } from "./f${i}/f${i}.module";`).join("\n")}\n\n@Module({ imports: [${names.map((n) => `${n}Module`).join(", ")}] })\nexport class AppModule {}\n`,
  );
  write(
    "src/main.ts",
    `import { NestFactory } from "@nestjs/core";\nimport { AppModule } from "./app.module";\n\nNestFactory.create(AppModule);\n`,
  );
  // Pad to exactly `files` with unreferenced interface files.
  let n = features * 5 + 2;
  for (; n < files; n++) write(`src/extra/e${n}.ts`, `export interface Extra${n} {
  id: string;
}
`);
  return n;
}

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "srcatlas-perf-"));
const root = path.join(scratch, "app");
try {
  const generated = generate(root);
  // The child prints its own peak RSS on exit; the wall time includes node start-up (conservative).
  const child = `process.argv=[process.argv[0],${JSON.stringify(bin)},"analyze","--workers","${workers}","--quiet"];
process.on("exit",()=>console.error("MAXRSS "+process.resourceUsage().maxRSS));
await import(${JSON.stringify(pathToFileURL(bin).href)});`;
  const started = performance.now();
  // A file, not `-e`: worker threads inherit execArgv, and a worker given `-e` does not run its own script.
  const script = path.join(scratch, "child.mjs");
  fs.writeFileSync(script, child);
  const r = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" });
  const seconds = +((performance.now() - started) / 1000).toFixed(2);
  const rss = /MAXRSS (\d+)/.exec(r.stderr)?.[1];
  if (r.status !== 0 || !rss) throw new Error(`analyze failed (exit ${r.status}):\n${r.stderr}`);
  const graph = JSON.parse(fs.readFileSync(path.join(root, ".srcatlas/srcatlas.graph.json"), "utf8"));
  const result = {
    files: generated,
    workers,
    cpus: os.cpus().length,
    platform: `${process.platform}-${process.arch}`,
    node: process.version,
    nodes: graph.nodes.length,
    edges: graph.edges.length,
    seconds,
    peakMb: Math.round(Number(rss) / 1024), // maxRSS is in kilobytes
    budget: { seconds: Number.isFinite(budgetSeconds) ? budgetSeconds : null, mb: budgetMb },
  };
  result.withinBudget = result.seconds <= budgetSeconds && result.peakMb <= budgetMb;
  const text = `${JSON.stringify(result, null, 2)}\n`;
  if (out) fs.writeFileSync(path.resolve(repoRoot, out), text);
  process.stdout.write(text);
  if (!result.withinBudget) process.exitCode = 1;
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
