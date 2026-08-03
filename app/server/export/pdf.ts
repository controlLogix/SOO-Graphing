/**
 * Graph -> .pdf in the house format.
 *
 * pdf-lib has no layout engine, so this carries a small one: measured word wrap,
 * hanging-indent lists, a two-column table, and page breaks that never orphan a
 * heading. Same prose model as the DOCX export, so both stay in step.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { SooGraph } from "@shared/graph";
import type { Setpoint } from "@shared/ir";
import { graphToProse } from "../graph/build.js";
import type { ExportMeta } from "./docx.js";

const PAGE = { w: 612, h: 792 };
const MARGIN = { top: 64, bottom: 64, left: 68, right: 68 };
const BRAND = rgb(0.06, 0.54, 0.45);
const INK = rgb(0.06, 0.09, 0.1);
const SOFT = rgb(0.36, 0.4, 0.39);
const RULE = rgb(0.82, 0.85, 0.84);

const SIZE = { body: 10, lead: 10, head: 13, title: 22, sub: 14, small: 8 };
const LINE = 14;

interface Ctx {
  pdf: PDFDocument;
  page: PDFPage;
  y: number;
  pageNo: number;
  regular: PDFFont;
  bold: PDFFont;
  title: string;
}

function newPage(ctx: Ctx): void {
  ctx.page = ctx.pdf.addPage([PAGE.w, PAGE.h]);
  ctx.pageNo += 1;
  ctx.y = PAGE.h - MARGIN.top;
  drawRunningHead(ctx);
}

function drawRunningHead(ctx: Ctx): void {
  if (ctx.pageNo <= 1) return;
  ctx.page.drawText(ctx.title, {
    x: MARGIN.left,
    y: PAGE.h - MARGIN.top + 22,
    size: SIZE.small,
    font: ctx.regular,
    color: SOFT,
  });
  ctx.page.drawLine({
    start: { x: MARGIN.left, y: PAGE.h - MARGIN.top + 14 },
    end: { x: PAGE.w - MARGIN.right, y: PAGE.h - MARGIN.top + 14 },
    thickness: 0.5,
    color: RULE,
  });
}

function ensure(ctx: Ctx, needed: number): void {
  if (ctx.y - needed < MARGIN.bottom) newPage(ctx);
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    // A single word longer than the column: hard-break it rather than overflow.
    if (font.widthOfTextAtSize(word, size) > maxWidth) {
      let chunk = "";
      for (const ch of word) {
        if (font.widthOfTextAtSize(chunk + ch, size) > maxWidth) {
          lines.push(chunk);
          chunk = ch;
        } else chunk += ch;
      }
      line = chunk;
    } else line = word;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function paragraph(
  ctx: Ctx,
  text: string,
  opts: {
    size?: number;
    font?: PDFFont;
    color?: ReturnType<typeof rgb>;
    indent?: number;
    bullet?: string;
    after?: number;
  } = {},
): void {
  const size = opts.size ?? SIZE.body;
  const font = opts.font ?? ctx.regular;
  const indent = opts.indent ?? 0;
  const width = PAGE.w - MARGIN.left - MARGIN.right - indent;
  const lines = wrap(text, font, size, width);

  ensure(ctx, LINE);
  lines.forEach((line, i) => {
    ensure(ctx, LINE);
    if (i === 0 && opts.bullet) {
      ctx.page.drawText(opts.bullet, {
        x: MARGIN.left + indent - 16,
        y: ctx.y,
        size,
        font,
        color: opts.color ?? INK,
      });
    }
    ctx.page.drawText(line, {
      x: MARGIN.left + indent,
      y: ctx.y,
      size,
      font,
      color: opts.color ?? INK,
    });
    ctx.y -= LINE;
  });
  ctx.y -= opts.after ?? 4;
}

function partHeading(ctx: Ctx, n: number, title: string): void {
  ensure(ctx, LINE * 4);
  ctx.y -= 10;
  const label = `PART ${n} – `;
  ctx.page.drawText(label, {
    x: MARGIN.left,
    y: ctx.y,
    size: SIZE.head,
    font: ctx.bold,
    color: BRAND,
  });
  const offset = ctx.bold.widthOfTextAtSize(label, SIZE.head);
  const width = PAGE.w - MARGIN.left - MARGIN.right - offset;
  const lines = wrap(title, ctx.bold, SIZE.head, width);
  ctx.page.drawText(lines[0], {
    x: MARGIN.left + offset,
    y: ctx.y,
    size: SIZE.head,
    font: ctx.bold,
    color: INK,
  });
  ctx.y -= LINE + 2;
  for (const line of lines.slice(1)) {
    ensure(ctx, LINE);
    ctx.page.drawText(line, { x: MARGIN.left, y: ctx.y, size: SIZE.head, font: ctx.bold, color: INK });
    ctx.y -= LINE + 2;
  }
  ctx.page.drawLine({
    start: { x: MARGIN.left, y: ctx.y + 6 },
    end: { x: PAGE.w - MARGIN.right, y: ctx.y + 6 },
    thickness: 0.75,
    color: RULE,
  });
  ctx.y -= 10;
}

function setpointTable(ctx: Ctx, setpoints: Setpoint[]): void {
  const colW = (PAGE.w - MARGIN.left - MARGIN.right) / 2;
  const row = (a: string, b: string, bold: boolean) => {
    const font = bold ? ctx.bold : ctx.regular;
    const left = wrap(a, font, SIZE.body, colW - 12);
    const right = wrap(b, font, SIZE.body, colW - 12);
    const height = Math.max(left.length, right.length) * LINE + 6;
    ensure(ctx, height);
    left.forEach((line, i) =>
      ctx.page.drawText(line, {
        x: MARGIN.left + 4,
        y: ctx.y - i * LINE,
        size: SIZE.body,
        font,
        color: INK,
      }),
    );
    right.forEach((line, i) =>
      ctx.page.drawText(line, {
        x: MARGIN.left + colW + 4,
        y: ctx.y - i * LINE,
        size: SIZE.body,
        font,
        color: INK,
      }),
    );
    ctx.y -= height;
    ctx.page.drawLine({
      start: { x: MARGIN.left, y: ctx.y + 4 },
      end: { x: PAGE.w - MARGIN.right, y: ctx.y + 4 },
      thickness: 0.5,
      color: RULE,
    });
  };

  ctx.y -= 4;
  row("Setpoint", "Initial Value", true);
  for (const s of setpoints) row(s.name, s.rawValue || "[___]", false);
  ctx.y -= 8;
}

export async function graphToPdf(
  graph: SooGraph,
  setpoints: Setpoint[],
  meta: ExportMeta = {},
): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const ctx: Ctx = {
    pdf,
    page: pdf.addPage([PAGE.w, PAGE.h]),
    y: PAGE.h - MARGIN.top,
    pageNo: 1,
    regular,
    bold,
    title: `${graph.equipmentClass} — Sequence of Operations`,
  };

  // Cover.
  ctx.page.drawText("SEQUENCE OF OPERATIONS", {
    x: MARGIN.left,
    y: ctx.y,
    size: SIZE.title,
    font: bold,
    color: BRAND,
  });
  ctx.y -= 30;
  paragraph(
    ctx,
    meta.organization
      ? `${graph.equipmentClass.toUpperCase()} – ${meta.organization}`
      : graph.equipmentClass.toUpperCase(),
    { size: SIZE.sub, font: bold, after: 22 },
  );

  const field = (label: string, value: string) => {
    ensure(ctx, LINE);
    ctx.page.drawText(label, { x: MARGIN.left, y: ctx.y, size: SIZE.body, font: bold, color: SOFT });
    ctx.page.drawText(value, {
      x: MARGIN.left + 132,
      y: ctx.y,
      size: SIZE.body,
      font: regular,
      color: INK,
    });
    ctx.y -= LINE + 2;
  };

  field("SECTION:", meta.section ?? "23-XX-XX");
  field("TYPE OF DOCUMENT:", "Mechanical Specification – SEQUENCE OF OPERATIONS");
  field("ISSUE:", `for Tendering – Revision ${meta.revision ?? graph.revision ?? "A"}`);
  field("DATE ISSUED:", meta.dateIssued ?? new Date().toISOString().slice(0, 10));
  if (meta.preparedBy) field("PREPARED BY:", meta.preparedBy);
  if (meta.reviewedBy) field("REVIEWED BY:", meta.reviewedBy);

  ctx.y -= 12;

  const prose = graphToProse(graph);
  for (const part of prose) {
    partHeading(ctx, part.n, part.title);
    for (const statement of part.statements) paragraph(ctx, statement, { after: 6 });
    for (const group of part.groups) {
      paragraph(ctx, group.leadIn, { after: 4 });
      group.items.forEach((item, i) => {
        const bullet = group.operator === "SEQUENCE" ? `${i + 1}.` : "•";
        paragraph(ctx, item, { indent: 26, bullet, after: 1 });
      });
      if (group.delay) {
        paragraph(
          ctx,
          `The condition shall persist for the ${group.delay} before the action is taken.`,
          { after: 6 },
        );
      }
      ctx.y -= 4;
    }
    if (/setpoint/i.test(part.title) && setpoints.length) setpointTable(ctx, setpoints);
  }

  ensure(ctx, LINE * 3);
  ctx.y -= 18;
  const end = "END OF SECTION";
  const endW = bold.widthOfTextAtSize(end, SIZE.body);
  ctx.page.drawText(end, {
    x: (PAGE.w - endW) / 2,
    y: ctx.y,
    size: SIZE.body,
    font: bold,
    color: SOFT,
  });

  // Page numbers, once the total is known.
  const pages = pdf.getPages();
  pages.forEach((page, i) => {
    const label = `${i + 1} of ${pages.length}`;
    const w = regular.widthOfTextAtSize(label, SIZE.small);
    page.drawText(label, {
      x: PAGE.w - MARGIN.right - w,
      y: MARGIN.bottom - 26,
      size: SIZE.small,
      font: regular,
      color: SOFT,
    });
    if (meta.organization) {
      page.drawText(meta.organization, {
        x: MARGIN.left,
        y: MARGIN.bottom - 26,
        size: SIZE.small,
        font: regular,
        color: SOFT,
      });
    }
  });

  return Buffer.from(await pdf.save());
}
