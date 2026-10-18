import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { analyzeCommand } from "./analyze.js";
import { checkCommand } from "./check.js";
import { diffCommand } from "./diff.js";
import { NotImplementedError, UsageError } from "./errors.js";
import { initCommand } from "./init.js";
import { loadConfig } from "./load-config.js";

const COMMANDS = ["init", "analyze", "serve", "diff", "check", "export"];

const HELP = `srcatlas <command> [path] [flags]

Commands:
  ${COMMANDS.join(", ")}

init flags:
  -y, --yes         accept all prompts
  --no-workflow     do not offer the GitHub workflow file
  --force           overwrite an existing srcatlas.config.ts or workflow

analyze flags:
  -o, --out <file>  graph output path, or - for stdout
  --report <file>   report output path
  --strict          exit 1 on parse errors or unresolved constructs
  --workers <n>     worker pool size (env SRCATLAS_WORKERS)
  --only <name>     run only this extractor (repeatable)
  --json            print the summary as JSON on stdout

diff flags (srcatlas diff <base> <head>; an input is a git ref, a graph file, or WORKTREE as head):
  -o, --out <file>      diff file path (default .srcatlas/srcatlas.diff.json)
  --format <f>          text (default), json, markdown, mermaid
  --fail-on <cond>      exit 1 on new-cycle, new-cross-module-edge, removed-node, any-change (repeatable)
  --min-confidence <c>  certain, inferred (default), unresolved
  --max-nodes <n>       cap on nodes in the Mermaid graph (default 40)

check flags (srcatlas check [graph]; without a graph, analyses first):
  --format <f>          text (default), json, github
  --min-confidence <c>  certain, inferred (default), unresolved
  --accepted <file>     accepted-violations file (default srcatlas.accepted.json)
  --accept              write the accepted-violations file: create it, or drop entries that no longer occur
  --add                 with --accept: also record violations that are not in the file

Global flags:
  --config <file>   config file (default: srcatlas.config.ts in the root)
  --quiet           errors only
  --verbose         extra diagnostics on stderr
  --no-color        disable colour
  --version         print the version
  --help            print this help

Exit codes: 0 success, 1 findings, 2 usage or config error, 3 internal error.
`;

const ISSUES = "https://github.com/srcatlas/srcatlas/issues";

export interface Io {
  cwd: string;
  out: (s: string) => void;
  err: (s: string) => void;
  /** Environment variables (docs/cli.md section 4). Absent means none are set. */
  env?: Record<string, string | undefined>;
  /** Asks a yes/no question; absent when there is no terminal to ask on. */
  ask?: (question: string) => Promise<boolean>;
}

const version = (): string =>
  (
    JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { version: string }
  ).version;

const isParseArgsError = (e: unknown): e is Error =>
  e instanceof Error &&
  "code" in e &&
  String((e as { code: unknown }).code).startsWith("ERR_PARSE_ARGS");

/** Runs the CLI and returns the exit code. Never calls `process.exit`. */
export async function run(argv: string[], io: Io): Promise<number> {
  try {
    const { values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: {
        config: { type: "string" },
        out: { type: "string", short: "o" },
        report: { type: "string" },
        strict: { type: "boolean" },
        workers: { type: "string" },
        only: { type: "string", multiple: true },
        json: { type: "boolean" },
        format: { type: "string" },
        "fail-on": { type: "string", multiple: true },
        "min-confidence": { type: "string" },
        "max-nodes": { type: "string" },
        accepted: { type: "string" },
        accept: { type: "boolean" },
        add: { type: "boolean" },
        yes: { type: "boolean", short: "y" },
        "no-workflow": { type: "boolean" },
        force: { type: "boolean" },
        quiet: { type: "boolean" },
        verbose: { type: "boolean" },
        "no-color": { type: "boolean" },
        version: { type: "boolean" },
        help: { type: "boolean" },
      },
    });
    if (values.version) {
      io.out(`${version()}\n`);
      return 0;
    }
    if (values.help) {
      io.out(HELP);
      return 0;
    }

    const [command, path = "."] = positionals;
    if (!command) throw new UsageError(`missing command\n\n${HELP}`);
    if (!COMMANDS.includes(command)) {
      throw new UsageError(`unknown command "${command}"\n\n${HELP}`);
    }
    // diff and check take inputs where the other commands take a path, so they run in the working directory.
    const root = resolve(
      io.cwd,
      command === "diff" || command === "check" ? "." : path,
    );
    // init writes the config, so it must work when the existing one is broken (with --force).
    if (command === "init") {
      return await initCommand(
        root,
        {
          yes: values.yes,
          noWorkflow: values["no-workflow"],
          force: values.force,
          quiet: values.quiet,
        },
        version(),
        { err: io.err, ask: io.ask },
      );
    }
    // Every other command builds on the validated config, so an invalid one is exit 2 for all.
    const config = await loadConfig(
      root,
      values.config ?? io.env?.SRCATLAS_CONFIG,
    );
    if (command === "analyze") {
      return await analyzeCommand(
        root,
        config,
        { ...values, quiet: values.quiet },
        version(),
        io,
      );
    }
    if (command === "check") {
      return await checkCommand(
        root,
        config,
        positionals.slice(1),
        { ...values, quiet: values.quiet },
        version(),
        io,
      );
    }
    if (command === "diff") {
      return await diffCommand(
        root,
        config,
        positionals.slice(1),
        { ...values, quiet: values.quiet },
        version(),
        io,
      );
    }
    throw new NotImplementedError(`srcatlas ${command}: not implemented yet`);
  } catch (e) {
    if (e instanceof UsageError || isParseArgsError(e)) {
      io.err(`srcatlas: ${(e as Error).message}\n`);
      return 2;
    }
    if (e instanceof NotImplementedError) {
      io.err(`${e.message}\n`);
      return 3;
    }
    io.err(
      `srcatlas: internal error: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}\nPlease report it: ${ISSUES}\n`,
    );
    return 3;
  }
}
