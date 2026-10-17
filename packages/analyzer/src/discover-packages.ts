import { type Dirent, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";

import type { Config, ReportCode } from "@srcatlas/core";
import picomatch from "picomatch";

/** A package to analyse. Paths are repository-relative with `/` separators. */
export interface PackageInfo {
  name: string;
  /** `.` for the repository root. */
  root: string;
  /** Repo-relative tsconfig, or null when none was found. */
  tsconfig: string | null;
  /** Repo-relative, sorted by code unit. */
  files: string[];
  /** Extractors named in the config; absent means detect them from package.json. */
  extractors?: string[];
}

export interface DiscoveryReportEntry {
  code: Extract<ReportCode, "core.file-too-large">;
  file: string;
}

export interface DiscoveryResult {
  packages: PackageInfo[];
  report: DiscoveryReportEntry[];
}

interface PackageEntry {
  path: string;
  name?: string | undefined;
  tsconfig?: string | undefined;
  include?: string[] | undefined;
  exclude?: string[] | undefined;
  extractors?: string[] | undefined;
}

export class DuplicatePackageNameError extends Error {
  constructor(name: string) {
    super(`duplicate package name "${name}"`);
    this.name = "DuplicatePackageNameError";
  }
}

// docs/config.md 2.1
const DEFAULT_INCLUDE = ["**/*.ts", "**/*.tsx", "**/*.prisma"];
const DEFAULT_EXCLUDE = [
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/.next/**",
  "**/coverage/**",
  "**/*.d.ts",
  "**/.srcatlas/**",
];
const TEST_EXCLUDE = [
  "**/*.spec.ts",
  "**/*.spec.tsx",
  "**/*.test.ts",
  "**/*.test.tsx",
  "**/__tests__/**",
];

const byCodeUnit = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0;

const readJson = (file: string): Record<string, unknown> | null => {
  try {
    const v: unknown = JSON.parse(readFileSync(file, "utf8"));
    return typeof v === "object" && v !== null && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

const isFile = (file: string): boolean => {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
};

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

/** Reads the `packages:` list of pnpm-workspace.yaml; the file has no other shape we need. */
function pnpmPatterns(root: string): string[] {
  let text: string;
  try {
    text = readFileSync(join(root, "pnpm-workspace.yaml"), "utf8");
  } catch {
    return [];
  }
  const out: string[] = [];
  let inPackages = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, "");
    if (/^packages\s*:\s*$/.test(line)) inPackages = true;
    else if (/^\S/.test(line)) inPackages = false;
    else if (inPackages) {
      const m = /^\s*-\s*(["']?)(.+?)\1\s*$/.exec(line);
      if (m?.[2]) out.push(m[2]);
    }
  }
  return out;
}

function workspacePatterns(root: string): string[] {
  const pnpm = pnpmPatterns(root);
  if (pnpm.length > 0) return pnpm;
  const ws = readJson(join(root, "package.json"))?.workspaces;
  if (Array.isArray(ws)) return strings(ws);
  if (typeof ws === "object" && ws !== null) {
    return strings((ws as { packages?: unknown }).packages);
  }
  return [];
}

const cleanGlob = (p: string): string =>
  p.replace(/^\.\//, "").replace(/\/+$/, "");

/** Repo-relative directories under `root` that match the workspace globs and contain a package.json. */
function expandWorkspaces(root: string, patterns: string[]): string[] {
  const positive = picomatch(
    patterns.filter((p) => !p.startsWith("!")).map(cleanGlob),
  );
  const negated = patterns
    .filter((p) => p.startsWith("!"))
    .map((p) => cleanGlob(p.slice(1)));
  const isNegated = negated.length > 0 ? picomatch(negated) : () => false;
  const found: string[] = [];
  const walk = (rel: string): void => {
    for (const e of readdirSync(join(root, rel), { withFileTypes: true })) {
      if (
        !e.isDirectory() ||
        e.name === "node_modules" ||
        e.name.startsWith(".")
      ) {
        continue;
      }
      const child = rel === "" ? e.name : `${rel}/${e.name}`;
      if (
        positive(child) &&
        !isNegated(child) &&
        isFile(join(root, child, "package.json"))
      ) {
        found.push(child);
      }
      walk(child);
    }
  };
  walk("");
  return found;
}

interface FileRules {
  include: string[];
  exclude: string[];
  includeTests: boolean;
  maxBytes: number;
  followSymlinks: boolean;
}

const isLinkToDir = (e: Dirent, abs: string): boolean => {
  if (!e.isSymbolicLink()) return false;
  try {
    return statSync(abs).isDirectory();
  } catch {
    return false;
  }
};

function collectFiles(
  root: string,
  pkgRoot: string,
  rules: FileRules,
  report: DiscoveryReportEntry[],
): string[] {
  const included = picomatch(rules.include, { dot: true });
  const excluded = picomatch(
    [
      ...DEFAULT_EXCLUDE,
      ...(rules.includeTests ? [] : TEST_EXCLUDE),
      ...rules.exclude,
    ],
    { dot: true },
  );
  const files: string[] = [];
  const walk = (rel: string): void => {
    const abs = join(root, pkgRoot, rel);
    for (const e of readdirSync(abs, { withFileTypes: true })) {
      const childRel = rel === "" ? e.name : `${rel}/${e.name}`;
      const childAbs = join(abs, e.name);
      if (
        e.isDirectory() ||
        (rules.followSymlinks && isLinkToDir(e, childAbs))
      ) {
        // The probe name lets `**/dist/**` prune the directory itself.
        if (!excluded(`${childRel}/_`)) walk(childRel);
        continue;
      }
      const regular =
        e.isFile() || (rules.followSymlinks && e.isSymbolicLink());
      if (!regular || excluded(childRel) || !included(childRel)) continue;
      const repoRel = pkgRoot === "." ? childRel : `${pkgRoot}/${childRel}`;
      if (statSync(childAbs).size > rules.maxBytes) {
        report.push({ code: "core.file-too-large", file: repoRel });
      } else files.push(repoRel);
    }
  };
  walk("");
  return files.sort(byCodeUnit);
}

/**
 * Finds the packages to analyse and the files in each (docs/config.md 2.1, 2.2, 2.7).
 * Output is sorted and repository-relative, so it does not depend on the working directory.
 */
export function discoverPackages(
  root: string,
  config: Config = {},
): DiscoveryResult {
  const entries: PackageEntry[] = config.packages
    ? config.packages.map((p) => (typeof p === "string" ? { path: p } : p))
    : (() => {
        const ws = expandWorkspaces(root, workspacePatterns(root));
        return (ws.length > 0 ? ws : ["."]).map((path) => ({ path }));
      })();

  const report: DiscoveryReportEntry[] = [];
  const names = new Set<string>();
  const packages: PackageInfo[] = [];
  const analysis = config.analysis ?? {};

  for (const p of entries) {
    const pkgRoot = cleanGlob(p.path) || ".";
    const pkgName = readJson(join(root, pkgRoot, "package.json"))?.name;
    const name =
      p.name ??
      (typeof pkgName === "string" ? pkgName : undefined) ??
      basename(pkgRoot === "." ? root : pkgRoot);
    if (names.has(name)) throw new DuplicatePackageNameError(name);
    names.add(name);

    const own = pkgRoot === "." ? "tsconfig.json" : `${pkgRoot}/tsconfig.json`;
    const tsconfig =
      p.tsconfig ??
      (isFile(join(root, own))
        ? own
        : isFile(join(root, "tsconfig.base.json"))
          ? "tsconfig.base.json"
          : null);

    const files = collectFiles(
      root,
      pkgRoot,
      {
        include: p.include ?? config.include ?? DEFAULT_INCLUDE,
        exclude: [...(config.exclude ?? []), ...(p.exclude ?? [])],
        includeTests: analysis.includeTests ?? false,
        maxBytes: (analysis.maxFileSizeKb ?? 1024) * 1024,
        followSymlinks: analysis.followSymlinks ?? false,
      },
      report,
    );
    packages.push({
      name,
      root: pkgRoot,
      tsconfig,
      files,
      ...(p.extractors ? { extractors: p.extractors } : {}),
    });
  }

  packages.sort((a, b) => byCodeUnit(a.name, b.name));
  report.sort((a, b) => byCodeUnit(a.file, b.file));
  return { packages, report };
}
