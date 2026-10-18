import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import {
  type Confidence,
  type Config,
  type Json,
  type Rule,
  sortKeys,
} from "@srcatlas/core";
import { evaluateRules, type Violation } from "@srcatlas/rules";
import { UsageError } from "./errors.js";
import { analyzeInMemory, readGraphFile } from "./graph-source.js";

export interface CheckFlags {
  format?: string | undefined;
  "min-confidence"?: string | undefined;
  quiet?: boolean | undefined;
}

interface Io {
  out: (s: string) => void;
  err: (s: string) => void;
}

const FORMATS = ["text", "json", "github"];
const LEVELS = ["certain", "inferred", "unresolved"];

const plural = (n: number, noun: string): string =>
  `${n} ${noun}${n === 1 ? "" : "s"}`;

// GitHub workflow commands: data escapes %, CR, LF; property values also : and ,.
const escapeData = (s: string): string =>
  s.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
const escapeProperty = (s: string): string =>
  escapeData(s).replaceAll(":", "%3A").replaceAll(",", "%2C");

function formatText(violations: Violation[]): string {
  const lines = violations.flatMap((v) => [
    `${v.severity} ${v.rule}: ${v.message}`,
    ...v.sites.map((s) => `  at ${s.file}:${s.line}`),
  ]);
  const errors = violations.filter((v) => v.severity === "error").length;
  lines.push(
    `${plural(errors, "error")}, ${plural(violations.length - errors, "warning")}`,
  );
  return `${lines.join("\n")}\n`;
}

function formatGithub(violations: Violation[]): string {
  return violations
    .flatMap((v) => {
      const level = v.severity === "error" ? "error" : "warning";
      const title = `title=${escapeProperty(v.rule)}`;
      const message = escapeData(v.message);
      if (v.sites.length === 0) return [`::${level} ${title}::${message}`];
      return v.sites.map(
        (s) =>
          `::${level} file=${escapeProperty(s.file)},line=${s.line},${title}::${message}`,
      );
    })
    .map((l) => `${l}\n`)
    .join("");
}

/** `srcatlas check [graph]` (docs/cli.md 3.5). Returns the exit code. */
export async function checkCommand(
  root: string,
  config: Config,
  inputs: string[],
  flags: CheckFlags,
  version: string,
  io: Io,
): Promise<number> {
  if (inputs.length > 1) {
    throw new UsageError("usage: srcatlas check [graph]");
  }
  const format = flags.format ?? "text";
  if (!FORMATS.includes(format)) {
    throw new UsageError(
      `--format must be one of ${FORMATS.join(", ")}, got "${format}"`,
    );
  }
  const level = flags["min-confidence"] ?? "inferred";
  if (!LEVELS.includes(level)) {
    throw new UsageError(
      `--min-confidence must be certain, inferred or unresolved, got "${level}"`,
    );
  }

  const [input] = inputs;
  let graph: Awaited<ReturnType<typeof analyzeInMemory>>;
  if (input !== undefined) {
    const file = resolve(root, input);
    if (!existsSync(file) || !statSync(file).isFile()) {
      throw new UsageError(`graph file not found: ${input}`);
    }
    graph = readGraphFile(file, input);
  } else {
    graph = await analyzeInMemory({ root, config, version });
  }

  const rules: Rule[] = config.rules ?? [];
  if (rules.length === 0 && !flags.quiet) {
    io.err("no rules configured\n");
  }
  const { violations, warnings } = evaluateRules(graph, rules, {
    minConfidence: level as Confidence,
  });
  if (!flags.quiet) {
    for (const w of warnings) io.err(`warning: ${w}\n`);
  }

  io.out(
    format === "json"
      ? `${JSON.stringify(sortKeys(violations as unknown as Json), null, 2)}\n`
      : format === "github"
        ? formatGithub(violations)
        : formatText(violations),
  );
  return violations.some((v) => v.severity === "error") ? 1 : 0;
}
