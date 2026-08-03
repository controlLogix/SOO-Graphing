# SOO Flow — Sequence of Operations ⇄ Flowchart Tool

A local-only web tool that converts between **Sequence of Operations** documents and
**flowcharts**, in both directions, and reports where the logic has gaps.

- **Doc → Graph:** import an SOO (PDF/DOCX), parse it, draw the control flow, and
  highlight disconnects (dangling references, dead ends, undefined setpoints).
- **Graph → Doc:** draw the flow on a canvas, and a **local LLM** drafts the written SOO
  in the house template.

Everything runs on this machine. No cloud calls, no document leaves the box.

---

## 1. Core idea: one intermediate representation

Both directions talk to the same middle layer. Nothing converts a PDF straight into a
picture, and nothing converts a picture straight into prose. Everything becomes an **SOO
IR** (a JSON document) first.

```
PDF / DOCX  ──parse──►  ┌─────────┐  ──render──►  Flowchart (canvas)
                        │ SOO IR  │
SOO text    ──draft──◄  └─────────┘  ◄──build───  Flowchart (canvas)
                             │
                             ▼
                     Gap / lint analysis
```

This is the single most important design decision. If the IR is right, everything else
is a straightforward transform. Getting the IR right is what the **example SOOs** are
for — the schema below is a first draft and *will* change once real documents land in
`examples/`.

### Draft IR schema

Revised against the real documents — see [`docs/document-model.md`](docs/document-model.md)
for the evidence behind each field.

```jsonc
{
  "meta":      { "project": "", "equipment_class": "air_handler", "revision": "A",
                 "doc_type": "standalone",        // or "delta" — see 003. Liquid Cooled Chiller
                 "source_file": "" },
  "parts":     [ { "n": 12, "title": "Supply-Air Temperature Control",
                   "archetype": "control_loop",   // maps to the canonical spine
                   "is_inventory": false } ],     // true for Alarms/Graphics/Trending/Cx
  "equipment": [ { "id": "AHU-1", "type": "air_handler", "parent": null,
                   "condition": "where provided" } ],
  "points":    [ { "id": "SAT",  "name": "Supply Air Temp", "kind": "AI",
                   "units": "degF", "equipment": "AHU-1", "condition": null } ],
  "setpoints": [ { "id": "SAT_SP", "value": null, "placeholder": "[___°F / ___°C]",
                   "units": "degF", "adjustable": true, "declared_in_part": 4 } ],
  "modes":     [ { "id": "OCCUPIED", "entry": [...], "exit": [...] } ],
  "groups":    [ { "id": "G7", "part": 5, "lead_in": "An AHU shall be considered available when:",
                   "operator": "AND",             // AND | OR | SEQUENCE | INVENTORY
                   "modality": "shall",           // shall | should | may
                   "delay_s": null,
                   "items": ["S1", "S2", "S3"] } ],
  "steps":     [ { "id": "S1", "part": 5, "group": "G7", "kind": "condition",
                   "text": "The local selector is in AUTO or REMOTE.",
                   "modality": "shall", "condition": null,
                   "reads": ["SEL_AUTO"], "writes": [],
                   "next": { "true": "S2", "false": "S3" },
                   "source": { "part": 5, "block": 212, "page": 9 } } ],
  "interlocks":[ { "id": "IL1", "when": "SMOKE_ALARM", "forces": ["SF_CMD=off"] } ],
  "alarms":    [ { "id": "AL1", "trigger": "SAT > 90", "delay_s": 300, "reset": "auto" } ]
}
```

Four fields exist because the documents demand them:

- **`modality`** — `shall` / `should` / `may` is contractual language. Generation must
  never promote or demote it.
- **`condition`** — `where provided` / `where available` / `where required` marks optional
  equipment. Without it, the gap analyzer flags optional kit as missing on every document.
- **`groups` + `operator`** — the corpus is built from *lead-in sentence + numbered list*,
  where the lead-in declares the logical operator. This is the main graphable unit.
- **`is_inventory`** — Alarms, Graphics, Trending and Commissioning are point lists, not
  control flow. They populate collections and render no nodes.

Every element carries a `source` back-pointer so the UI can click from a node straight to
the paragraph it came from, and so the gap report cites chapter and verse.

---

## 2. Gap / disconnect analysis

This is the part that earns the tool its keep. It runs as a set of independent rules
over the IR, each producing a finding with a severity and a source citation.

**Spine conformance** *(added after reading the examples — likely the highest-value class)*
- Part archetype missing relative to the canonical spine for this equipment class.
- Gap in PART numbering (`002. Air Cooled Chiller` and `016. TES Tanks` both jump 6 → 8).
- Document markedly thinner than its peers in the same class.
- Zero-byte or stub document (three exist in the current set).
- Requires no language understanding at all, and already finds real defects.

**Structural**
- Step with no inbound edge (unreachable) or no outbound edge (dead end).
- A referenced step/mode ID that does not exist.
- A branch condition with only one outcome defined (`if` with no `else` path).
- A loop with no exit condition.

**Referential**
- A point read or commanded but never listed in the points list.
- A setpoint **referenced in logic but never declared** in the Adjustable Setpoints table.
  *(Distinct from — and far more serious than — a declared setpoint left at its
  `[___°F / ___°C]` placeholder, which is the normal state of an unissued tender template
  and must be separately suppressible.)*
- A mode named in a transition but never defined.
- An item in Alarms / Trending / Commissioning referring to a point or sequence that no
  part actually defines. These inventory lists are a free cross-check on the body.

**Controls-domain**
- No failure / loss-of-signal behavior for a sensor that drives an output.
- Command with no proof/status feedback checked.
- Alarm with no delay, or no reset method.
- Missing unoccupied / shutdown / power-restore behavior.
- Setpoint ranges that overlap or conflict (heating SP above cooling SP).
- Interlock declared but never referenced by any step.

Findings render three ways: a list, a highlight on the offending node, and a red edge
where a connection should exist but doesn't.

---

## 3. Recommended stack

| Layer | Choice | Why |
|---|---|---|
| Backend | **Python + FastAPI** | Best PDF/DOCX parsing libraries by a wide margin |
| PDF parse | **pdfplumber** (+ `PyMuPDF` fallback) | Keeps layout, tables, and page numbers |
| DOCX parse | **python-docx** | Real access to heading levels, numbered lists, tables |
| Frontend | **Vite + React + TypeScript** | Standard, fast, no build surprises |
| Canvas | **React Flow** | Purpose-built for editable node graphs; custom node types |
| Auto-layout | **ELK.js** (`elkjs`) | Clean layered layout for imported graphs |
| Local LLM | **Ollama** | Simple local server; swap models without code changes |
| Model | `qwen2.5:14b-instruct` or `llama3.1:8b` to start | Good structured-output behavior at reasonable VRAM |
| Storage | **SQLite** + a `projects/` folder of JSON | Portable, diffable, no server to run |

Open decisions, to settle after seeing the example SOOs:
- Whether one SOO maps to one graph or one graph **per system** (AHU-1, VAV-3, …).
  Real documents usually cover many systems, so per-system is likely.
- Whether the parser is rules-first with the LLM as a fallback, or LLM-first with rules
  as validation. **Leaning rules-first** — deterministic, debuggable, and it makes the
  LLM's job smaller and more reliable.

---

## 4. Parsing approach (doc → IR)

A three-pass pipeline, deliberately boring before it gets clever:

1. **Structure pass** — split on `^PART\s*(\d+)\s*[–—-]\s*(.+)$`. **Not** on Word heading
   styles: the documents have none, everything is default-styled, and section structure
   lives purely in the text. Be permissive about the dash and spacing — usage is
   inconsistent within single documents. Terminates at `END OF SECTION`.
2. **Grouping pass** — bind each numbered list to its lead-in sentence using Word's
   `numId`. Classify the lead-in to get the logical operator (AND / OR / SEQUENCE /
   INVENTORY) and any `adjustable delay`. Map each part title to a spine archetype.
3. **Extraction pass** — turn list items into `steps`, carrying `modality` and `condition`
   through verbatim. Rule-based for the common shapes; the LLM handles the leftovers,
   constrained to emit IR JSON that is schema-validated before it's accepted. Anything
   that fails validation surfaces as a *parse gap* rather than being silently dropped.

The lead-in grammar table in `docs/document-model.md` §2 is the working spec for pass 2.
Because the corpus is one template instantiated 16 times, this covers most of it
deterministically and the LLM's share is smaller than originally planned.

Nothing gets invented. If a sentence can't be resolved into a step, it appears in the
review queue as unparsed text attached to its section — visible, not lost.

---

## 5. Generation approach (graph → SOO)

1. Serialize the canvas graph to IR.
2. Run the same gap analysis — refuse to generate from a graph with unresolved errors,
   or generate with the gaps marked inline as `[TBD: ...]`.
3. Walk the IR in document order and emit prose from **templates**, not free generation:
   each step kind has a sentence pattern. Deterministic, consistent, reviewable.
4. The LLM's job is narrow: smooth the prose, keep the house voice, expand terse node
   labels into full sentences. It never invents logic — every clause traces to an IR node.
5. Export to DOCX (`python-docx`) against a project template.

The templates come from the example SOOs. That's the immediate next step.

---

## 6. Build order

**Phase 0 — Foundation** *(done)*
- `C:\theWork\git` created, Git installed, this plan written.

**Phase 1 — Template extraction** *(done — see `docs/document-model.md`)*
- 16 HVAC SOOs catalogued; structure, lead-in grammar, and canonical spine extracted.
- IR schema revised against real text (§1). Corpus defects logged as a validation set.

**Phase 2 — Skeleton**
- FastAPI + Vite scaffold, one repo, `dev` script that runs both.
- IR schema as Pydantic models + a JSON Schema for the frontend.

**Phase 3 — Doc → IR**
- Structure, grouping, and extraction passes; part tree viewer, no graph yet.
- Build against `005. AHU`, validate on `010. CRAH` and `006. RTU`.
- Hold `013. Glycol Feed` and `014. Exhaust Fans` back as unseen test documents — same
  template, different domain, so they show whether the parser generalized or memorized.
- Measure what fraction of blocks resolve cleanly per document.

**Phase 4 — IR → Graph**
- React Flow rendering, ELK auto-layout, custom node types per step kind,
  click-through from node to source text.
- **One graph per PART**, plus a document-level map of parts and their cross-references.
  A whole document is 20–53 parts and is unreadable as a single flow.
- Optional equipment (`where provided`) renders ghosted, not solid.

**Phase 5 — Gap analysis**
- The rule set from §2, findings panel, node/edge highlighting.

**Phase 6 — Graph editing**
- Full canvas editing, palette, graph → IR round-trip.

**Phase 7 — Local LLM**
- Ollama integration, extraction fallback, prose generation, DOCX export.

**Phase 8 — Polish**
- Project save/load, PNG/SVG/PDF export, diff two revisions of an SOO.

---

## 7. Repo layout

```
C:\theWork\git\
├── PLAN.md                 this file
├── examples/               real SOO documents (input for Phase 1)
├── docs/
│   ├── document-model.md   findings from the example corpus  ← written
│   ├── ir-schema.md        the IR spec, once locked
│   ├── gap-rules.md        one entry per lint rule
│   └── templates.md        sentence patterns for generation
├── backend/                FastAPI, parsers, IR, gap engine, LLM client
├── frontend/               Vite + React + React Flow
└── tests/
    └── fixtures/           small SOO snippets with expected IR
```

---

## 8. Notes and risks

- **PDF is lossy.** Scanned or image-only PDFs need OCR (Tesseract) and will parse far
  worse than DOCX. Prefer DOCX sources where they exist; treat PDF as best-effort. Note
  that PDF also destroys the `numId` list grouping that pass 2 depends on, so PDF parsing
  will need to reconstruct grouping from indentation and bullet glyphs.
- **The corpus is more consistent than assumed, which is a risk in itself.** All 16
  documents are one template, so a parser tuned on them may be brittle against an SOO from
  another author or firm. The held-back test documents partly address this; a genuinely
  foreign SOO should be tried before trusting the tool on incoming third-party documents.
- **`.dwg` control diagrams are out of scope for v1.** M900/M901 need CAD tooling to read.
  Worth revisiting: if they already draw the control diagrams, matching a generated graph
  against them would be strong validation.
- **The tracker spreadsheet has drifted.** Columns no longer line up in later rows, and
  four tracked items have no SOO at all. Worth fixing at source rather than teaching the
  tool to cope with it.
- **A gap report that cries wolf gets ignored.** Rules ship with severities, and any rule
  that produces noise on known-good documents gets demoted or dropped.
- **The LLM is the assistant, not the author.** Every generated clause traces to an IR
  node. If it can't be traced, it doesn't get written.
