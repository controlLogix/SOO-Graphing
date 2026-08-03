# Document Model — findings from the example SOOs

Analysis of `examples/6_Controls/` as supplied. This is the empirical basis for the IR
schema, the parser, and the generation templates. Everything below was measured from the
files, not assumed.

## 1. What's in the corpus

| Group | Contents |
|---|---|
| `02. HVAC Controls/` | **16 SOO documents** — 13 with content, **3 zero-byte** |
| `02. HVAC Controls/Archive/` | 15 `-old` / `REV 01` prior revisions |
| `01. Plumbing Controls/` | 6 folders (Booster Pump, Sump Pump, DHW Recirc, Leak Detection, High Water Alarm, BAS Points List) — **all empty** |
| root | `M900` / `M901 - CONTROL DIAGRAMS.dwg`, `Sequence of Operations Tracker.xlsx` |

Document sizes range from 86 blocks (TES Tanks) to 1004 (CRAH). Typical is 600–950.

**The headline finding: these are not 16 independent documents. They are one template
instantiated 16 times.** Same part spine, same sentence patterns, same tail sections,
same vocabulary. That is enormously good news — it means the parser can be
rules-first and mostly deterministic, and the generator can emit prose from patterns
recovered directly from the corpus rather than invented.

## 2. Structure: how the documents are actually built

**There are no heading styles.** Every paragraph in every document carries the default
style; only the cover page uses `Title`. Section structure is conveyed purely by *text*:

```
PART 12 –  Supply-Air Temperature Control
```

So the structure pass keys on `^PART\s*(\d+)\s*[–—-]\s*(.+)$`, not on Word styles.
Documents close with a literal `END OF SECTION`.

Dash and spacing usage is inconsistent (`PART 2– `, `PART 5 – `, `PART 9 – `), so the
regex has to be permissive about the separator and surrounding whitespace.

### The dominant unit: lead-in + list

The overwhelming majority of the content is a **lead-in sentence ending in a colon,
followed by a numbered list**. Word groups the list items under a shared `numId`, which
makes the association reliable to recover:

```
The BMS shall monitor, where available:          ← lead-in  (numId 24 follows)
  • Cooling-valve command                        ← items, numId 24
  • Cooling-valve position feedback
  • Entering chilled-water or glycol temperature
```

**The lead-in declares the logical operator; the list items are the operands.** This is
the single most useful fact for graphing, and it is what makes rule-based extraction
tractable. Recovered patterns:

| Lead-in pattern | Semantics | Graph form |
|---|---|---|
| `<X> shall be considered available when:` | all items AND'd | AND gate → availability state |
| `Upon <event>:` | ordered action sequence | linear step chain |
| `When <X> is staged:` | ordered action sequence | linear step chain |
| `<X> shall be staged when one or more of the following conditions persist for the adjustable <n> delay:` | items OR'd, then a timer | OR gate → delay → action |
| `Before <action>, the BMS shall confirm:` | precondition gate, AND'd | guard node on an edge |
| `The setpoint shall increase gradually when:` | reset-up trigger set | reset block |
| `The setpoint may decrease gradually when:` | reset-down trigger set | reset block |
| `A <name> alarm shall be generated when:` | AND'd alarm trigger | alarm node |
| `The BMS shall monitor / trend / demonstrate:` | **point list, not logic** | populates IR points, draws nothing |

That last row matters a lot. The tail parts — Alarms, BMS Graphics, Trending, Testing and
Commissioning — are inventories, not control flow. They should populate the points and
alarms collections in the IR and must **not** be rendered as flowchart nodes, or every
graph ends in a meaningless 40-item fan-out.

### Modality is contractual and must survive the round trip

The documents use `shall` / `should` / `may` deliberately:

- **shall** — mandatory requirement
- **should** — advisory, expected practice
- **may** — permitted option

Example: *"all healthy and available fans **should** normally operate together"* versus
*"The fan array **shall not** normally operate one fan at full speed…"*. These are not
interchangeable, and generation must never silently promote or demote one. `modality` is
therefore a first-class IR field, not a formatting detail.

### Conditional inclusion

Phrases like `where provided`, `where available`, `where required`, `where applicable`
appear constantly (*"Return fan, where provided"*, *"Heating or reheat coil, where
provided"*). These mark **optional equipment and optional logic** — the document covers a
family of possible installations, not one built system.

The IR needs a `condition` qualifier on elements carrying these, and the graph should
render them as dashed/ghosted nodes. Otherwise the gap analyzer will flag optional
equipment as missing on every single document.

### Setpoints

Always a table, always `Setpoint | Initial Value`, and in the AHU document all 30 rows
read `[___°F / ___°C]`. These are **unfilled template placeholders** — correct for a
tender template, but it means "setpoint declared with no value" is the normal state of a
blank template and must be a distinct, suppressible finding class from "setpoint
*referenced* in logic but never declared", which is a genuine defect.

## 3. The canonical part spine

Across the 13 non-empty documents the parts follow a consistent order. Extracted spine,
with how many of the 13 include each:

| # | Part archetype | Present in |
|---|---|---|
| 1 | System Description | 12 |
| 2 | Definitions / Application / Philosophy | 11 |
| 3 | Control Responsibilities | 10 |
| 4 | **Adjustable Setpoints** | 12 |
| 5 | Availability | 11 |
| 6 | System / Unit Enable | 11 |
| 7 | Start Sequence | 11 |
| 8 | *Equipment-specific control loops* | 13 |
| 9 | Capacity Staging | 9 |
| 10 | Gradual Addition | 7 |
| 11 | Load Sharing | 6 |
| 12 | De-Staging | 8 |
| 13 | Capacity and Redundancy Management | 9 |
| 14 | Component Failure Responses | 13 |
| 15 | Sensor Failure | 12 |
| 16 | **Loss of BMS Communication** | 13 |
| 17 | **Power Failure and Automatic Restart** | 13 |
| 18 | Emergency Mode | 9 |
| 19 | Normal Shutdown | 10 |
| 20 | **Alarms** | 13 |
| 21 | **BMS Graphics** | 13 |
| 22 | **Trending** | 13 |
| 23 | **Testing and Commissioning** | 13 |

Only the block-8 middle varies materially by equipment type. **Everything else is the
same skeleton.**

This gives the gap analyzer a rule class I hadn't planned for and which is probably the
highest-value one in the tool: **spine conformance**. Compare any document against the
canonical spine for its equipment class and report what's absent. It requires no natural
language understanding at all, and it already finds real defects (below).

## 4. Defects already present in the corpus

Found without writing a parser — which is a good sign for the premise of the tool.

**Numbering**
- `002. SOO Air Cooled Chiller` — jumps **PART 6 → PART 8**. No PART 7.
- `016. SOO Primary Secondary TES tanks` — jumps **PART 6 → PART 8**. No PART 7.

**Missing content**
- `015a. SOO VENTILATION UPS ROOM.docx` — **0 bytes**
- `015b. SOO DATA HALL.docx` — **0 bytes**
- `015c. SOO MECHANICAL ROOM.docx` — **0 bytes**

**Spine gaps**
- `001. Cooling Tower` — no Control Responsibilities part.
- `011. Fan Wall Unit` — no Control Responsibilities, no Availability, and no staging /
  redundancy parts, despite being multi-fan equipment where fan failure and redundancy
  are exactly the concern. Thinnest of the air-side documents at 293 blocks.
- `003. Liquid Cooled Chiller` — no System Description, no Adjustable Setpoints, and parts
  named *Revised* Alarms / *Revised* BMS Graphics. This reads as a **delta document**
  amending another SOO rather than a standalone one. If that's intentional the tool needs
  a document-type flag; if not, it's missing its front matter.
- `016. TES Tanks` — 86 blocks against a 600–950 norm, and no failure-response,
  sensor-failure, or communication-loss parts.

**Consistency**
- Filename typo: `009. SOO Coling Distribution Unit - In Rack.docx` ("Coling").
- Part separator formatting varies between and within documents.

**Tracker (`Sequence of Operations Tracker.xlsx`)**
- Rows 16, 17 and 20 are blank or partial.
- Columns drift right partway down the sheet — later rows carry stray values
  (`Glycol Pump`, `VAV box`, `Roof top unit`) in unlabeled columns, so the sheet has been
  edited into a state where a column no longer means one thing.
- Four tracked items have **no SOO document at all**: Humidifying Unit, Adiabatic Pump,
  Leak Detection for Mechanical Gallery, Water Heater.
- An open question is recorded in a comment rather than resolved: *"Confirm whether 10 psi
  is cut-in, cut-out, or alarm"* — and `013. Glycol Feed` does define both Cut-In and
  Cut-Out pressure parts, so the tracker note is answerable from the document set.
- `Needed for Project?` is `1` only for Dry Cooler and Rooftop Unit; everything else is `0`.

## 5. What this changes in the plan

1. **Structure detection is text-pattern, not style-based.** The original plan assumed
   Word heading styles. They do not exist in these documents. `PART n –` plus `numId`
   grouping replaces that entirely.
2. **Rules-first parsing is now clearly right,** and the LLM's role shrinks further than
   planned. The lead-in grammar in §2 covers most of the corpus deterministically.
3. **Graph granularity: one graph per PART,** plus a document-level map showing parts and
   their cross-references. A whole document is 20–53 parts and would be unreadable as a
   single flow.
4. **New gap rule class: spine conformance** (§3). Cheap, deterministic, already
   productive.
5. **IR additions:** `modality` (shall/should/may), `condition` (where provided/available/
   required), `part` grouping, and an explicit `list_operator` (AND / OR / SEQUENCE /
   INVENTORY) on step groups.
6. **Inventory parts are not flow.** Alarms, Graphics, Trending, and Commissioning
   populate IR collections and are excluded from graph rendering.
7. **Two document types exist,** standalone and delta/revision (`003`). The IR needs
   `doc_type` so a delta document isn't measured against the full spine.
8. **`.dwg` is out of scope for v1.** Reading M900/M901 needs CAD tooling (ODA File
   Converter, or an exported DXF/PDF). Worth asking whether these diagrams should be the
   graph ground-truth later — if they already draw the control diagrams, matching the
   generated graph against them is a strong validation, but it is not a v1 concern.

## 6. Recommended first build target

`005. SOO Air Handling Unit` as the reference document, validated against `010. CRAH Unit`
and `006. Roof Top Unit`. Reasons: AHU is mid-size (794 blocks), exercises every archetype
in the spine including staging and redundancy, and CRAH/RTU are near-neighbours that will
immediately expose anything overfit to the AHU wording.

Hold `013. Glycol Feed` and `014. Exhaust Fans` back as unseen test documents — they are
structurally similar but in different domains (hydronic, exhaust), so they are a fair test
of whether the parser generalized or memorized.
