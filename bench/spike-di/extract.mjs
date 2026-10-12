// Provisional NestJS DI extractor for the feasibility spike (docs/research/di-spike.md).
// Usage: node extract.mjs <path/to/tsconfig.json> > extracted.json
// Throwaway: not the product extractor. Decorators matched by import origin (CLAUDE.md rule 4).
import { Project, Node, SyntaxKind } from "ts-morph";
import path from "node:path";

const tsconfig = process.argv[2];
if (!tsconfig) {
  console.error("usage: extract.mjs <tsconfig.json>");
  process.exit(2);
}
const project = new Project({ tsConfigFilePath: path.resolve(tsconfig) });
const unresolved = [];
const note = (node, why) =>
  unresolved.push(`${why} @ ${node.getSourceFile().getBaseName()}:${node.getStartLineNumber()}`);

const unalias = (s) => (s && s.isAlias() ? (s.getAliasedSymbol() ?? s) : s);
const declOf = (node) => unalias(node.getSymbol())?.getDeclarations()?.[0];
const fromNest = (decl) =>
  !!decl && /[\\/]@nestjs[\\/]common[\\/]/.test(decl.getSourceFile().getFilePath());

// A decorator counts only if its name resolves to @nestjs/common's export of that name.
function nestDecorator(node, name) {
  return node.getDecorators().find((d) => {
    const callee = d.getCallExpression()?.getExpression() ?? d.getExpression();
    if (!Node.isIdentifier(callee)) return false;
    const s = unalias(callee.getSymbol());
    return s?.getName() === name && fromNest(s.getDeclarations()[0]);
  });
}

function classNameOf(expr) {
  if (Node.isCallExpression(expr)) {
    const callee = expr.getExpression();
    // forwardRef(() => X)
    if (Node.isIdentifier(callee) && callee.getText() === "forwardRef") {
      const fn = expr.getArguments()[0];
      const body = fn && Node.isArrowFunction(fn) ? fn.getBody() : undefined;
      return body ? classNameOf(body) : null;
    }
    // X.forRoot(...) / X.register(...): the module is X
    if (Node.isPropertyAccessExpression(callee)) return classNameOf(callee.getExpression());
    return null;
  }
  if (Node.isIdentifier(expr) || Node.isPropertyAccessExpression(expr)) {
    const d = declOf(expr);
    if (d && Node.isClassDeclaration(d)) return d.getName() ?? null;
  }
  return null;
}

// Token naming mirrors the runtime oracle: class name, string value, Symbol(desc).
function tokenOf(expr) {
  const cls = classNameOf(expr);
  if (cls) return cls;
  if (Node.isStringLiteral(expr) || Node.isNoSubstitutionTemplateLiteral(expr))
    return expr.getLiteralValue();
  if (Node.isIdentifier(expr) || Node.isPropertyAccessExpression(expr)) {
    const lit = expr.getType().getLiteralValue();
    if (typeof lit === "string") return lit;
    const d = declOf(expr);
    if (d && Node.isVariableDeclaration(d)) {
      const init = d.getInitializer();
      if (init && Node.isCallExpression(init) && init.getExpression().getText() === "Symbol") {
        const a = init.getArguments()[0];
        return `Symbol(${a && Node.isStringLiteral(a) ? a.getLiteralValue() : ""})`;
      }
      if (init) return tokenOf(init);
    }
  }
  return null;
}

// Flatten an array expression: literals, spreads, and const identifiers (limited evaluation).
function elements(expr, seen = new Set()) {
  if (!expr || seen.has(expr)) return [];
  seen.add(expr);
  if (Node.isArrayLiteralExpression(expr)) {
    return expr
      .getElements()
      .flatMap((e) => (Node.isSpreadElement(e) ? elements(e.getExpression(), seen) : [e]));
  }
  if (Node.isIdentifier(expr) || Node.isPropertyAccessExpression(expr)) {
    const d = declOf(expr);
    if (d && Node.isVariableDeclaration(d) && d.getInitializer())
      return elements(d.getInitializer(), seen);
  }
  note(expr, "array not evaluable");
  return [];
}

function prop(obj, name) {
  const p = obj.getProperty(name);
  return p && Node.isPropertyAssignment(p) ? p.getInitializer() : undefined;
}

// One provider entry -> { token, cls } where cls is the class whose constructor is injected.
function providerEntry(e) {
  if (Node.isObjectLiteralExpression(e)) {
    const provide = prop(e, "provide");
    let token = provide ? tokenOf(provide) : null;
    const useClass = prop(e, "useClass");
    const cls = useClass ? classNameOf(useClass) : null;
    if (token && /^APP_[A-Z_]+$/.test(provide.getText()) && cls) token = `${provide.getText()}:${cls}`;
    if (!token) {
      note(e, "provider token not evaluable");
      return null;
    }
    return { token, cls };
  }
  const name = classNameOf(e);
  if (!name) {
    note(e, "provider entry not evaluable");
    return null;
  }
  return { token: name, cls: name };
}

const classes = new Map(); // name -> ClassDeclaration (app-owned)
for (const sf of project.getSourceFiles()) {
  if (/node_modules/.test(sf.getFilePath())) continue;
  for (const c of sf.getClasses()) if (c.getName()) classes.set(c.getName(), c);
}

const modules = [];
const injectSources = new Set(); // class names whose DI sites we scan
for (const [name, cls] of classes) {
  const dec = nestDecorator(cls, "Module");
  if (!dec) continue;
  const m = {
    name,
    imports: [],
    providers: [],
    controllers: [],
    exports: [],
    global: !!nestDecorator(cls, "Global"),
  };
  const bags = [];
  const arg = dec.getArguments()[0];
  if (arg && Node.isObjectLiteralExpression(arg)) bags.push(arg);
  else if (arg) note(arg, "module metadata not literal");
  // Dynamic modules defined in the app: static methods returning { module, providers, ... }.
  for (const meth of cls.getStaticMethods()) {
    for (const r of meth.getDescendantsOfKind(SyntaxKind.ReturnStatement)) {
      const o = r.getExpression();
      if (o && Node.isObjectLiteralExpression(o) && o.getProperty("module")) bags.push(o);
    }
  }
  for (const bag of bags) {
    for (const e of elements(prop(bag, "imports"))) {
      const n = classNameOf(e);
      if (n) m.imports.push(n);
      else note(e, "import not evaluable");
    }
    for (const e of elements(prop(bag, "providers"))) {
      const p = providerEntry(e);
      if (p) {
        m.providers.push(p.token);
        if (p.cls) injectSources.add(p.cls);
      }
    }
    for (const e of elements(prop(bag, "controllers"))) {
      const n = classNameOf(e);
      if (n) {
        m.controllers.push(n);
        injectSources.add(n);
      }
    }
    for (const e of elements(prop(bag, "exports"))) {
      const t = tokenOf(e);
      if (t) m.exports.push(t);
    }
  }
  modules.push(m);
}

const injects = [];
for (const name of injectSources) {
  const cls = classes.get(name);
  if (!cls) continue; // class from node_modules: no body to read
  const ctor = cls.getConstructors()[0];
  for (const p of ctor?.getParameters() ?? []) {
    const inj = nestDecorator(p, "Inject");
    let token = null;
    if (inj) {
      const a = inj.getArguments()[0];
      token = a ? tokenOf(a) : null;
    } else {
      const d = unalias(p.getType().getSymbol())?.getDeclarations()[0];
      token = d && Node.isClassDeclaration(d) ? (d.getName() ?? null) : null;
    }
    if (token) injects.push({ from: name, token, via: "ctor" });
    else note(p, `ctor param of ${name} not resolvable`);
  }
  for (const prp of cls.getProperties()) {
    const inj = nestDecorator(prp, "Inject");
    if (!inj) continue;
    const a = inj.getArguments()[0];
    const token = a ? tokenOf(a) : null;
    if (token) injects.push({ from: name, token, via: "prop" });
    else note(prp, "property injection not resolvable");
  }
}

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const uniq = (xs) => [...new Set(xs)].sort(cmp);
modules.sort((a, b) => cmp(a.name, b.name));
for (const m of modules) for (const k of ["imports", "providers", "controllers", "exports"]) m[k] = uniq(m[k]);
injects.sort((a, b) => cmp(a.from + a.token, b.from + b.token));
process.stdout.write(JSON.stringify({ modules, injects, unresolved: uniq(unresolved) }, null, 2) + "\n");
