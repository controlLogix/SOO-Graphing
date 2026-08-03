/**
 * Document -> IR.
 *
 * Three passes, deliberately boring:
 *   1. structure  — split on `PART n –` text, not Word styles (there are none)
 *   2. grouping   — bind each numbered list to its lead-in via numId
 *   3. extraction — items become steps, carrying modality and conditionality
 */
import type { Block } from "./docx-reader.js";
import * as li from "./lead-in.js";
import * as spine from "./spine.js";
import {
  emptyDocument,
  type Finding,
  type Group,
  type Part,
  type Setpoint,
  type SooDocument,
  type Step,
} from "@shared/ir";

const PART_RE = /^PART\s*(\d+)\s*[-–—]\s*(.*)$/i;
const END_RE = /^END OF SECTION\s*$/i;
const NUM_RE = /-?\d+(?:\.\d+)?/;
const PLACEHOLDER_RE = /\[?_{2,}/;
const UNITS_RE = /(°?[FC]\b|degF|degC|psi|in\.?\s*w\.?c\.?|gpm|cfm|%|Pa|kPa|s\b|min\b)/i;

export function equipmentClassFromName(fileName: string): string {
  let stem = fileName.replace(/\.[^.]+$/, "");
  stem = stem.replace(/^\d+[a-z]?\.?\s*/i, "");
  stem = stem.replace(/^SOO\s*/i, "");
  stem = stem.replace(/[-–]\s*(old|REV\s*\d+)$/i, "");
  return stem.trim();
}

function splitParts(blocks: Block[]): Part[] {
  const parts: Part[] = [];
  for (const b of blocks) {
    if (b.kind !== "para") continue;
    if (END_RE.test(b.text)) break;
    const m = PART_RE.exec(b.text);
    if (!m) continue;
    const title = m[2].replace(/\s+/g, " ").trim();
    const archetype = spine.archetypeOf(title);
    if (parts.length) parts[parts.length - 1].blockEnd = b.index - 1;
    parts.push({
      n: Number(m[1]),
      title,
      archetype,
      isInventory: spine.isInventory(archetype),
      blockStart: b.index,
      blockEnd: 0,
      groups: [],
      statements: [],
    });
  }
  if (parts.length) {
    parts[parts.length - 1].blockEnd = blocks.length ? blocks[blocks.length - 1].index : 0;
  }
  return parts;
}

function partAt(parts: Part[], index: number): Part | null {
  return parts.find((p) => index >= p.blockStart && index <= p.blockEnd) ?? null;
}

function parseSetpoints(blocks: Block[], parts: Part[]): Setpoint[] {
  const out: Setpoint[] = [];
  for (const b of blocks) {
    if (b.kind !== "table" || !b.rows.length) continue;
    const header = b.rows[0].map((c) => c.toLowerCase());
    if (!header.some((c) => c.includes("setpoint"))) continue;
    const part = partAt(parts, b.index);
    for (const row of b.rows.slice(1)) {
      if (row.length < 2 || !row[0].trim()) continue;
      const name = row[0].trim();
      const raw = row[1].trim();
      const isPlaceholder = PLACEHOLDER_RE.test(raw) || raw === "";
      const num = NUM_RE.exec(raw);
      const units = UNITS_RE.exec(raw);
      out.push({
        id: name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 60),
        name,
        rawValue: raw,
        value: num && !isPlaceholder ? Number(num[0]) : null,
        units: units ? units[0].trim() : null,
        isPlaceholder,
        declaredInPart: part ? part.n : null,
      });
    }
  }
  return out;
}

function extractGroups(blocks: Block[], parts: Part[], doc: SooDocument): void {
  let gid = 0;
  let sid = 0;
  let i = 0;

  while (i < blocks.length) {
    const b = blocks[i];
    if (b.kind !== "para" || b.isListItem || PART_RE.test(b.text)) {
      i += 1;
      continue;
    }

    const part = partAt(parts, b.index);
    const partN = part ? part.n : null;

    // A lead-in owns the contiguous run of list items that follows it.
    const run: Block[] = [];
    let j = i + 1;
    if (j < blocks.length && blocks[j].kind === "para" && blocks[j].isListItem) {
      const numId = blocks[j].numId;
      while (j < blocks.length && blocks[j].kind === "para" && blocks[j].numId === numId) {
        run.push(blocks[j]);
        j += 1;
      }
    }

    if (run.length && li.isLeadIn(b.text)) {
      gid += 1;
      const group: Group = {
        id: `G${gid}`,
        part: partN,
        leadIn: b.text,
        operator: part?.isInventory ? "INVENTORY" : li.classify(b.text),
        modality: li.modalityOf(b.text),
        delay: li.delayOf(b.text),
        condition: li.conditionOf(b.text),
        items: [],
        source: { part: partN, block: b.index },
      };
      for (const item of run) {
        sid += 1;
        const step: Step = {
          id: `S${sid}`,
          text: item.text,
          part: partN,
          group: group.id,
          modality: li.modalityOf(item.text) ?? group.modality,
          condition: li.conditionOf(item.text) ?? group.condition,
          source: { part: partN, block: item.index },
        };
        doc.steps.push(step);
        group.items.push(step.id);
      }
      doc.groups.push(group);
      part?.groups.push(group.id);
      i = j;
      continue;
    }

    if (run.length && !li.isLeadIn(b.text)) {
      doc.findings.push({
        rule: "list_without_lead_in",
        severity: "warning",
        message: `Numbered list has no colon lead-in above it: "${b.text.slice(0, 70)}"`,
        part: partN,
        block: b.index,
      });
    }

    sid += 1;
    const step: Step = {
      id: `S${sid}`,
      text: b.text,
      part: partN,
      group: null,
      modality: li.modalityOf(b.text),
      condition: li.conditionOf(b.text),
      source: { part: partN, block: b.index },
    };
    doc.steps.push(step);
    part?.statements.push(step.id);
    i += 1;
  }
}

/**
 * A list item that lost its numbering reads as body prose and mis-parses.
 * Detected conservatively: a non-numbered paragraph directly after a numbered run
 * with no terminal punctuation. Orphans that end in a period are not caught.
 */
function orphanFindings(blocks: Block[], parts: Part[], doc: SooDocument): void {
  for (let i = 1; i < blocks.length; i += 1) {
    const prev = blocks[i - 1];
    const cur = blocks[i];
    if (cur.kind !== "para" || cur.isListItem || !prev.isListItem) continue;
    if (PART_RE.test(cur.text) || li.isLeadIn(cur.text)) continue;
    if (/[.:;]$/.test(cur.text.trimEnd())) continue;
    const part = partAt(parts, cur.index);
    doc.findings.push({
      rule: "orphaned_list_item",
      severity: "warning",
      message: `Reads as a list item but lost its numbering: "${cur.text.slice(0, 70)}"`,
      part: part ? part.n : null,
      block: cur.index,
    });
  }
}

function spineFindings(doc: SooDocument): void {
  const numbers = doc.parts.map((p) => p.n);
  for (let i = 0; i + 1 < numbers.length; i += 1) {
    const prev = numbers[i];
    const next = numbers[i + 1];
    if (next !== prev + 1) {
      const missing: number[] = [];
      for (let n = prev + 1; n < next; n += 1) missing.push(n);
      doc.findings.push({
        rule: "part_numbering_gap",
        severity: "error",
        message: `PART numbering jumps ${prev} → ${next}; missing PART ${missing.join(", ")}`,
        part: prev,
        block: null,
      });
    }
  }

  if (doc.docType === "delta") return;

  const present = new Set(doc.parts.map((p) => p.archetype));
  for (const archetype of spine.CANONICAL_ORDER) {
    if (present.has(archetype)) continue;
    doc.findings.push({
      rule: "missing_spine_part",
      severity: spine.REQUIRED_ARCHETYPES.has(archetype) ? "error" : "info",
      message: `No ${spine.humanArchetype(archetype)} part in this document`,
      part: null,
      block: null,
    });
  }

  for (const g of doc.groups) {
    if (g.operator !== "UNKNOWN") continue;
    doc.findings.push({
      rule: "unclassified_lead_in",
      severity: "info",
      message: `Lead-in matched no operator pattern: "${g.leadIn.slice(0, 70)}"`,
      part: g.part,
      block: g.source ? g.source.block : null,
    });
  }
}

function setpointFindings(doc: SooDocument): void {
  const placeholders = doc.setpoints.filter((s) => s.isPlaceholder);
  if (placeholders.length) {
    doc.findings.push({
      rule: "setpoint_placeholder",
      severity: "info",
      message:
        `${placeholders.length} of ${doc.setpoints.length} setpoints still hold template ` +
        `placeholders (normal for an unissued tender document)`,
      part: placeholders[0].declaredInPart,
      block: null,
    });
  }
  if (!doc.setpoints.length) {
    doc.findings.push({
      rule: "no_setpoint_table",
      severity: "error",
      message: "No Adjustable Setpoints table found",
      part: null,
      block: null,
    });
  }
}

export function parseBlocks(blocks: Block[], fileName: string): SooDocument {
  const doc = emptyDocument(fileName, equipmentClassFromName(fileName));

  if (!blocks.length) {
    doc.findings.push({
      rule: "empty_document",
      severity: "error",
      message: "Document has no readable content",
      part: null,
      block: null,
    });
    return doc;
  }

  doc.parts = splitParts(blocks);
  if (doc.parts.some((p) => /\brevised\b/i.test(p.title))) doc.docType = "delta";

  if (!doc.parts.length) {
    doc.findings.push({
      rule: "no_parts",
      severity: "error",
      message: "No `PART n –` headings found; document structure unrecognised",
      part: null,
      block: null,
    });
    return doc;
  }

  const revision = blocks.find((b) => /REVISION\s*NUMBER/i.test(b.text));
  if (revision) doc.revision = revision.text.replace(/.*REVISION\s*NUMBER:?\s*/i, "").trim();

  doc.setpoints = parseSetpoints(blocks, doc.parts);
  extractGroups(blocks, doc.parts, doc);
  orphanFindings(blocks, doc.parts, doc);
  spineFindings(doc);
  setpointFindings(doc);
  return doc;
}
