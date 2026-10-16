/** Bad flag, unknown command or invalid config: exit code 2 (docs/cli.md section 2). */
export class UsageError extends Error {}

/** A command that exists in docs/cli.md but is not built yet: exit code 3. */
export class NotImplementedError extends Error {}
