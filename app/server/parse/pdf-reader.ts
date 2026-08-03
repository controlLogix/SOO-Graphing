/**
 * PDF -> block stream.
 *
 * Best-effort by nature: PDF has no list structure, so the `numId` grouping the
 * DOCX path relies on has to be reconstructed from bullet glyphs and left-edge
 * indentation. Prefer DOCX sources where they exist.
 */
import type { Block } from "./docx-reader.js";

const BULLET_RE = /^\s*[•▪●○◦‣⁃·\-–]\s+/;
const ORDINAL_RE = /^\s*(?:\(?[a-z]\)|\(?\d+[.)])\s+/i;
const PART_RE = /^PART\s*\d+\s*[-–—]/i;
const TERMINAL_RE = /[.:;?!]$/;

interface Line {
  text: string;
  x: number;
  y: number;
  page: number;
}

function toLines(items: { str: string; transform: number[] }[], page: number): Line[] {
  const byRow = new Map<number, { x: number; str: string }[]>();
  for (const item of items) {
    if (!item.str || !item.str.trim()) continue;
    const x = item.transform[4];
    const y = Math.round(item.transform[5] * 2) / 2;
    if (!byRow.has(y)) byRow.set(y, []);
    byRow.get(y)!.push({ x, str: item.str });
  }

  const lines: Line[] = [];
  for (const [y, cells] of byRow) {
    cells.sort((a, b) => a.x - b.x);
    const text = cells.map((c) => c.str).join("").replace(/\s+/g, " ").trim();
    if (!text) continue;
    lines.push({ text, x: cells[0].x, y, page });
  }
  // PDF y grows upward, so descending y is reading order.
  lines.sort((a, b) => b.y - a.y);
  return lines;
}

/** The most common left edge is the body margin; anything further in is a list. */
function bodyMargin(lines: Line[]): number {
  const counts = new Map<number, number>();
  for (const l of lines) {
    const bucket = Math.round(l.x / 4) * 4;
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  let best = 0;
  let bestCount = -1;
  for (const [bucket, count] of counts) {
    if (count > bestCount) {
      best = bucket;
      bestCount = count;
    }
  }
  return best;
}

export async function readPdfBlocks(buffer: Buffer): Promise<Block[]> {
  // The legacy build is the one that runs under Node without a DOM.
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    isEvalSupported: false,
  }).promise;

  const lines: Line[] = [];
  for (let p = 1; p <= doc.numPages; p += 1) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    lines.push(...toLines(content.items as any[], p));
  }
  await doc.destroy();

  if (!lines.length) return [];

  const margin = bodyMargin(lines);
  const blocks: Block[] = [];
  let bulletRun = 0;
  let inRun = false;

  for (const line of lines) {
    const isBullet =
      BULLET_RE.test(line.text) || ORDINAL_RE.test(line.text) || line.x > margin + 10;
    const isPart = PART_RE.test(line.text);
    const text = line.text.replace(BULLET_RE, "").replace(ORDINAL_RE, "").trim();
    if (!text) continue;

    if (isPart) {
      inRun = false;
      blocks.push(block(blocks.length, text, null));
      continue;
    }

    if (isBullet) {
      if (!inRun) {
        bulletRun += 1;
        inRun = true;
      }
      blocks.push(block(blocks.length, text, `pdf${bulletRun}`));
      continue;
    }

    inRun = false;
    // Merge wrapped continuation lines back into the paragraph above.
    const prev = blocks[blocks.length - 1];
    if (
      prev &&
      prev.kind === "para" &&
      !prev.isListItem &&
      !TERMINAL_RE.test(prev.text) &&
      !PART_RE.test(prev.text) &&
      /^[a-z(]/.test(text)
    ) {
      prev.text = `${prev.text} ${text}`.replace(/\s+/g, " ");
      continue;
    }
    blocks.push(block(blocks.length, text, null));
  }

  return blocks;
}

function block(index: number, text: string, numId: string | null): Block {
  return {
    index,
    kind: "para",
    text,
    style: "",
    numId,
    level: 0,
    rows: [],
    isListItem: numId !== null,
  };
}
