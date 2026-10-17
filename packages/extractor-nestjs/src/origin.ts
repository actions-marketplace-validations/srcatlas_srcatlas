import {
  type ExportDeclaration,
  type ImportDeclaration,
  Node,
  type SourceFile,
  SyntaxKind,
} from "ts-morph";

/** Where an imported name comes from, by import origin and not by spelling (hard rule 1). */
export interface Origin {
  module: string;
  name: string;
}

const MAX_HOPS = 10;

type ModuleRef = ImportDeclaration | ExportDeclaration;

function isThirdParty(sf: SourceFile | undefined): boolean {
  return !sf || sf.isInNodeModules() || sf.isDeclarationFile();
}

/**
 * Follows `name` as imported through `ref` (an import or re-export declaration). Stops at the
 * first module that is not in the repository, so it also works when the package is not
 * installed and its types cannot be loaded.
 */
function chase(ref: ModuleRef, name: string, hops: number): Origin | undefined {
  const module = ref.getModuleSpecifierValue();
  if (module === undefined) return undefined;
  const target = ref.getModuleSpecifierSourceFile();
  if (isThirdParty(target) || !target || hops >= MAX_HOPS) {
    return { module, name };
  }
  for (const exp of target.getExportDeclarations()) {
    const named = exp.getNamedExports();
    if (named.length === 0) {
      // `export * from '...'` re-exports every name.
      if (exp.hasModuleSpecifier() && !exp.getNamespaceExport()) {
        const found = chase(exp, name, hops + 1);
        if (found) return found;
      }
      continue;
    }
    for (const spec of named) {
      const exported = spec.getAliasNode()?.getText() ?? spec.getName();
      if (exported !== name) continue;
      // `export { x }` without a source module names something local: not a re-export.
      return exp.hasModuleSpecifier()
        ? chase(exp, spec.getName(), hops + 1)
        : undefined;
    }
  }
  return undefined;
}

/**
 * The module and exported name an identifier (`forwardRef`) or a namespace member
 * (`common.forwardRef`) was imported from. `undefined` for anything declared locally.
 */
export function originOf(expr: Node): Origin | undefined {
  if (Node.isPropertyAccessExpression(expr)) {
    const ns = expr.getExpression();
    if (!Node.isIdentifier(ns)) return undefined;
    const decl = ns.getSymbol()?.getDeclarations()[0];
    if (!decl || !Node.isNamespaceImport(decl)) return undefined;
    const importDecl = decl.getFirstAncestorByKind(
      SyntaxKind.ImportDeclaration,
    );
    return importDecl ? chase(importDecl, expr.getName(), 0) : undefined;
  }
  if (!Node.isIdentifier(expr)) return undefined;
  const decl = expr.getSymbol()?.getDeclarations()[0];
  if (!decl || !Node.isImportSpecifier(decl)) return undefined;
  const importDecl = decl.getImportDeclaration();
  return chase(importDecl, decl.getName(), 0);
}

export const isFromModule = (
  expr: Node,
  module: string,
  name: string,
): boolean => {
  const o = originOf(expr);
  return o?.module === module && o.name === name;
};
