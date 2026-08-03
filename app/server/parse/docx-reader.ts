/**
 * .docx -> flat block stream, preserving list identity.
 *
 * Word's numbering (`numId`) is what binds list items to the lead-in sentence
 * above them, and that association is the backbone of the whole parse — so it has
 * to survive into the block stream. Document order matters too, hence
 * `preserveOrder` on the XML parser.
 */
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";

export interface Block {
  index: number;
  kind: "para" | "table";
  text: string;
  style: string;
  numId: string | null;
  level: number;
  rows: string[][];
  isListItem: boolean;
}

/** Not every author uses Word's list numbering — some type the glyph directly. */
const BULLET_RE = /^\s*[•▪●○◦‣⁃]\s+/;
const SYNTHETIC_NUM_ID = "bullet";

type El = Record<string, any>;

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: false,
  // Word splits "PART 12" across runs, so the "12" arrives as its own text node.
  // Left on, the parser coerces it to a number and the digits vanish from the heading.
  parseTagValue: false,
  parseAttributeValue: false,
});

function tagOf(el: El): string {
  for (const k of Object.keys(el)) if (k !== ":@") return k;
  return "";
}

function kidsOf(el: El): El[] {
  const t = tagOf(el);
  const v = el[t];
  return Array.isArray(v) ? v : [];
}

function attrsOf(el: El): Record<string, string> {
  return (el[":@"] as Record<string, string>) ?? {};
}

function findChild(el: El, tag: string): El | undefined {
  return kidsOf(el).find((k) => tagOf(k) === tag);
}

/** Concatenate every `w:t` beneath this element, in order. */
function allText(el: El): string {
  const tag = tagOf(el);
  if (tag === "w:t") {
    return kidsOf(el)
      .map((k) => (k["#text"] === undefined || k["#text"] === null ? "" : String(k["#text"])))
      .join("");
  }
  if (tag === "w:tab") return " ";
  if (tag === "w:br") return " ";
  return kidsOf(el).map(allText).join("");
}

function styleOf(p: El): string {
  const pPr = findChild(p, "w:pPr");
  if (!pPr) return "";
  const pStyle = findChild(pPr, "w:pStyle");
  return pStyle ? (attrsOf(pStyle)["@_w:val"] ?? "") : "";
}

function numberingOf(p: El): { numId: string | null; level: number } {
  const pPr = findChild(p, "w:pPr");
  if (!pPr) return { numId: null, level: 0 };
  const numPr = findChild(pPr, "w:numPr");
  if (!numPr) return { numId: null, level: 0 };
  const numId = findChild(numPr, "w:numId");
  const ilvl = findChild(numPr, "w:ilvl");
  return {
    numId: numId ? (attrsOf(numId)["@_w:val"] ?? null) : null,
    level: ilvl ? Number(attrsOf(ilvl)["@_w:val"] ?? 0) : 0,
  };
}

function tableRows(tbl: El): string[][] {
  const rows: string[][] = [];
  for (const tr of kidsOf(tbl)) {
    if (tagOf(tr) !== "w:tr") continue;
    const cells: string[] = [];
    for (const tc of kidsOf(tr)) {
      if (tagOf(tc) !== "w:tc") continue;
      cells.push(allText(tc).replace(/\s+/g, " ").trim());
    }
    if (cells.length) rows.push(cells);
  }
  return rows;
}

function makeBlock(partial: Partial<Block> & { index: number; kind: Block["kind"] }): Block {
  return {
    text: "",
    style: "",
    numId: null,
    level: 0,
    rows: [],
    isListItem: false,
    ...partial,
  };
}

export async function readDocxBlocks(buffer: Buffer): Promise<Block[]> {
  const zip = await JSZip.loadAsync(buffer);
  const entry = zip.file("word/document.xml");
  if (!entry) throw new Error("Not a Word document: word/document.xml is missing");

  const xml = await entry.async("string");
  const tree = parser.parse(xml) as El[];

  const doc = tree.find((el) => tagOf(el) === "w:document");
  const body = doc ? findChild(doc, "w:body") : undefined;
  if (!body) return [];

  const blocks: Block[] = [];
  for (const el of kidsOf(body)) {
    const tag = tagOf(el);

    if (tag === "w:p") {
      let text = allText(el).replace(/\s+/g, " ").trim();
      if (!text) continue;
      let { numId, level } = numberingOf(el);
      if (numId === null && BULLET_RE.test(text)) {
        text = text.replace(BULLET_RE, "");
        numId = SYNTHETIC_NUM_ID;
      }
      blocks.push(
        makeBlock({
          index: blocks.length,
          kind: "para",
          text,
          style: styleOf(el),
          numId,
          level,
          isListItem: numId !== null,
        }),
      );
      continue;
    }

    if (tag === "w:tbl") {
      const rows = tableRows(el);
      if (rows.length) {
        blocks.push(makeBlock({ index: blocks.length, kind: "table", rows }));
      }
    }
  }

  return blocks;
}
