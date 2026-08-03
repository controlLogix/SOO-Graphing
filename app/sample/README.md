# Sample document

`001. SOO Sample Air Handling Unit.docx` is a **fictional** Sequence of Operations for an
air-handling unit that does not exist. It is here so the tool can be tried without a real
specification, and so the parser has an end-to-end fixture that is safe to publish.

Import it through the UI (**Import** in the header), or regenerate it with:

```bash
npm run sample     # rewrites the .docx from build-sample-soo.ts
npm test           # parses it and asserts the result
```

`build-sample-soo.ts` is the authored source. Edit that, not the `.docx`.

The `.docx` writer embeds timestamps, so regenerating produces a **byte-different file even
when nothing changed** — it cannot be checked by hash, and there is no need to re-commit it
unless the content actually moved. What is enforced instead is that the committed file and
the script's current output parse to the *same IR*; `tests/parse.test.ts` fails if the
script is edited without running `npm run sample`.

---

## What it exercises

One document covering every operator the lead-in grammar recognises:

| PART | Lead-in | Operator |
|---|---|---|
| 1 | "…shall **include** the following major components:" | `INVENTORY` |
| 2 | "The following abbreviations apply to this section:" | `UNKNOWN` |
| 2 | "…shall be **considered occupied when all of** the following are true:" | `AND` |
| 4 | "…shall be **considered available when**:" | `AND` |
| 5 | "**Upon** a call for cooling…the following sequence:" | `SEQUENCE` |
| 6 | "…when **one or more of the following** conditions persist for the **adjustable staging delay**:" | `OR` + timer |
| 9 | "**Where** BMS communication is lost, the unit shall:" | `SEQUENCE` |
| 10 | "**Following** restoration of normal power, the unit shall:" | `SEQUENCE` |
| 11 | "An alarm shall be annunciated when **any of the following** occur:" | `INVENTORY` ⚠ |
| 12 | "The BMS shall **trend** the following points:" | `INVENTORY` |

⚠ PART 11 is the interesting one. That lead-in reads as a disjunction and `classify()`
returns `OR` for it in isolation — but an **Alarms** part is a point inventory, so the part
overrides the sentence and nothing in it is drawn as logic. Getting this backwards would
draw every multi-trigger alarm as an AND gate that never fires.

It also covers:

- **Per-item modality.** PART 10's three items are `shall` / `should` / `may`; the first
  inherits the group's `shall`, the other two override it. Modality is contractual and must
  never be promoted or demoted.
- **Conditional equipment.** PART 1's heating coil is "where provided", which the canvas
  renders ghosted and the gap rules exempt from missing-equipment checks.
- **Both list styles.** PARTS 1–11 use Word numbering; PART 12's list is typed with a `•`
  glyph, which the reader has to recognise as a list anyway.
- **A setpoint table** with real values, units (`°F`, `%`) and one unfilled placeholder.

---

## Planted defects

The gap engine is the part that earns the tool its keep, so the sample is **deliberately
defective**. These are intentional — not parser bugs:

| Where | Defect | Rule | Severity |
|---|---|---|---|
| PART 6 → 9 | PARTS 7 and 8 are absent | `part_numbering_gap` | error |
| — | No Testing and Commissioning part | `missing_spine_part` | error |
| PART 9 | "The following applies…" ends in a period, so the list under it is unattached | `list_without_lead_in` | warning |
| PART 12 | "Outside-air damper position feedback" lost its number | `orphaned_list_item` | warning |
| PART 2 | "The following abbreviations apply…" matches no operator pattern | `unclassified_lead_in` | info |
| PART 3 | Cooling Stage Delay is still `[___ s]` | `setpoint_placeholder` | info |

Two consequences worth understanding:

- **The unattached list's items are dropped, not guessed at.** They produce no steps.
  `tests/parse.test.ts` asserts their absence — an item the parser cannot attach to a
  lead-in must be reported rather than quietly promoted into logic that nobody wrote.
- **Placeholders and absent optional parts are `info`, not errors.** An unissued tender
  template is *expected* to hold `[___]` values, and most documents legitimately omit most
  optional spine parts. A gap report that cries wolf gets ignored.

Parsing the sample yields 17 findings: 2 errors, 2 warnings, 13 info.
