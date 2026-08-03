# SOO Graphing

Tooling for **HVAC Sequence of Operations** documents. It converts between written
specifications and editable control-flow graphs **in both directions**, and reports where
the logic has gaps.

- **Document → graph** — import a `.docx`/`.pdf` SOO, recover its structure, and render the
  control flow one PART at a time.
- **Graph → document** — draw the flow on a canvas and export a specification back out in
  the house format.
- **Gap analysis** — rules over the intermediate representation flag missing spine parts,
  PART numbering jumps, orphaned list items, setpoints used in logic but never declared,
  and lead-ins the grammar could not classify.

Everything runs locally. No cloud calls, and no document leaves the machine.

---

## Quickstart

```bash
cd app
npm install
npm run dev          # API on :3001, UI on :5173
npm test             # Node's built-in runner — nothing to install
```

Node 20+ (developed on 24.18). Full usage, keyboard shortcuts and export options are in
[`app/README.md`](app/README.md).

**Nothing to import?** There is a fictional sample specification in
[`app/sample/`](app/sample/) — import `001. SOO Sample Air Handling Unit.docx` and you get
the whole pipeline: parsed parts, a drawn graph, and a gap report. It contains deliberate
defects so the gap panel has something to find; they are catalogued in
[`app/sample/README.md`](app/sample/README.md).

---

## How it is put together

Both directions talk to one **intermediate representation**. Documents parse *into* the IR,
the canvas renders *from* it, exports generate *from* it, and the gap rules run *on* it.
Nothing converts a document straight into a picture, which is what keeps the two directions
consistent.

The other load-bearing idea: **the lead-in carries the logic.** These specifications are
built from a colon lead-in followed by a numbered list, and the lead-in declares the
operator — `"shall be considered available when:"` is a conjunction, `"one or more of the
following… persist for the adjustable staging delay:"` is a disjunction plus a timer,
`"the BMS shall trend:"` is a point list that draws no logic at all. Recovering that
grammar is most of the parse, and it is why this runs on rules rather than a language
model.

| Path | What |
|---|---|
| [`PLAN.md`](PLAN.md) | Design, IR schema, gap-rule catalogue, build order |
| [`docs/document-model.md`](docs/document-model.md) | The document model recovered from a real corpus: lead-in grammar, canonical PART spine, observed defects |
| [`app/`](app/) | The application — Express API + Vite/React canvas, TypeScript throughout |
| [`app/sample/`](app/sample/) | A fictional sample SOO and the script that generates it |
| [`app/tests/`](app/tests/) | Lead-in grammar, end-to-end parse of the sample, and the round trip |
| [`backend/soo/`](backend/soo/) | An earlier, independent Python implementation of the parse pipeline, with Mermaid output and a CLI |

---

## A note on the corpus

The lead-in grammar and the canonical part spine were recovered from a corpus of 16 HVAC
specifications that are all one template instantiated repeatedly. **Those source documents
are client material and are deliberately not published here** — `examples/` is gitignored.
The published fixture in `app/sample/` is a wholly fictional document written for the
purpose, not a redaction of a real one, and it is the only sample the tests use.

Two consequences worth knowing before trusting the output:

- The parser is tuned to that one template. A specification from another firm will parse
  less cleanly, and that has not been tested against a genuinely foreign source.
- PDF is best-effort. PDF carries no list structure, so grouping is reconstructed from
  bullet glyphs and indentation. Prefer `.docx` sources where they exist.

---

## Status

Working, and not finished. The import → graph → export round trip runs, the canvas edits,
and the gap rules fire. `PLAN.md` §6 tracks the build order; the local-LLM prose-smoothing
phase described there is **not** implemented — generation is template-driven and fully
deterministic today.
