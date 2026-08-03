/**
 * End-to-end parse of the sample document.
 *
 * Reads the committed `sample/001. SOO Sample Air Handling Unit.docx` through the real
 * .docx reader and the real three-pass parser — no stubs — and asserts the IR that comes
 * out. The sample is fictional and deliberately defective; see sample/README.md for the
 * list of planted defects, each of which is asserted below.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readDocxBlocks } from "../server/parse/docx-reader.js";
import { parseBlocks, equipmentClassFromName } from "../server/parse/parser.js";
import { SAMPLE_FILENAME, sampleDocxBuffer, samplePath } from "../sample/build-sample-soo.js";
import type { Group } from "@shared/ir";

const blocks = await readDocxBlocks(await readFile(samplePath()));
const doc = parseBlocks(blocks, SAMPLE_FILENAME);

const partNumbers = doc.parts.map((p) => p.n);
const groupIn = (part: number): Group[] => doc.groups.filter((g) => g.part === part);
const findings = (rule: string) => doc.findings.filter((f) => f.rule === rule);

describe("document metadata", () => {
  test("equipment class comes from the file name, stripped of index and SOO prefix", () => {
    assert.equal(doc.equipmentClass, "Sample Air Handling Unit");
    assert.equal(equipmentClassFromName("010. SOO CRAH Unit.docx"), "CRAH Unit");
    assert.equal(equipmentClassFromName("015a. SOO Ventilation.docx"), "Ventilation");
  });

  test("revision is read from the cover block", () => {
    assert.equal(doc.revision, "A");
  });

  test("a document with no revised parts is standalone, not a delta", () => {
    assert.equal(doc.docType, "standalone");
  });
});

describe("structure pass", () => {
  test("finds every PART heading and keeps document order", () => {
    assert.deepEqual(partNumbers, [1, 2, 3, 4, 5, 6, 9, 10, 11, 12]);
  });

  test("maps part titles onto spine archetypes", () => {
    assert.deepEqual(
      doc.parts.map((p) => p.archetype),
      [
        "system_description",
        "definitions",
        "setpoints",
        "availability",
        "start_sequence",
        "staging",
        "comm_failure",
        "power_failure",
        "alarms",
        "trending",
      ],
    );
  });

  test("point-list parts are marked as inventories", () => {
    const inventories = doc.parts.filter((p) => p.isInventory).map((p) => p.n);
    assert.deepEqual(inventories, [3, 11, 12]);
  });
});

describe("grouping pass", () => {
  test("each lead-in owns the list that follows it", () => {
    assert.equal(doc.groups.length, 10);
    assert.deepEqual(
      doc.groups.map((g) => g.items.length),
      [4, 4, 2, 4, 4, 3, 3, 3, 3, 3],
    );
  });

  test("the lead-in determines the operator", () => {
    assert.equal(groupIn(1)[0].operator, "INVENTORY"); // "shall include the following"
    assert.equal(groupIn(2)[1].operator, "AND"); // "considered occupied when all of"
    assert.equal(groupIn(4)[0].operator, "AND"); // "considered available when"
    assert.equal(groupIn(5)[0].operator, "SEQUENCE"); // "Upon a call for cooling"
    assert.equal(groupIn(6)[0].operator, "OR"); // "one or more of the following"
    assert.equal(groupIn(9)[0].operator, "SEQUENCE"); // "Where ... is lost"
    assert.equal(groupIn(10)[0].operator, "SEQUENCE"); // "Following restoration"
  });

  test("an inventory part overrides the operator the lead-in would imply", () => {
    // "An alarm shall be annunciated when any of the following occur:" reads as a
    // disjunction on its own, but an Alarms part is a point inventory, so nothing in
    // it should be drawn as logic.
    const alarms = groupIn(11)[0];
    assert.equal(alarms.operator, "INVENTORY");
  });

  test("an adjustable delay is lifted out of the lead-in", () => {
    assert.equal(groupIn(6)[0].delay, "adjustable staging delay");
    assert.equal(groupIn(4)[0].delay, null);
  });

  test("list items typed with a bullet glyph group like numbered ones", () => {
    // PART 12's list uses "• " rather than Word numbering.
    const trending = groupIn(12)[0];
    assert.equal(trending.items.length, 3);
    assert.equal(trending.operator, "INVENTORY");
    const texts = trending.items.map((id) => doc.steps.find((s) => s.id === id)!.text);
    assert.deepEqual(texts, [
      "Supply-air temperature.",
      "Supply-duct static pressure.",
      "Supply-fan speed command.",
    ]);
  });
});

describe("extraction pass", () => {
  test("conditional equipment keeps its condition", () => {
    const conditional = doc.steps.filter((s) => s.condition);
    assert.equal(conditional.length, 1);
    assert.equal(conditional[0].condition, "where provided");
    assert.match(conditional[0].text, /heating coil/);
  });

  test("an item's own modality overrides the group's", () => {
    const part10 = doc.steps.filter((s) => s.part === 10 && s.group);
    assert.deepEqual(
      part10.map((s) => s.modality),
      ["shall", "should", "may"],
    );
  });

  test("every step carries a source back-pointer into the document", () => {
    assert.ok(doc.steps.length > 0);
    for (const s of doc.steps) {
      assert.ok(s.source, `step ${s.id} has no source`);
      assert.equal(typeof s.source!.block, "number");
    }
  });
});

describe("setpoint table", () => {
  test("reads the Adjustable Setpoints table", () => {
    assert.deepEqual(
      doc.setpoints.map((s) => s.name),
      [
        "Supply Air Temperature Setpoint",
        "Minimum Outside-Air Damper Position",
        "Economizer Changeover Temperature",
        "Cooling Stage Delay",
      ],
    );
    assert.ok(doc.setpoints.every((s) => s.declaredInPart === 3));
  });

  test("parses value and units, and flags unfilled placeholders", () => {
    const [sat, damper] = doc.setpoints;
    assert.equal(sat.value, 55);
    assert.equal(sat.units, "°F");
    assert.equal(sat.isPlaceholder, false);
    assert.equal(damper.value, 20);
    assert.equal(damper.units, "%");

    const delay = doc.setpoints.find((s) => s.name === "Cooling Stage Delay")!;
    assert.equal(delay.isPlaceholder, true);
    assert.equal(delay.value, null, "a placeholder must not be read as a number");
  });

  test("ids are slugified for stable referencing", () => {
    assert.equal(doc.setpoints[0].id, "supply_air_temperature_setpoint");
  });
});

describe("gap analysis", () => {
  test("a PART numbering jump is an error and names what is missing", () => {
    const gap = findings("part_numbering_gap");
    assert.equal(gap.length, 1);
    assert.equal(gap[0].severity, "error");
    assert.match(gap[0].message, /6 → 9/);
    assert.match(gap[0].message, /missing PART 7, 8/);
  });

  test("a missing required spine part is an error; optional ones are info", () => {
    const missing = findings("missing_spine_part");
    const errors = missing.filter((f) => f.severity === "error");
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /commissioning/);
    assert.ok(
      missing.some((f) => f.severity === "info" && /graphics/.test(f.message)),
      "an absent optional part should be info, not error",
    );
  });

  test("a list with no colon lead-in above it is reported", () => {
    const orphanList = findings("list_without_lead_in");
    assert.equal(orphanList.length, 1);
    assert.equal(orphanList[0].severity, "warning");
    assert.equal(orphanList[0].part, 9);
  });

  test("items under an unattached list are reported rather than silently parsed", () => {
    // The two items below "The following applies during a communications outage."
    // belong to no group, so they must not appear as steps pretending to be logic.
    const texts = doc.steps.map((s) => s.text);
    assert.ok(!texts.some((t) => t.includes("buffered in the unit controller")));
  });

  test("a list item that lost its numbering is reported", () => {
    const orphan = findings("orphaned_list_item");
    assert.equal(orphan.length, 1);
    assert.equal(orphan[0].severity, "warning");
    assert.match(orphan[0].message, /Outside-air damper position feedback/);
  });

  test("a lead-in the grammar cannot classify is surfaced, not guessed", () => {
    const unclassified = findings("unclassified_lead_in");
    assert.equal(unclassified.length, 1);
    assert.equal(unclassified[0].part, 2);
    assert.equal(groupIn(2)[0].operator, "UNKNOWN");
  });

  test("template placeholders are info, not an error", () => {
    // An unissued tender document is *expected* to hold placeholders. Reporting them
    // as errors is how a gap report starts crying wolf.
    const placeholder = findings("setpoint_placeholder");
    assert.equal(placeholder.length, 1);
    assert.equal(placeholder[0].severity, "info");
    assert.match(placeholder[0].message, /1 of 4/);
  });

  test("a document with a setpoint table is not flagged as missing one", () => {
    assert.equal(findings("no_setpoint_table").length, 0);
  });
});

describe("the committed sample matches its source script", () => {
  // The .docx writer embeds timestamps, so the file is not byte-reproducible and cannot
  // be compared by hash. The meaningful invariant is that it parses to the same IR: if
  // build-sample-soo.ts is edited without re-running `npm run sample`, this fails.
  test("regenerating from build-sample-soo.ts yields the same IR", async () => {
    const fresh = parseBlocks(await readDocxBlocks(await sampleDocxBuffer()), SAMPLE_FILENAME);
    assert.deepEqual(
      fresh.parts.map((p) => [p.n, p.title]),
      doc.parts.map((p) => [p.n, p.title]),
    );
    assert.deepEqual(
      fresh.groups.map((g) => [g.operator, g.items.length]),
      doc.groups.map((g) => [g.operator, g.items.length]),
    );
    assert.deepEqual(
      fresh.setpoints.map((s) => s.rawValue),
      doc.setpoints.map((s) => s.rawValue),
    );
    assert.deepEqual(
      fresh.findings.map((f) => f.rule),
      doc.findings.map((f) => f.rule),
    );
    assert.equal(fresh.steps.length, doc.steps.length);
  });
});

describe("degenerate input", () => {
  test("an empty document is reported, not thrown", () => {
    const empty = parseBlocks([], "empty.docx");
    assert.equal(empty.findings.length, 1);
    assert.equal(empty.findings[0].rule, "empty_document");
    assert.equal(empty.findings[0].severity, "error");
  });

  test("content with no PART headings is reported as unrecognised structure", () => {
    const prose = parseBlocks(
      [
        {
          index: 0,
          kind: "para",
          text: "Some prose with no headings at all.",
          style: "",
          numId: null,
          level: 0,
          rows: [],
          isListItem: false,
        },
      ],
      "prose.docx",
    );
    assert.equal(prose.findings[0].rule, "no_parts");
    assert.equal(prose.parts.length, 0);
  });
});
