// docs/extractors/prisma.md section 2: just enough of a Prisma schema to find blocks and count
// the field lines of a model. Types, attributes and relations are not interpreted.

export interface Block {
  kind: string;
  name: string;
  /** Line of the header, 1-based. */
  line: number;
  /** Field lines of the block (meaningful for `model`). */
  fieldCount: number;
}

export interface ParsedSchema {
  blocks: Block[];
  /** Headers of blocks that could not be delimited (PR-S5). */
  malformed: { kind: string; name: string; line: number }[];
}

const HEADER =
  /^\s*(model|enum|type|view|datasource|generator)\s+([A-Za-z_]\w*)\s*\{/;

/**
 * Blanks out comments and string contents, keeping line breaks and column positions, so that a
 * brace inside either can never open or close a block (PR-S7). A string ends at its line.
 */
function mask(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const c = text.charAt(i);
    if (c === "/" && text.charAt(i + 1) === "/") {
      while (i < text.length && text.charAt(i) !== "\n") {
        out += text.charAt(i) === "\r" ? "\r" : " ";
        i++;
      }
    } else if (c === '"') {
      out += c;
      i++;
      while (i < text.length && !/["\n]/.test(text.charAt(i))) {
        if (text.charAt(i) === "\\") {
          out += " ";
          i++;
        }
        out += text.charAt(i) === "\r" ? "\r" : " ";
        i++;
      }
      if (text.charAt(i) === '"') {
        out += '"';
        i++;
      }
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

const count = (s: string, ch: string): number => s.split(ch).length - 1;

/** A field line has content other than braces, and is not a block attribute (`@@index`). */
const isField = (line: string): boolean => {
  const t = line.replace(/[{}]/g, "").trim();
  return t !== "" && !t.startsWith("@@");
};

export function parseSchema(text: string): ParsedSchema {
  const blocks: Block[] = [];
  const malformed: ParsedSchema["malformed"] = [];
  let open: (Block & { depth: number }) | undefined;

  const abandon = () => {
    if (open) {
      malformed.push({ kind: open.kind, name: open.name, line: open.line });
    }
    open = undefined;
  };

  mask(text)
    .split(/\r?\n/)
    .forEach((line, index) => {
      const header = HEADER.exec(line);
      if (header) {
        // A header inside an open block: that block never closed.
        abandon();
        const depth = count(line, "{") - count(line, "}");
        const block = {
          kind: header[1] ?? "",
          name: header[2] ?? "",
          line: index + 1,
          fieldCount: 0,
        };
        // Opened and closed on one line: the fields cannot be counted without guessing.
        if (depth <= 0) {
          malformed.push({
            kind: block.kind,
            name: block.name,
            line: block.line,
          });
        } else open = { ...block, depth };
        return;
      }
      if (!open) return;
      open.depth += count(line, "{") - count(line, "}");
      if (open.depth <= 0) {
        blocks.push({
          kind: open.kind,
          name: open.name,
          line: open.line,
          fieldCount: open.fieldCount,
        });
        open = undefined;
      } else if (isField(line)) open.fieldCount++;
    });
  abandon(); // the file ended inside a block
  return { blocks, malformed };
}
