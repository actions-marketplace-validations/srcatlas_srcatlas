import {
  mkdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

export interface OutputFile {
  path: string;
  content: string;
}

const isDirectory = (path: string): boolean => {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
};

/**
 * Writes files via a temp file in the same directory and a rename (docs/cli.md 3.2), so a
 * failed run leaves the previous files untouched. Every temp file is written, and every
 * target checked, before the first rename; a rename that still fails (disk, permissions)
 * can leave the files from before and after the run mixed, which the CLI reports as an error.
 */
export function writeOutputs(files: OutputFile[]): void {
  const temps: string[] = [];
  try {
    for (const f of files) {
      if (isDirectory(f.path)) {
        throw new Error(`cannot write ${f.path}: it is a directory`);
      }
      mkdirSync(dirname(f.path), { recursive: true });
      const temp = `${f.path}.${process.pid}.${temps.length}.tmp`;
      temps.push(temp);
      writeFileSync(temp, f.content);
    }
    files.forEach((f, i) => {
      renameSync(temps[i] as string, f.path);
    });
  } catch (e) {
    for (const t of temps) rmSync(t, { force: true });
    throw e;
  }
}
