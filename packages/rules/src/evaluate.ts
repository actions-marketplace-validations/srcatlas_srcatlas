import type { Confidence, GraphFile, Rule, Site } from "@srcatlas/core";

export type Violation = {
  rule: string;
  severity: "error" | "warn";
  message: string;
  sites: Site[];
} & (
  | { from: string; to: string; edgeKind: string }
  | { over: "modules" | "packages"; members: string[] }
);

export interface Evaluation {
  violations: Violation[];
  /** Stale exceptions and rules that are not evaluated yet (docs/config.md 2.4). */
  warnings: string[];
}

/** Evaluates rules against a graph (docs/config.md 2.4). `minConfidence` is the `check --min-confidence` level. */
export function evaluateRules(
  _graph: GraphFile,
  _rules: Rule[],
  _opts: { minConfidence?: Confidence } = {},
): Evaluation {
  throw new Error("not implemented");
}
