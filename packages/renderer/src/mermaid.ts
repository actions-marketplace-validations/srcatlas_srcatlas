import { cmp, compareEdges, type DiffFile, type Edge } from "@srcatlas/core";

export interface MermaidOptions {
  /** Cap on nodes drawn. Default 40. */
  maxNodes?: number;
}

const CLASS_DEFS = [
  "classDef added fill:#d1fae5,stroke:#059669,color:#064e3b",
  "classDef removed fill:#fee2e2,stroke:#dc2626,color:#7f1d1d,stroke-dasharray:4 3",
  "classDef changed fill:#fef3c7,stroke:#d97706,color:#78350f",
  "classDef moved fill:#e0e7ff,stroke:#4f46e5,color:#312e81",
  "classDef context fill:#f3f4f6,stroke:#9ca3af,color:#374151",
];

// A line break ends a Mermaid label, so it becomes a space. `#` goes first, so the entity
// codes written by the later replacements keep theirs. The backtick cannot end a fenced
// block once it is an entity code.
const entityEscape = (s: string): string =>
  s
    .replaceAll(/\r\n|\r|\n/g, " ")
    .replaceAll("#", "#35;")
    .replaceAll("&", "#amp;")
    .replaceAll('"', "#quot;")
    .replaceAll("<", "#lt;")
    .replaceAll(">", "#gt;")
    .replaceAll("|", "#124;")
    .replaceAll("`", "#96;");

interface Shown {
  label: string;
  cls: string;
  weight: number;
}

/**
 * Mermaid flowchart of the changed neighbourhood of a diff (docs/cli.md section 3.4.1).
 * Returns an empty string when the diff has nothing to draw.
 */
export function renderMermaid(
  diff: DiffFile,
  { maxNodes = 40 }: MermaidOptions = {},
): string {
  if (!Number.isInteger(maxNodes) || maxNodes < 1) {
    throw new RangeError(
      `maxNodes must be a positive integer, got ${maxNodes}`,
    );
  }

  const shown = new Map<string, Shown>();
  const listed = [
    ...diff.nodes.added.map((n) => [n, "added"] as const),
    ...diff.nodes.removed.map((n) => [n, "removed"] as const),
    ...diff.nodes.changed.map((c) => [c.after, "changed"] as const),
    ...diff.nodes.moved.map((m) => [m.to, "moved"] as const),
  ];
  for (const [n, cls] of listed) {
    shown.set(n.id, { label: n.name, cls, weight: 1 });
  }

  const edges: [Edge, string][] = [
    ...diff.edges.added.map((e): [Edge, string] => [e, "-->"]),
    ...diff.edges.removed.map((e): [Edge, string] => [e, "-.->"]),
    ...diff.edges.changed.map((c): [Edge, string] => [c.after, "==>"]),
  ];
  for (const [e] of edges) {
    for (const id of [e.from, e.to]) {
      const s = shown.get(id) ?? { label: id, cls: "context", weight: 0 };
      s.weight += 1;
      shown.set(id, s);
    }
  }
  if (shown.size === 0) return "";

  const kept = [...shown.keys()]
    .sort(
      (a, b) =>
        (shown.get(b)?.weight ?? 0) - (shown.get(a)?.weight ?? 0) || cmp(a, b),
    )
    .slice(0, maxNodes)
    .sort(cmp);
  const name = new Map(kept.map((id, i) => [id, `n${i}`]));

  const lines = ["flowchart LR"];
  for (const id of kept) {
    const s = shown.get(id);
    if (s)
      lines.push(`  ${name.get(id)}["${entityEscape(s.label)}"]:::${s.cls}`);
  }
  const omitted = shown.size - kept.length;
  if (omitted > 0) lines.push(`  more["+${omitted} more"]:::context`);
  for (const [e, arrow] of edges.sort((a, b) => compareEdges(a[0], b[0]))) {
    const from = name.get(e.from);
    const to = name.get(e.to);
    if (from && to)
      lines.push(`  ${from} ${arrow}|"${entityEscape(e.kind)}"| ${to}`);
  }
  for (const def of CLASS_DEFS) lines.push(`  ${def}`);
  return `${lines.join("\n")}\n`;
}
