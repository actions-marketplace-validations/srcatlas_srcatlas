import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { NotImplementedError, UsageError } from "./errors.js";
import { loadConfig } from "./load-config.js";

const COMMANDS = ["init", "analyze", "serve", "diff", "check", "export"];

const HELP = `srcatlas <command> [path] [flags]

Commands:
  ${COMMANDS.join(", ")}

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
    // Every command builds on the validated config, so an invalid one is exit 2 for all.
    await loadConfig(resolve(io.cwd, path), values.config);
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
