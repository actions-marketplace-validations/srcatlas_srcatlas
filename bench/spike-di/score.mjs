// Scores extract.mjs output against the runtime oracle (bench/oracles/nestjs-runtime).
// Usage: node score.mjs <oracle.json> <extracted.json> <backend-src-dir>
// "App-owned" = module class is declared under <backend-src-dir> (plain-text grep, independent of the extractor).
import fs from "node:fs";
import path from "node:path";

const [oraclePath, extractedPath, srcDir] = process.argv.slice(2);
if (!srcDir) {
  console.error("usage: score.mjs <oracle.json> <extracted.json> <src-dir>");
  process.exit(2);
}
const oracle = JSON.parse(fs.readFileSync(oraclePath, "utf8"));
const got = JSON.parse(fs.readFileSync(extractedPath, "utf8"));

const declared = new Set();
(function walk(d) {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) walk(p);
    else if (/\.ts$/.test(f.name) && !/\.spec\.ts$/.test(f.name))
      for (const m of fs.readFileSync(p, "utf8").matchAll(/\bclass\s+([A-Za-z_$][\w$]*)/g)) declared.add(m[1]);
  }
})(srcDir);

const appModules = oracle.modules.filter((m) => declared.has(m.module));
// Framework-provided in every module, not declared by the app.
const internal = (m, t) => t === m.module || t === "ModuleRef" || t === "ApplicationConfig";
const cls = (t) => t.replace(/^APP_\w+:/, "");
const set = (xs) => new Set(xs);
const recall = (want, have) => {
  const miss = [...want].filter((x) => !have.has(x)).sort();
  return { want: want.size, hit: want.size - miss.length, recall: want.size ? +((want.size - miss.length) / want.size).toFixed(4) : 1, miss };
};

const gotModules = new Map(got.modules.map((m) => [m.name, m]));
const modules = recall(set(appModules.map((m) => m.module)), set(gotModules.keys()));

const wantProv = set(), haveProv = set(), wantCtl = set(), haveCtl = set();
for (const m of appModules) {
  for (const p of m.providers) if (!internal(m, p.token)) wantProv.add(`${m.module}:${p.token}`);
  for (const c of m.controllers) wantCtl.add(`${m.module}:${c.token}`);
  const g = gotModules.get(m.module);
  for (const p of g?.providers ?? []) haveProv.add(`${m.module}:${p}`);
  for (const c of g?.controllers ?? []) haveCtl.add(`${m.module}:${c}`);
}
const providers = recall(wantProv, haveProv);
const controllers = recall(wantCtl, haveCtl);

// injects: (from class, dep token), only where `from` is an app class.
const wantInj = set(), haveInj = set(got.injects.map((i) => `${i.from} -> ${i.token}`));
for (const m of appModules)
  for (const w of [...m.providers, ...m.controllers, ...m.injectables]) {
    if (!declared.has(cls(w.token)) || w.kind !== "class") continue;
    for (const d of [...w.ctor, ...w.props.map((p) => p.dep)]) wantInj.add(`${cls(w.token)} -> ${d}`);
  }
const injects = recall(wantInj, haveInj);
const extra = [...haveInj].filter((x) => !wantInj.has(x)).sort();

const out = { modules, providers, controllers, injects: { ...injects, extraInExtractor: extra.length }, extraSample: extra.slice(0, 20) };
process.stdout.write(JSON.stringify(out, null, 2) + "\n");
