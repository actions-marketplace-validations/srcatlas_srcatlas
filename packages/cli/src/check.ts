import { existsSync, readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { writeOutputs } from "@srcatlas/analyzer";
import {
  type AcceptedEntry,
  AcceptedFile,
  acceptedKey,
  type Confidence,
  type Config,
  type Json,
  type Rule,
  serializeAccepted,
  sortKeys,
} from "@srcatlas/core";
import {
  applyAccepted,
  evaluateRules,
  recordAccepted,
  toEntry,
  type Violation,
} from "@srcatlas/rules";
import { UsageError } from "./errors.js";
import { analyzeInMemory, readGraphFile } from "./graph-source.js";

export interface CheckFlags {
  format?: string | undefined;
  "min-confidence"?: string | undefined;
  accepted?: string | undefined;
  accept?: boolean | undefined;
  add?: boolean | undefined;
  quiet?: boolean | undefined;
}

interface Io {
  out: (s: string) => void;
  err: (s: string) => void;
}

const FORMATS = ["text", "json", "github"];
const LEVELS = ["certain", "inferred", "unresolved"];
const DEFAULT_ACCEPTED = "srcatlas.accepted.json";

const plural = (n: number, noun: string): string =>
  `${n} ${noun}${n === 1 ? "" : "s"}`;

const describeEntry = (e: AcceptedEntry): string =>
  "members" in e
    ? `${e.rule} ${e.over}: ${e.members.join(", ")}`
    : `${e.rule} ${e.from} ${e.edgeKind} ${e.to}`;

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

/** The accepted-violations file, or undefined when there is none (docs/cli.md 3.5.2). */
function readAccepted(
  file: string,
  shown: string,
  explicit: boolean,
  writing: boolean,
): AcceptedEntry[] | undefined {
  if (!existsSync(file)) {
    if (explicit && !writing) {
      throw new UsageError(`accepted file not found: ${shown}`);
    }
    return undefined;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    throw new UsageError(`${shown}: not valid JSON`);
  }
  const parsed = AcceptedFile.safeParse(raw);
  if (!parsed.success) {
    throw new UsageError(
      `${shown}: not an accepted-violations file (version 1): ${parsed.error.issues[0]?.message ?? "invalid"}`,
    );
  }
  return parsed.data.violations;
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
  if (flags.add && !flags.accept) {
    throw new UsageError("--add only makes sense with --accept");
  }
  if (flags.accept && level !== "inferred") {
    throw new UsageError(
      `--accept needs --min-confidence inferred (the default), got "${level}"`,
    );
  }

  const acceptedFile = resolve(root, flags.accepted ?? DEFAULT_ACCEPTED);
  const shown = relative(root, acceptedFile).replaceAll("\\", "/");
  let entries = readAccepted(
    acceptedFile,
    shown,
    flags.accepted !== undefined,
    flags.accept === true,
  );

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
  const evaluation = evaluateRules(graph, rules, {
    minConfidence: level as Confidence,
  });
  if (!flags.quiet) {
    for (const w of evaluation.warnings) io.err(`warning: ${w}\n`);
  }

  if (flags.accept) {
    const before = new Set((entries ?? []).map(acceptedKey));
    const next = recordAccepted(
      evaluation.violations,
      entries,
      flags.add === true,
    );
    const after = new Set(next.map(acceptedKey));
    writeOutputs([{ path: acceptedFile, content: serializeAccepted(next) }]);
    if (!flags.quiet) {
      const added = [...after].filter((k) => !before.has(k)).length;
      const kept = [...after].filter((k) => before.has(k)).length;
      const removed = [...before].filter((k) => !after.has(k)).length;
      io.err(`${shown}: ${added} added, ${kept} kept, ${removed} removed\n`);
      const left = evaluation.violations.filter(
        (v) => !after.has(acceptedKey(toEntry(v))),
      ).length;
      if (left > 0) {
        io.err(
          `${plural(left, "new violation")} not recorded; use --accept --add to record them\n`,
        );
      }
    }
    entries = next;
  }

  let violations = evaluation.violations;
  if (entries) {
    const split = applyAccepted(violations, entries);
    violations = split.fresh;
    if (!flags.quiet) {
      if (split.accepted.length > 0) {
        io.err(
          `${plural(split.accepted.length, "accepted violation")} not shown\n`,
        );
      }
      for (const e of split.stale) {
        io.err(
          `warning: accepted violation no longer occurs: ${describeEntry(e)} (run srcatlas check --accept to remove it)\n`,
        );
      }
    }
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
