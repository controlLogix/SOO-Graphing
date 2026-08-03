/**
 * The round trip: document -> IR -> graph -> document -> IR.
 *
 * The whole design rests on one intermediate representation serving both directions.
 * The way that claim breaks in practice is silent attrition — a part, an operator or a
 * setpoint quietly lost on the way through the canvas. So this re-parses the exported
 * document and compares it against the original IR.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readDocxBlocks } from "../server/parse/docx-reader.js";
import { parseBlocks } from "../server/parse/parser.js";
import { irToGraph } from "../server/graph/build.js";
import { graphToDocx } from "../server/export/docx.js";
import { graphToPdf } from "../server/export/pdf.js";
import { SAMPLE_FILENAME, samplePath } from "../sample/build-sample-soo.js";

const original = parseBlocks(await readDocxBlocks(await readFile(samplePath())), SAMPLE_FILENAME);
const graph = irToGraph(original);
const reparsed = parseBlocks(
  await readDocxBlocks(await graphToDocx(graph, original.setpoints, {})),
  SAMPLE_FILENAME,
);

const allNodes = graph.parts.flatMap((p) => p.nodes);

describe("IR -> graph", () => {
  test("every part becomes a graph part", () => {
    assert.equal(graph.parts.length, original.parts.length);
    assert.deepEqual(
      graph.parts.map((p) => p.n),
      original.parts.map((p) => p.n),
    );
  });

  test("an OR group becomes an OR gate and an AND group an AND gate", () => {
    const ops = allNodes.filter((n) => n.data.kind === "gate").map((n) => n.data.op);
    assert.ok(ops.includes("OR"), "the staging disjunction should produce an OR gate");
    assert.ok(ops.includes("AND"), "the availability conjunction should produce an AND gate");
  });

  test("an adjustable delay becomes a delay node carrying its timer text", () => {
    const delays = allNodes.filter((n) => n.data.kind === "delay");
    assert.equal(delays.length, 1);
    assert.equal(delays[0].data.delay, "adjustable staging delay");
  });

  test("conditional equipment stays marked so the canvas can ghost it", () => {
    const ghosted = allNodes.filter((n) => n.data.condition);
    assert.equal(ghosted.length, 1);
    assert.equal(ghosted[0].data.condition, "where provided");
  });

  test("the graph carries the document identity through", () => {
    assert.equal(graph.equipmentClass, original.equipmentClass);
    assert.equal(graph.revision, original.revision);
  });
});

describe("graph -> document -> IR", () => {
  test("no part is lost or renumbered", () => {
    assert.deepEqual(
      reparsed.parts.map((p) => p.n),
      original.parts.map((p) => p.n),
    );
    assert.deepEqual(
      reparsed.parts.map((p) => p.title),
      original.parts.map((p) => p.title),
    );
  });

  test("every group survives with the same operator", () => {
    assert.equal(reparsed.groups.length, original.groups.length);
    assert.deepEqual(
      reparsed.groups.map((g) => g.operator),
      original.groups.map((g) => g.operator),
    );
  });

  test("the adjustable delay survives the round trip", () => {
    assert.deepEqual(
      reparsed.groups.map((g) => g.delay).filter(Boolean),
      ["adjustable staging delay"],
    );
  });

  test("the setpoint table survives with its values", () => {
    assert.deepEqual(
      reparsed.setpoints.map((s) => s.name),
      original.setpoints.map((s) => s.name),
    );
    assert.deepEqual(
      reparsed.setpoints.map((s) => s.rawValue),
      original.setpoints.map((s) => s.rawValue),
    );
  });

  test("the equipment class survives", () => {
    assert.equal(reparsed.equipmentClass, original.equipmentClass);
  });
});

describe("export metadata", () => {
  test("no organisation is compiled into the exporter", async () => {
    // The cover subtitle is the equipment class alone when no organisation is given —
    // there is no firm name or logo baked into the output.
    const blocks = await readDocxBlocks(await graphToDocx(graph, original.setpoints, {}));
    assert.equal(blocks[1].text, "SAMPLE AIR HANDLING UNIT");
  });

  test("an organisation, when supplied, lands on the cover", async () => {
    const blocks = await readDocxBlocks(
      await graphToDocx(graph, original.setpoints, { organization: "Example Engineering" }),
    );
    assert.equal(blocks[1].text, "SAMPLE AIR HANDLING UNIT – Example Engineering");
  });

  test("the PDF exporter produces a PDF without needing an organisation or a logo", async () => {
    const pdf = await graphToPdf(graph, original.setpoints, {});
    assert.ok(pdf.length > 1000, "expected a non-trivial PDF");
    assert.equal(pdf.subarray(0, 5).toString("latin1"), "%PDF-");
  });
});
