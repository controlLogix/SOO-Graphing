/**
 * The lead-in grammar.
 *
 * This is the load-bearing part of the parse: the lead-in sentence declares what the
 * list under it *means*. These are the cases the grammar exists to get right, including
 * the precedence cases where two rules could both fire and the more specific one has to
 * win. See docs/document-model.md §2.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { classify, conditionOf, delayOf, isLeadIn, modalityOf } from "../server/parse/lead-in.js";

describe("classify", () => {
  const cases: [string, string][] = [
    // Conditions that must all hold.
    ["The air-handling unit shall be considered available when:", "AND"],
    ["The unit shall be considered occupied when all of the following are true:", "AND"],
    ["Before starting the supply fan the BMS shall confirm:", "AND"],

    // Triggers where any one suffices.
    ["An additional stage shall be enabled when one or more of the following persist:", "OR"],
    ["The unit shall stage down when any of the following occur:", "OR"],
    ["The controlled variable may be:", "OR"],

    // Ordered instructions.
    ["Upon a call for cooling, the BMS shall execute the following sequence:", "SEQUENCE"],
    ["Where BMS communication is lost, the unit shall:", "SEQUENCE"],
    ["Following restoration of normal power, the unit shall:", "SEQUENCE"],
    ["During occupied hours the unit shall:", "SEQUENCE"],

    // Point lists. These populate collections and draw no logic.
    ["The BMS shall trend the following points:", "INVENTORY"],
    ["The air-handling unit shall include the following major components:", "INVENTORY"],
    ["BMS graphics shall show:", "INVENTORY"],

    // No modality, no conditional keyword, no directive verb: refuse to guess.
    ["The following abbreviations apply to this section:", "UNKNOWN"],
  ];

  for (const [leadIn, expected] of cases) {
    test(`${expected.padEnd(9)} ${leadIn}`, () => {
      assert.equal(classify(leadIn), expected);
    });
  }

  test("a disjunction marker outranks the alarm conjunction rule", () => {
    // Both `any of the following` (OR) and `alarm shall be annunciated when` (AND)
    // match this sentence. The explicit disjunction marker has to win, or every
    // multi-trigger alarm would be drawn as an AND gate that never fires.
    assert.equal(classify("An alarm shall be annunciated when any of the following occur:"), "OR");
  });

  test("a trailing colon and collapsed whitespace do not change the verdict", () => {
    assert.equal(classify("The BMS shall trend the following points"), "INVENTORY");
    assert.equal(classify("The   BMS shall\ttrend the following points:  "), "INVENTORY");
  });
});

describe("modalityOf", () => {
  test("reads contractual modality, negation first", () => {
    assert.equal(modalityOf("The unit shall start."), "shall");
    assert.equal(modalityOf("The unit shall not start."), "shall not");
    assert.equal(modalityOf("The unit should resume its previous mode."), "should");
    assert.equal(modalityOf("The alarm may be cleared manually."), "may");
  });

  test("is null when the sentence states a fact rather than an obligation", () => {
    assert.equal(modalityOf("Airflow is proven through the status input."), null);
  });
});

describe("delayOf", () => {
  test("recovers a named adjustable delay", () => {
    assert.equal(
      delayOf("...conditions persist for the adjustable staging delay:"),
      "adjustable staging delay",
    );
  });

  test("recovers a concrete duration", () => {
    assert.equal(delayOf("Revert to local stand-alone control after 5 minutes."), "5 minutes");
  });

  test("is null when no delay is stated", () => {
    assert.equal(delayOf("Start the supply fan at minimum speed."), null);
  });
});

describe("conditionOf", () => {
  test("marks conditionally-provided equipment", () => {
    assert.equal(
      conditionOf("A heating coil, where provided, with a modulating valve."),
      "where provided",
    );
    assert.equal(conditionOf("Duct smoke detectors where required."), "where required");
  });

  test("is null for unconditional equipment", () => {
    assert.equal(conditionOf("A chilled-water cooling coil."), null);
  });
});

describe("isLeadIn", () => {
  test("a lead-in ends in a colon; prose does not", () => {
    assert.equal(isLeadIn("The BMS shall trend the following points:"), true);
    assert.equal(isLeadIn("The following applies during a communications outage."), false);
  });
});
