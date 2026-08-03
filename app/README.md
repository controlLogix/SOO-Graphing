# SOO Flow

A local tool for **Sequence of Operations** documents. Import a specification and it is
parsed into control flow you can inspect part by part; draw the flow by hand and it
exports back out as a specification in the house format.

Everything runs on this machine. No document leaves the box, and there are no cloud calls.

---

## Running it

```bash
cd app
npm install          # once
npm run dev          # API on :3001, UI on :5173, opens the browser
```

For a single-process run against the built UI:

```bash
npm run build
npm start            # everything on http://localhost:3001
```

Requires Node 20+ (developed on 24.18).

---

## What it does

**Import** — a `.docx` or `.pdf` sequence of operations. The parser recovers the
`PART n – Title` structure, binds each numbered list to the lead-in sentence above it,
and classifies what that lead-in means. Conditions that must all hold become an **ALL of**
gate; triggers where any one suffices become **ANY of**; ordered instructions become a
chain; "the BMS shall trend:" becomes an inventory that draws nothing, because it is a
point list rather than logic.

**Draw** — drag shapes from the left rail onto the canvas, drag between handles to
connect, select to edit, `Delete` to remove, `Ctrl+Z` / `Ctrl+Shift+Z` to undo and redo.
**Auto layout** re-flows the active part with ELK.

**Export** — `.docx` or `.pdf`, written in the house format: cover block, `PART n – Title`
headings, colon lead-ins with their lists, the Adjustable Setpoints table, and
`END OF SECTION`.

**Gaps** — the right rail lists what the rule engine found: missing spine parts, PART
numbering jumps, orphaned list items, undeclared setpoints, unclassified lead-ins.

---

## Layout

```
app/
├── shared/            IR and graph types, used by both sides
│   ├── ir.ts          the intermediate representation
│   └── graph.ts       what the canvas edits
├── server/
│   ├── index.ts       Express API — import, export, health
│   ├── parse/
│   │   ├── docx-reader.ts   .docx -> blocks, preserving list identity
│   │   ├── pdf-reader.ts    .pdf -> blocks, best-effort
│   │   ├── lead-in.ts       the sentence grammar
│   │   ├── spine.ts         canonical PART spine and archetypes
│   │   └── parser.ts        structure -> grouping -> extraction
│   ├── graph/build.ts       IR <-> graph, both directions
│   └── export/              docx.ts, pdf.ts
└── web/src/
    ├── store.ts       graph state, undo/redo
    ├── components/    Header, Palette, Canvas, Inspector, Parts, Findings
    └── lib/           api.ts, layout.ts
```

Stack: Express + Vite/React 18 + TypeScript throughout. Canvas is
[React Flow](https://reactflow.dev) (`@xyflow/react`) with `elkjs` for auto-layout and
`zustand` for state. Reading and writing Office formats is `jszip`/`fast-xml-parser`,
`pdfjs-dist`, `docx`, and `pdf-lib` — no native dependencies, no external services.

A second, independent implementation of the parse pipeline lives in `backend/soo/`
(Python: `docx_reader.py`, `lead_in.py`, `spine.py`, `parser.py`, plus `mermaid.py` for
Mermaid output and a `cli.py`). It predates the TypeScript server and is useful for
batch work from the command line.

---

## The two ideas worth knowing

**One representation, two directions.** Documents parse *into* the IR, the canvas renders
*from* it, exports generate *from* it, and the gap rules run *on* it. Nothing converts a
document straight into a picture.

**The lead-in carries the logic.** These specifications are built from a colon lead-in
followed by a list, and the lead-in declares the operator. `"shall be considered available
when:"` is a conjunction. `"one or more of the following… persist for the adjustable
staging delay:"` is a disjunction plus a timer. Recovering that is most of the parse, and
it is why this works on rules rather than a language model.

---

## Export metadata

`ExportMeta` (in `server/export/docx.ts`) fills the cover block and page footer. Every
field is optional, and anything unset is simply left out rather than defaulted to a
placeholder:

| Field | Where it lands |
|---|---|
| `organization` | Cover subtitle, after the equipment class, and the page footer |
| `project` | Cover block |
| `section` | `SECTION:` line — falls back to `23-XX-XX` |
| `revision` | `ISSUE: for Tendering – Revision …` |
| `dateIssued` | `DATE ISSUED:` — falls back to today |
| `preparedBy` / `reviewedBy` | Signature lines |

There is no firm name or logo compiled into the exporters. To put your own on the output,
pass `organization`.

---

## Known limits

- **PDF is best-effort.** PDF has no list structure, so grouping is reconstructed from
  bullet glyphs and indentation. Prefer `.docx` sources where they exist.
- **The cover page is regenerated, not copied.** Body content round-trips; the names,
  dates and signature block on the cover are rewritten from the export metadata.
- **Tuned to one house template.** The lead-in grammar was recovered from a corpus of 16
  HVAC specifications that are all one template instantiated repeatedly. A document from
  another firm will parse less cleanly, and that has not been tested against a genuinely
  foreign source.
- `.dwg` control diagrams are not read.
