// Runtime oracle for the DI spike (docs/accuracy.md section 2).
// Usage: node dump.cjs <built-backend-dir> <entry-js relative to it> <ExportName> > oracle.json
// Boots the app in preview mode (no provider instantiation, no external services) and
// dumps modules, providers, controllers, injectables and constructor/property deps.
// Output is runtime ground truth, not srcatlas schema; a scorer maps it. Names only, no paths.
const path = require("node:path");
const { createRequire } = require("node:module");

const [dir, entry, exportName] = process.argv.slice(2);
if (!dir || !entry || !exportName) {
  console.error("usage: dump.cjs <backend-dir> <entry-js> <ExportName>");
  process.exit(2);
}
const root = path.resolve(dir);
const req = createRequire(path.join(root, "package.json"));
process.chdir(root);
require(req.resolve("reflect-metadata"));
const { NestFactory } = req("@nestjs/core");
const { ModulesContainer } = req("@nestjs/core");

const name = (t) =>
  t == null ? "undefined"
  : typeof t === "function" ? t.name || "anonymous-fn"
  : typeof t === "symbol" ? t.toString()
  : typeof t === "string" ? t
  : (t.provide ? name(t.provide) : "object");

const kind = (w) =>
  w.isAlias ? "existing" : w.metatype && w.inject ? "factory" : w.metatype ? "class" : "value";

function deps(w) {
  const m = w.metatype;
  if (w.inject) return { ctor: w.inject.map((d) => name(d && d.token ? d.token : d)), props: [] };
  if (typeof m !== "function") return { ctor: [], props: [] };
  const types = Reflect.getMetadata("design:paramtypes", m) || [];
  const self = Reflect.getMetadata("self:paramtypes", m) || [];
  const ctor = types.map((t, i) => {
    const o = self.find((s) => s.index === i);
    return name(o ? o.param : t);
  });
  for (const s of self) if (s.index >= ctor.length) ctor[s.index] = name(s.param);
  const props = (Reflect.getMetadata("self:properties_metadata", m) || []).map((p) => ({
    key: String(p.key),
    dep: name(p.type),
  }));
  return { ctor, props };
}

(async () => {
  const mod = require(path.join(root, entry));
  const AppModule = mod[exportName];
  const app = await NestFactory.create(AppModule, {
    preview: true,
    abortOnError: false,
    logger: false,
  });
  const container = app.get(ModulesContainer);
  const out = [];
  for (const [token, m] of container) {
    const n = m.metatype ? m.metatype.name : String(token);
    if (n === "InternalCoreModule") continue;
    const list = (map) =>
      [...map.values()].map((w) => ({ token: name(w.token), kind: kind(w), ...deps(w) }));
    out.push({
      module: n,
      dynamic: !!m.distance && token !== n && !!m.dynamicMetadata,
      global: !!m.isGlobal,
      imports: [...m.imports].map((i) => i.metatype && i.metatype.name).filter(Boolean),
      providers: list(m.providers),
      controllers: list(m.controllers),
      injectables: list(m.injectables),
    });
  }
  const sortBy = (k) => (a, b) => (a[k] < b[k] ? -1 : a[k] > b[k] ? 1 : 0);
  out.sort(sortBy("module"));
  for (const m of out) for (const k of ["providers", "controllers", "injectables"]) m[k].sort(sortBy("token"));
  process.stdout.write(JSON.stringify({ modules: out }, null, 2) + "\n");
  await app.close();
  process.exit(0);
})().catch((e) => {
  console.error("oracle failed:", e && e.stack ? e.stack : e);
  process.exit(1);
});
