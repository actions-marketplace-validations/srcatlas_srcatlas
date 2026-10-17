import {
  type Edge,
  type ExtractorContext,
  type ExtractorResult,
  fileId,
  type Node,
} from "@srcatlas/core";
import type { Project } from "ts-morph";

/** A package as the file graph needs to know it: where it lives, to map any file to its owner. */
export interface WorkspacePackage {
  name: string;
  root: string;
}

const isUnder = (path: string, root: string): boolean =>
  root === "." || path.startsWith(`${root}/`);

/** The package that owns a repo-relative path: the one with the longest matching root. */
function ownerOf(
  path: string,
  workspace: WorkspacePackage[],
): WorkspacePackage | undefined {
  let best: WorkspacePackage | undefined;
  for (const p of workspace) {
    if (isUnder(path, p.root) && (!best || p.root.length > best.root.length)) {
      best = p;
    }
  }
  return best;
}

const within = (path: string, root: string): string =>
  root === "." ? path : path.slice(root.length + 1);

/**
 * The fallback for packages with no framework extractor (docs/cli.md 3.2): one `file` node per
 * source file and an `imports` edge per static import between files. Imports that leave the
 * workspace (node_modules, other repositories) produce nothing. An edge to a file that was
 * excluded or not analysed is dropped when the graph is assembled, since it has no node.
 */
export function fileGraph(
  ctx: ExtractorContext<Project>,
  workspace: WorkspacePackage[],
): ExtractorResult {
  const pkg = ctx.package;
  const pkgNode = `package:${pkg.name}`;
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  for (const sf of ctx.project.getSourceFiles()) {
    const file = ctx.relative(sf.getFilePath());
    const own = within(file, pkg.root);
    const from = fileId(pkg.name, own);
    nodes.push({
      id: from,
      kind: "file",
      name: own,
      language: "typescript",
      framework: "node",
      package: pkgNode,
      module: null,
      source: { file, line: 1 },
      extractor: "core",
      confidence: "certain",
      meta: { path: file },
    });

    const declarations = [
      ...sf.getImportDeclarations(),
      ...sf.getExportDeclarations().filter((d) => d.hasModuleSpecifier()),
    ];
    for (const d of declarations) {
      const target = d.getModuleSpecifierSourceFile();
      if (!target) continue;
      const targetPath = ctx.relative(target.getFilePath());
      const owner = ownerOf(targetPath, workspace);
      if (!owner || targetPath.split("/").includes("node_modules")) continue;
      const to = fileId(owner.name, within(targetPath, owner.root));
      if (to === from) continue;
      edges.push({
        from,
        to,
        kind: "imports",
        sites: [{ file, line: d.getStartLineNumber() }],
        extractor: "core",
        confidence: "certain",
        meta: {},
      });
    }
  }
  return { nodes, edges, facts: [], report: [] };
}
