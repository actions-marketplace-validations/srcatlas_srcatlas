// Turns the raw output of dump.cjs into a srcatlas graph file (docs/accuracy.md sections 1 and 2).
// Usage: node convert.mjs <oracle.json> <app-root> <package-name> [--out graph.json]
// The graph holds what the framework resolved, for the classes the app declares: module,
// provider and controller nodes, and imports, contains and injects edges. It is ground truth for
// scoring, so it is built without looking at the extractor.
//
// Limits of v0 (the notes printed on stderr count what was left out):
//  - only class providers; custom providers (string and symbol tokens, factories, values) are skipped
//  - routes are not exported
//  - a class name declared in two files cannot be mapped to a file from a runtime dump: skipped
//  - `source.line` is the line of the `class` keyword, not of its first decorator
import fs from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const outIndex = argv.indexOf("--out");
const out = outIndex >= 0 ? argv.splice(outIndex, 2)[1] : undefined;
const [oraclePath, appRoot, pkg] = argv;
if (!pkg) {
  console.error("usage: convert.mjs <oracle.json> <app-root> <package-name> [--out file]");
  process.exit(2);
}
const oracle = JSON.parse(fs.readFileSync(oraclePath, "utf8"));
const root = path.resolve(appRoot);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// ---- where the app declares its classes (plain-text scan, independent of any extractor)
const declared = new Map(); // name -> [{ file, line }]
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", "dist", ".git"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.ts$/.test(entry.name) && !/\.(d|spec|test)\.ts$/.test(entry.name)) {
      const file = path.relative(root, full).split(path.sep).join("/");
      fs.readFileSync(full, "utf8").split(/\r?\n/).forEach((text, i) => {
        const m = /^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/.exec(text);
        if (m) declared.set(m[1], [...(declared.get(m[1]) ?? []), { file, line: i + 1 }]);
      });
    }
  }
})(root);

const notes = { ambiguousClass: new Set(), customProviders: 0, unmappedDeps: 0 };
const site = (name) => {
  const where = declared.get(name);
  if (!where) return undefined;
  if (where.length > 1) {
    notes.ambiguousClass.add(name);
    return undefined;
  }
  return where[0];
};
const idOf = (kind, name) => `${kind}:${pkg}/${name}`;
const classOf = (token) => token.replace(/^APP_\w+:/, "");
// Added to every module by the framework itself.
const INTERNAL = new Set(["ModuleRef", "ApplicationConfig"]);

// ---- merge dynamic registrations of one module class
const modules = new Map();
for (const m of oracle.modules) {
  const have = modules.get(m.module);
  if (!have) modules.set(m.module, structuredClone(m));
  else {
    have.global ||= m.global;
    have.dynamic ||= m.dynamic;
    for (const k of ["imports", "providers", "controllers", "injectables"]) have[k].push(...m[k]);
  }
}

const nodes = new Map();
const edges = new Map();
const addNode = (n) => {
  if (!nodes.has(n.id)) nodes.set(n.id, n);
};
const addEdge = (from, kind, to, s) => {
  const key = `${from}\0${kind}\0${to}`;
  if (!edges.has(key)) edges.set(key, { from, kind, to, sites: [s], extractor: "nestjs-runtime", confidence: "certain", meta: {} });
};
const base = (kind, name, s, moduleId, meta) => ({
  id: idOf(kind, name), kind, name, language: "typescript", framework: "nestjs",
  package: `package:${pkg}`, module: moduleId, source: s, extractor: "nestjs-runtime",
  confidence: "certain", meta,
});

// pass 1: modules, then the classes registered in them
const ownedModules = [...modules.values()].filter((m) => site(m.module));
for (const m of ownedModules) {
  addNode(base("module", m.module, site(m.module), null, { dynamic: !!m.dynamic, global: !!m.global }));
}
const registered = new Map(); // class name -> kind (provider | controller)
for (const m of ownedModules) {
  const moduleId = idOf("module", m.module);
  const own = site(m.module);
  for (const i of m.imports) {
    if (site(i)) addEdge(moduleId, "imports", idOf("module", i), own);
  }
  for (const [list, kind] of [[m.providers, "provider"], [m.controllers, "controller"]]) {
    for (const w of list) {
      const name = classOf(w.token);
      // Nest registers every module class as a provider of itself: framework-internal.
      if (name === m.module || INTERNAL.has(name)) continue;
      if (w.kind !== "class" || !site(name)) {
        if (w.kind !== "class") notes.customProviders++;
        continue;
      }
      const s = site(name);
      const meta =
        kind === "controller"
          ? (() => {
              const paths = [].concat(w.path ?? "").map((p) => `/${String(p).split("/").filter(Boolean).join("/")}`);
              return { basePath: paths[0] ?? "/", ...(paths.length > 1 ? { "nestjs.basePaths": [...new Set(paths)].sort(cmp) } : {}) };
            })()
          : { providerType: "class", role: w.role, scope: w.scope };
      const first = !nodes.has(idOf(kind, name));
      addNode(base(kind, name, s, moduleId, meta));
      registered.set(name, { kind, w });
      // A class registered through APP_* is a provider of no module (N-P4).
      if (!/^APP_/.test(w.token)) addEdge(moduleId, "contains", idOf(kind, name), own);
      else if (first) nodes.get(idOf(kind, name)).module = null;
    }
  }
}
// injectables (guards and pipes reached through decorators) are providers of no module (N-P11)
for (const m of ownedModules) {
  for (const w of m.injectables) {
    const name = classOf(w.token);
    if (w.kind !== "class" || !site(name) || registered.has(name)) continue;
    addNode(base("provider", name, site(name), null, { providerType: "class", role: w.role, scope: w.scope }));
    registered.set(name, { kind: "provider", w });
  }
}

// pass 2: injects, from each class to the provider classes it asks for
for (const [name, { kind, w }] of registered) {
  const from = idOf(kind, name);
  for (const dep of [...w.ctor, ...w.props.map((p) => p.dep)]) {
    const target = registered.get(classOf(dep));
    if (target?.kind === "provider") addEdge(from, "injects", idOf("provider", classOf(dep)), site(name));
    else notes.unmappedDeps++;
  }
}

// ---- package node and output
let version;
try {
  version = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
} catch {}
nodes.set(`package:${pkg}`, {
  id: `package:${pkg}`, kind: "package", name: pkg, language: "typescript", framework: "node",
  package: `package:${pkg}`, module: null, source: { file: "package.json", line: 1 },
  extractor: "nestjs-runtime", confidence: "certain", meta: { root: ".", ...(typeof version === "string" ? { version } : {}) },
});

const graph = {
  schemaVersion: 1,
  generator: { name: "srcatlas-oracle-nestjs-runtime", version: "0.0.0" },
  repo: {},
  nodes: [...nodes.values()].sort((a, b) => cmp(a.id, b.id)),
  edges: [...edges.values()].sort((a, b) => cmp(a.from, b.from) || cmp(a.kind, b.kind) || cmp(a.to, b.to)),
};
const text = `${JSON.stringify(graph, null, 2)}\n`;
if (out) fs.writeFileSync(out, text);
else process.stdout.write(text);
console.error(
  JSON.stringify({
    nodes: graph.nodes.length,
    edges: graph.edges.length,
    skippedAmbiguousClassNames: [...notes.ambiguousClass].sort(cmp),
    skippedCustomProviders: notes.customProviders,
    skippedDependenciesWithoutProviderClass: notes.unmappedDeps,
  }),
);
