import type { DiffFile } from "@srcatlas/core";
import { formatSummary } from "@srcatlas/differ";
import { renderMermaid } from "@srcatlas/renderer";

/** Items shown per list in the comment (docs/cli.md 3.4.2). */
const LIST_CAP = 50;

const hasEntries = (d: DiffFile): boolean =>
  Object.values(d.nodes).some((l) => l.length > 0) ||
  Object.values(d.edges).some((l) => l.length > 0);

/**
 * A Markdown code span that holds `s` whatever it contains: a delimiter longer than the
 * longest run of backticks inside, padded when `s` starts or ends with one, and line breaks
 * turned into spaces. Names from analysed code are untrusted (docs/cli.md 3.4.2).
 */
function code(s: string): string {
  const text = s.replaceAll(/\r\n|\r|\n/g, " ");
  const longest = Math.max(
    0,
    ...[...text.matchAll(/`+/g)].map((m) => m[0].length),
  );
  const fence = "`".repeat(longest + 1);
  const pad = text.startsWith("`") || text.endsWith("`") ? " " : "";
  return `${fence}${pad}${text}${pad}${fence}`;
}

/** An edge kind is plain text when it looks like one, a code span otherwise. */
const kindText = (kind: string): string =>
  /^[a-z_]+$/.test(kind) ? kind : code(kind);

function list(title: string, items: string[]): string {
  const shown = items.slice(0, LIST_CAP).map((i) => `- ${i}`);
  if (items.length > LIST_CAP) {
    shown.push(`- and ${items.length - LIST_CAP} more`);
  }
  return `${title}\n\n${shown.join("\n")}`;
}

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
    blocks.push(
      list(
        "New cross-module edges:",
        d.crossModuleEdges.map(
          (x) => `${code(x.from)} ${kindText(x.kind)} ${code(x.to)}`,
        ),
      ),
    );
  }
  if (d.cycles.length > 0) {
    blocks.push(
      list(
        "New cycles:",
        d.cycles.map((c) => `${c.kind}: ${c.members.map(code).join(", ")}`),
      ),
    );
  }
  blocks.push(`\`\`\`mermaid\n${renderMermaid(d, { maxNodes })}\`\`\``);
  return `${blocks.join("\n\n")}\n`;
}
