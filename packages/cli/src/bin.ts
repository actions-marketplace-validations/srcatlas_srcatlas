#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { run } from "./main.js";

// Questions go to stderr, so stdout stays clean for data. Without a terminal there is no one to ask.
const interactive = process.stdin.isTTY && process.stderr.isTTY;
const rl = interactive
  ? createInterface({ input: process.stdin, output: process.stderr })
  : undefined;

process.exitCode = await run(process.argv.slice(2), {
  cwd: process.cwd(),
  env: process.env,
  out: (s) => process.stdout.write(s),
  err: (s) => process.stderr.write(s),
  ...(rl
    ? {
        ask: async (question: string) =>
          /^y(es)?$/i.test((await rl.question(`${question} [y/N] `)).trim()),
      }
    : {}),
});
rl?.close();
