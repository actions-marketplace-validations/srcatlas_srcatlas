import type { Edge, ExtractorContext } from "@srcatlas/core";
import type { Project } from "ts-morph";
import { ownerOf, type WorkspacePackage } from "./file-graph.js";

/**
 * `depends_on` edges for one package (docs/schema.md 6.1): one edge per static import or
 * `export ... from` that reaches another workspace package, either by naming it or by
 * resolving to a file inside it. The name test comes first so the result does not depend
 * on whether dependencies are installed; the resolved file covers path aliases.
 */
export function packageDependencies(
  ctx: ExtractorContext<Project>,
  workspace: WorkspacePackage[],
): Edge[] {
  const self = ctx.package.name;
  const edges: Edge[] = [];
  for (const sf of ctx.project.getSourceFiles()) {
    const file = ctx.relative(sf.getFilePath());
    const declarations = [
      ...sf.getImportDeclarations(),
      ...sf.getExportDeclarations().filter((d) => d.hasModuleSpecifier()),
    ];
    for (const d of declarations) {
      const spec = d.getModuleSpecifierValue();
      const byName = workspace.find(
        (p) => spec === p.name || spec?.startsWith(`${p.name}/`),
      );
      const target = d.getModuleSpecifierSourceFile();
      const targetPath = target && ctx.relative(target.getFilePath());
      const byFile =
        targetPath &&
        !targetPath.startsWith("../") &&
        !targetPath.split("/").includes("node_modules")
          ? ownerOf(targetPath, workspace)
          : undefined;
      const owner = byName ?? byFile;
      if (!owner || owner.name === self) continue;
      edges.push({
        from: `package:${self}`,
        to: `package:${owner.name}`,
        kind: "depends_on",
        sites: [{ file, line: d.getStartLineNumber() }],
        extractor: "core",
        confidence: "certain",
        meta: {},
      });
    }
  }
  return edges;
}
