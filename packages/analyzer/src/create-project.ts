import { join } from "node:path";
import { Project } from "ts-morph";
import type { PackageInfo } from "./discover-packages.js";

/**
 * One TypeScript program per package (ADR 0002). Compiler options come from the package's
 * tsconfig, but the file set comes from discovery so include, exclude and test rules apply.
 */
export function createProject(root: string, pkg: PackageInfo): Project {
  const project = new Project({
    ...(pkg.tsconfig ? { tsConfigFilePath: join(root, pkg.tsconfig) } : {}),
    skipAddingFilesFromTsConfig: true,
  });
  project.addSourceFilesAtPaths(
    pkg.files.filter((f) => /\.tsx?$/.test(f)).map((f) => join(root, f)),
  );
  return project;
}
