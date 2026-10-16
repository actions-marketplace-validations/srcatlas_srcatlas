#!/usr/bin/env node
import { run } from "./main.js";

process.exitCode = await run(process.argv.slice(2), {
  cwd: process.cwd(),
  out: (s) => process.stdout.write(s),
  err: (s) => process.stderr.write(s),
});
