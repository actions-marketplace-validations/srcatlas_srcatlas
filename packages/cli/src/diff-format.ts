import type { DiffFile } from "@srcatlas/core";
import { formatSummary } from "@srcatlas/differ";
import { renderMermaid } from "@srcatlas/renderer";

const hasEntries = (d: DiffFile): boolean =>
  Object.values(d.nodes).some((l) => l.length > 0) ||
  Object.values(d.edges).some((l) => l.length > 0);

/** `--format text` (docs/cli.md 3.4.2). For people; scripts use json. */
export function formatText(d: DiffFile): string {
  const lines = [formatSummary(d.summary), ""];
  const node = (sign: string, n: { kind: string; id: string }) =>
    lines.push(`${sign} ${n.kind} ${n.id}`);
  const edge = (sign: string, e: { from: string; kind: string; to: string }) =>
    lines.push(`${sign} ${e.from} ${e.kind} ${e.to}`);
  for (const n of d.nodes.added) node("+", n);
  for (const n of d.nodes.removed) node("-", n);
  for (const c of d.nodes.changed) node("~", c.after);
  for (const m of d.nodes.moved) {
    lines.push(`> ${m.to.kind} ${m.from.id} -> ${m.to.id}`);
  }
  for (const e of d.edges.added) edge("+", e);
  for (const e of d.edges.removed) edge("-", e);
  for (const c of d.edges.changed) edge("~", c.after);
  if (d.crossModuleEdges.length > 0) {
    lines.push("", "New cross-module edges:");
    for (const e of d.crossModuleEdges) {
      lines.push(`  ${e.from} ${e.kind} ${e.to}`);
    }
  }
  if (d.cycles.length > 0) {
    lines.push("", "New cycles:");
    for (const c of d.cycles) {
      lines.push(`  ${c.kind}: ${c.members.join(", ")}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

/** `--format markdown`: the pull request comment body, or "" when nothing changed. */
export function formatMarkdown(d: DiffFile, maxNodes: number): string {
  if (!hasEntries(d)) return "";
  const n = d.nodes;
  const e = d.edges;
  const blocks = [
    "### Architecture changes",
    formatSummary(d.summary),
    [
      "| | Added | Removed | Changed | Moved |",
      "|---|---:|---:|---:|---:|",
      `| Nodes | ${n.added.length} | ${n.removed.length} | ${n.changed.length} | ${n.moved.length} |`,
      `| Edges | ${e.added.length} | ${e.removed.length} | ${e.changed.length} | - |`,
    ].join("\n"),
  ];
  if (d.crossModuleEdges.length > 0) {
    const items = d.crossModuleEdges.map(
      (x) => `- \`${x.from}\` ${x.kind} \`${x.to}\``,
    );
    blocks.push(`New cross-module edges:\n\n${items.join("\n")}`);
  }
  if (d.cycles.length > 0) {
    const items = d.cycles.map(
      (c) => `- ${c.kind}: ${c.members.map((m) => `\`${m}\``).join(", ")}`,
    );
    blocks.push(`New cycles:\n\n${items.join("\n")}`);
  }
  blocks.push(`\`\`\`mermaid\n${renderMermaid(d, { maxNodes })}\`\`\``);
  return `${blocks.join("\n\n")}\n`;
}
