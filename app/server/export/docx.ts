/**
 * Graph -> .docx in the house format.
 *
 * Mirrors the structure recovered from the example specifications: cover block,
 * `PART n – Title` headings, colon lead-ins followed by lists, an Adjustable
 * Setpoints table, and a closing END OF SECTION.
 */
import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  BorderStyle,
} from "docx";
import type { SooGraph } from "@shared/graph";
import type { Setpoint } from "@shared/ir";
import { graphToProse, type ProsePart } from "../graph/build.js";

const BULLETS = "soo-bullets";
const STEPS = "soo-steps";

const BRAND = "0F8A73";

export interface ExportMeta {
  project?: string;
  /** Issuing firm, printed on the cover and in the page footer. Omitted when unset. */
  organization?: string;
  section?: string;
  revision?: string;
  dateIssued?: string;
  preparedBy?: string;
  reviewedBy?: string;
}

function coverBlock(graph: SooGraph, meta: ExportMeta): Paragraph[] {
  const line = (label: string, value: string) =>
    new Paragraph({
      spacing: { after: 60 },
      children: [
        new TextRun({ text: `${label}  `, bold: true, size: 20 }),
        new TextRun({ text: value, size: 20 }),
      ],
    });

  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [new TextRun({ text: "SEQUENCE OF OPERATIONS", bold: true, size: 36, color: BRAND })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
      children: [
        new TextRun({
          text: meta.organization
            ? `${graph.equipmentClass.toUpperCase()} – ${meta.organization}`
            : graph.equipmentClass.toUpperCase(),
          bold: true,
          size: 28,
        }),
      ],
    }),
    line("SECTION:", meta.section ?? "23-XX-XX"),
    line("TYPE OF DOCUMENT:", "Mechanical Specification – SEQUENCE OF OPERATIONS"),
    line("ISSUE:", `for Tendering – Revision ${meta.revision ?? graph.revision ?? "A"}`),
    line("DATE ISSUED:", meta.dateIssued ?? new Date().toISOString().slice(0, 7).replace("-", "/")),
    line("PREPARED BY:", meta.preparedBy ?? ""),
    line("REVIEWED BY:", meta.reviewedBy ?? ""),
    new Paragraph({ text: "", spacing: { after: 200 } }),
  ];
}

function setpointTable(setpoints: Setpoint[]): Table {
  const cell = (text: string, bold = false) =>
    new TableCell({
      width: { size: 50, type: WidthType.PERCENTAGE },
      children: [
        new Paragraph({ children: [new TextRun({ text, bold, size: 20 })] }),
      ],
    });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: "BFC7C4" },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: "BFC7C4" },
      left: { style: BorderStyle.SINGLE, size: 4, color: "BFC7C4" },
      right: { style: BorderStyle.SINGLE, size: 4, color: "BFC7C4" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: "D8DEDB" },
      insideVertical: { style: BorderStyle.SINGLE, size: 2, color: "D8DEDB" },
    },
    rows: [
      new TableRow({
        tableHeader: true,
        children: [cell("Setpoint", true), cell("Initial Value", true)],
      }),
      ...setpoints.map(
        (s) => new TableRow({ children: [cell(s.name), cell(s.rawValue || "[___]")] }),
      ),
    ],
  });
}

function partChildren(part: ProsePart): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 320, after: 160 },
      children: [
        new TextRun({ text: `PART ${part.n} – `, bold: true, size: 26, color: BRAND }),
        new TextRun({ text: part.title, bold: true, size: 26 }),
      ],
    }),
  ];

  for (const statement of part.statements) {
    out.push(
      new Paragraph({
        spacing: { after: 120 },
        children: [new TextRun({ text: statement, size: 22 })],
      }),
    );
  }

  for (const group of part.groups) {
    out.push(
      new Paragraph({
        spacing: { before: 120, after: 80 },
        children: [new TextRun({ text: group.leadIn, size: 22 })],
      }),
    );
    const reference = group.operator === "SEQUENCE" ? STEPS : BULLETS;
    for (const item of group.items) {
      out.push(
        new Paragraph({
          numbering: { reference, level: 0 },
          spacing: { after: 40 },
          children: [new TextRun({ text: item, size: 22 })],
        }),
      );
    }
    if (group.delay) {
      out.push(
        new Paragraph({
          spacing: { before: 60, after: 120 },
          children: [
            new TextRun({
              text: `The condition shall persist for the ${group.delay} before the action is taken.`,
              size: 22,
            }),
          ],
        }),
      );
    }
  }

  return out;
}

export async function graphToDocx(
  graph: SooGraph,
  setpoints: Setpoint[],
  meta: ExportMeta = {},
): Promise<Buffer> {
  const prose = graphToProse(graph);
  const children: (Paragraph | Table)[] = [...coverBlock(graph, meta)];

  for (const part of prose) {
    children.push(...partChildren(part));
    if (/setpoint/i.test(part.title) && setpoints.length) {
      children.push(setpointTable(setpoints));
    }
  }

  if (setpoints.length && !prose.some((p) => /setpoint/i.test(p.title))) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 320, after: 160 },
        children: [
          new TextRun({ text: `PART ${prose.length + 1} – `, bold: true, size: 26, color: BRAND }),
          new TextRun({ text: "Adjustable Setpoints", bold: true, size: 26 }),
        ],
      }),
      new Paragraph({
        spacing: { after: 120 },
        children: [
          new TextRun({ text: "The following setpoints shall be adjustable through the BMS:", size: 22 }),
        ],
      }),
      setpointTable(setpoints),
    );
  }

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 400 },
      children: [new TextRun({ text: "END OF SECTION", bold: true, size: 22 })],
    }),
  );

  const doc = new Document({
    creator: "SOO Flow",
    title: `${graph.equipmentClass} — Sequence of Operations`,
    numbering: {
      config: [
        {
          reference: BULLETS,
          levels: [
            {
              level: 0,
              format: "bullet",
              text: "•",
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } },
            },
          ],
        },
        {
          reference: STEPS,
          levels: [
            {
              level: 0,
              format: "decimal",
              text: "%1.",
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } },
            },
          ],
        },
      ],
    },
    sections: [{ properties: {}, children }],
  });

  return Packer.toBuffer(doc);
}
