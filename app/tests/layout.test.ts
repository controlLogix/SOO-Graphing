/**
 * Import layout.
 *
 * Imported documents used to arrive with their nodes stacked on a fixed 74px pitch while
 * the nodes themselves grew to ~180px tall around a long sentence, so real documents
 * opened as a pile of overlapping boxes. The pitch is now derived from the same size
 * estimate the canvas feeds ELK, and these tests hold that line: **no two nodes in a part
 * may overlap**, however long the text.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readDocxBlocks } from "../server/parse/docx-reader.js";
import { parseBlocks } from "../server/parse/parser.js";
import { irToGraph } from "../server/graph/build.js";
import { estimateNodeSize } from "@shared/metrics";
import { emptyDocument, type SooDocument } from "@shared/ir";
import type { GraphPart } from "@shared/graph";
import { SAMPLE_FILENAME, samplePath } from "../sample/build-sample-soo.js";

interface Box {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const boxesOf = (part: GraphPart): Box[] =>
  part.nodes.map((n) => ({
    id: n.id,
    x: n.position.x,
    y: n.position.y,
    ...estimateNodeSize(n.data),
  }));

/** Every pair of boxes in a part that share area. */
function collisions(part: GraphPart): string[] {
  const boxes = boxesOf(part);
  const hits: string[] = [];
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i];
      const b = boxes[j];
      const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (overlapX > 0 && overlapY > 0) {
        hits.push(`part ${part.n}: ${a.id} overlaps ${b.id} by ${Math.round(overlapY)}px`);
      }
    }
  }
  return hits;
}

describe("estimateNodeSize", () => {
  test("a wrapping label is taller than a short one", () => {
    const short = estimateNodeSize({ label: "Start the fan.", kind: "action" });
    const long = estimateNodeSize({
      label:
        "The supply-air temperature shall be reset between its minimum and maximum " +
        "limits in response to the greatest zone cooling demand, subject to the " +
        "adjustable reset schedule configured at the BMS operator interface.",
      kind: "action",
    });
    assert.ok(long.h > short.h * 2, `expected a much taller node, got ${long.h} vs ${short.h}`);
  });

  test("width is capped so a long label wraps instead of running away", () => {
    const long = estimateNodeSize({ label: "x".repeat(500), kind: "note" });
    assert.equal(long.w, 300);
    assert.ok(long.h > 200, "500 characters at 300px wide has to be tall");
  });

  test("a gate is a fixed chip regardless of its label", () => {
    const a = estimateNodeSize({ label: "ALL of", kind: "gate" });
    const b = estimateNodeSize({ label: "ANY of", kind: "gate" });
    assert.deepEqual(a, b);
  });

  test("modality and condition badges add height", () => {
    const plain = estimateNodeSize({ label: "A coil.", kind: "note" });
    const badged = estimateNodeSize({
      label: "A coil.",
      kind: "note",
      modality: "shall",
      condition: "where provided",
    });
    assert.ok(badged.h > plain.h);
  });

  test("an empty label still gets a usable box", () => {
    const empty = estimateNodeSize({ label: "", kind: "note" });
    assert.ok(empty.w >= 120 && empty.h >= 48);
  });
});

const sampleDoc = parseBlocks(await readDocxBlocks(await readFile(samplePath())), SAMPLE_FILENAME);
const sampleGraph = irToGraph(sampleDoc);

describe("the sample lays out without collisions", () => {
  const graph = sampleGraph;

  test("no two nodes overlap in any part", () => {
    const hits = graph.parts.flatMap(collisions);
    assert.deepEqual(hits, []);
  });

  test("each part's nodes span real vertical distance rather than piling up", () => {
    for (const part of graph.parts) {
      if (part.nodes.length < 3) continue;
      const boxes = boxesOf(part);
      const top = Math.min(...boxes.map((b) => b.y));
      const bottom = Math.max(...boxes.map((b) => b.y + b.h));
      const tallest = Math.max(...boxes.map((b) => b.h));
      assert.ok(
        bottom - top > tallest,
        `part ${part.n} occupies ${Math.round(bottom - top)}px, no more than one node tall`,
      );
    }
  });
});

describe("long real-world statements", () => {
  // The corpus this parser was built for is full of sentences this long. They are the
  // case the old fixed pitch got wrong, so it is reproduced here with invented text
  // rather than depending on the (unpublished) source documents.
  const sentence = (n: number) =>
    `Condition ${n}: the supply-air temperature shall remain above its active setpoint ` +
    `by more than the adjustable deviation limit for the full duration of the adjustable ` +
    `staging delay, as configured at the BMS operator interface and subject to the ` +
    `prevailing occupancy schedule.`;

  function longDoc(): SooDocument {
    const doc = emptyDocument("long.docx", "Long Statements");
    doc.parts = [
      {
        n: 1,
        title: "Availability",
        archetype: "availability",
        isInventory: false,
        blockStart: 0,
        blockEnd: 99,
        groups: ["G1"],
        statements: ["S0"],
      },
    ];
    doc.groups = [
      {
        id: "G1",
        part: 1,
        leadIn: `${sentence(0)} The unit shall be considered available when:`,
        operator: "AND",
        modality: "shall",
        delay: "adjustable staging delay",
        condition: null,
        items: ["S1", "S2", "S3", "S4"],
        source: { part: 1, block: 1 },
      },
    ];
    doc.steps = [0, 1, 2, 3, 4].map((i) => ({
      id: `S${i}`,
      text: sentence(i),
      part: 1,
      group: i === 0 ? null : "G1",
      modality: "shall" as const,
      condition: i === 3 ? "where provided" : null,
      source: { part: 1, block: i + 1 },
    }));
    return doc;
  }

  const graph = irToGraph(longDoc());

  test("four long conditions plus a gate, delay and outcome do not collide", () => {
    assert.deepEqual(graph.parts.flatMap(collisions), []);
  });

  test("the gate, delay and outcome sit beside the conditions, not on top of them", () => {
    const nodes = graph.parts[0].nodes;
    const conditions = nodes.filter((n) => n.data.kind === "condition");
    const gate = nodes.find((n) => n.data.kind === "gate")!;
    const delay = nodes.find((n) => n.data.kind === "delay")!;
    const outcome = nodes.find((n) => n.data.kind === "state")!;

    const conditionRight = Math.max(
      ...conditions.map((n) => n.position.x + estimateNodeSize(n.data).w),
    );
    for (const [name, n] of [
      ["gate", gate],
      ["delay", delay],
      ["outcome", outcome],
    ] as const) {
      assert.ok(n.position.x >= conditionRight, `${name} should be clear of the conditions`);
    }
    assert.ok(delay.position.x > gate.position.x, "the delay follows the gate");
    assert.ok(outcome.position.x > delay.position.x, "the outcome follows the delay");
  });

  test("the gate is centred on the condition stack", () => {
    const nodes = graph.parts[0].nodes;
    const conditions = nodes.filter((n) => n.data.kind === "condition");
    const gate = nodes.find((n) => n.data.kind === "gate")!;
    const top = Math.min(...conditions.map((n) => n.position.y));
    const bottom = Math.max(...conditions.map((n) => n.position.y + estimateNodeSize(n.data).h));
    const gateMid = gate.position.y + estimateNodeSize(gate.data).h / 2;
    assert.ok(
      Math.abs(gateMid - (top + bottom) / 2) < 4,
      `gate centre ${Math.round(gateMid)} should track the stack centre ${Math.round((top + bottom) / 2)}`,
    );
  });
});
