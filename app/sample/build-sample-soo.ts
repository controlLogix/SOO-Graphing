/**
 * Builds the sample Sequence of Operations document.
 *
 * This is the authored source for `sample/001. SOO Sample Air Handling Unit.docx`.
 * The document is entirely fictional. It describes an air-handling unit that does not
 * exist, and it deliberately contains defects so the gap engine has something to find:
 *
 *   PART 6 -> PART 9          a numbering jump              part_numbering_gap    error
 *   no commissioning part     a required spine archetype     missing_spine_part    error
 *   "The following applies…"  a list with no colon lead-in   list_without_lead_in  warning
 *   "Outside-air damper…"     a list item that lost its number  orphaned_list_item warning
 *   "The following abbrev…"   a lead-in matching no operator  unclassified_lead_in info
 *   "[___ s]"                 an unfilled template setpoint  setpoint_placeholder  info
 *
 * Those are intentional. `tests/parse.test.ts` asserts every one of them, so the sample
 * doubles as the parser's end-to-end fixture.
 *
 * Regenerate with `npm run sample`.
 */
import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

/** One numbering reference is enough: a plain paragraph always breaks the run. */
const LIST = "sample-list";

export const SAMPLE_FILENAME = "001. SOO Sample Air Handling Unit.docx";

const p = (text: string) => new Paragraph({ text, spacing: { after: 120 } });
const heading = (text: string) =>
  new Paragraph({ spacing: { before: 240, after: 120 }, children: [new TextRun({ text, bold: true })] });
const items = (...texts: string[]) =>
  texts.map((text) => new Paragraph({ text, numbering: { reference: LIST, level: 0 } }));

/** Not every author uses Word numbering — some type the glyph. The reader handles both. */
const glyphItems = (...texts: string[]) => texts.map((text) => new Paragraph({ text: `• ${text}` }));

function setpointTable(): Table {
  const row = (name: string, value: string, header = false) =>
    new TableRow({
      children: [name, value].map(
        (text) =>
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: [new Paragraph({ children: [new TextRun({ text, bold: header })] })],
          }),
      ),
    });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      row("Setpoint", "Initial Value", true),
      row("Supply Air Temperature Setpoint", "55 °F"),
      row("Minimum Outside-Air Damper Position", "20 %"),
      row("Economizer Changeover Temperature", "65 °F"),
      // Deliberately unfilled, as a tender-issue template would be.
      row("Cooling Stage Delay", "[___ s]"),
    ],
  });
}

export function sampleChildren(): (Paragraph | Table)[] {
  return [
    // ---- Cover block ----
    p("SEQUENCE OF OPERATIONS"),
    p("SAMPLE AIR HANDLING UNIT"),
    p("SECTION: 23 00 00"),
    p("TYPE OF DOCUMENT: Mechanical Specification – SEQUENCE OF OPERATIONS"),
    p("REVISION NUMBER: A"),

    // ---- PART 1 ----
    heading("PART 1 – System Description"),
    p(
      "This sample describes a fictional single-duct air-handling unit serving an open " +
        "office floor. It exists to exercise the parser and is not a real specification.",
    ),
    p("The air-handling unit shall include the following major components:"),
    ...items(
      "A variable-speed supply fan with a VFD.",
      "A chilled-water cooling coil with a modulating two-way valve.",
      "A heating coil, where provided, with a modulating two-way valve.",
      "A mixed-air section with outside-air and return-air dampers.",
    ),

    // ---- PART 2 ----
    heading("PART 2 – Definitions and Operating Modes"),
    // No modality and no conditional keyword, so the grammar declines to guess.
    p("The following abbreviations apply to this section:"),
    ...items(
      "AHU — air-handling unit.",
      "SAT — supply-air temperature.",
      "OA — outside air.",
      "VFD — variable-frequency drive.",
    ),
    p("The unit shall be considered occupied when all of the following are true:"),
    ...items(
      "The BMS time-of-day schedule is in its occupied period.",
      "No unoccupied override is active.",
    ),

    // ---- PART 3 ----
    heading("PART 3 – Adjustable Setpoints"),
    p("Setpoints listed below are adjustable through the BMS operator interface."),
    setpointTable(),

    // ---- PART 4 ----
    heading("PART 4 – Availability"),
    p("The air-handling unit shall be considered available when:"),
    ...items(
      "The local hand-off-auto selector is in the AUTO position.",
      "No fire-alarm shutdown signal is present.",
      "The supply-fan VFD reports no active fault.",
      "BMS communication with the unit controller is healthy.",
    ),

    // ---- PART 5 ----
    heading("PART 5 – Start-Up Sequence"),
    p("Upon a call for cooling, the BMS shall execute the following sequence:"),
    ...items(
      "Open the outside-air damper to its minimum position.",
      "Start the supply fan at minimum speed.",
      "Prove airflow through the supply-fan status input.",
      "Enable the supply-air temperature control loop.",
    ),

    // ---- PART 6 ----
    heading("PART 6 – Capacity Staging"),
    p(
      "An additional stage of cooling shall be enabled when one or more of the following " +
        "conditions persist for the adjustable staging delay:",
    ),
    ...items(
      "The supply-air temperature remains above its setpoint by more than 2 °F.",
      "The chilled-water valve remains fully open.",
      "Zone cooling demand remains above 80 %.",
    ),

    // ---- PART 9: PARTS 7 and 8 are deliberately absent ----
    heading("PART 9 – Loss of BMS Communication"),
    p("Where BMS communication is lost, the unit shall:"),
    ...items(
      "Maintain the last commanded supply-air temperature setpoint.",
      "Revert to local stand-alone control after 5 minutes.",
      "Annunciate a communications-failure alarm at the BMS.",
    ),
    // Ends in a period, so it is prose rather than a lead-in. The list below it is
    // therefore unattached, and its items are reported rather than parsed into steps.
    p("The following applies during a communications outage."),
    ...items(
      "Trend data shall continue to be buffered in the unit controller.",
      "The unit shall not shut down solely because of the outage.",
    ),

    // ---- PART 10 ----
    heading("PART 10 – Power Failure and Restoration"),
    p("Following restoration of normal power, the unit shall:"),
    ...items(
      "Remain off until the BMS commands a restart.",
      // Per-item modality overrides the group's.
      "The unit should resume its previous operating mode once restarted.",
      "Annunciate a power-failure alarm that may be cleared manually.",
    ),

    // ---- PART 11 ----
    heading("PART 11 – Alarms"),
    // Reads as a disjunction, but an Alarms part is an inventory, so the part wins.
    p("An alarm shall be annunciated when any of the following occur:"),
    ...items(
      "Supply-air temperature deviates from setpoint by more than 5 °F for 10 minutes.",
      "The supply fan is commanded on but airflow is not proven.",
      "The unit controller loses communication with the BMS.",
    ),

    // ---- PART 12 ----
    heading("PART 12 – BMS Trending"),
    p("The BMS shall trend the following points:"),
    ...glyphItems(
      "Supply-air temperature.",
      "Supply-duct static pressure.",
      "Supply-fan speed command.",
    ),
    // No terminal punctuation, directly after a list: a trend point that lost its number.
    p("Outside-air damper position feedback"),

    p("END OF SECTION"),
  ];
}

export function buildSampleDoc(): Document {
  return new Document({
    creator: "SOO Flow",
    title: "Sample Air Handling Unit — Sequence of Operations",
    numbering: {
      config: [
        {
          reference: LIST,
          levels: [
            {
              level: 0,
              format: "decimal",
              text: "%1.",
              style: { paragraph: { indent: { left: 720, hanging: 360 } } },
            },
          ],
        },
      ],
    },
    sections: [{ properties: {}, children: sampleChildren() }],
  });
}

export async function sampleDocxBuffer(): Promise<Buffer> {
  return Packer.toBuffer(buildSampleDoc());
}

/** Absolute path of the committed sample, so tests and the server can both find it. */
export function samplePath(): string {
  return fileURLToPath(new URL(SAMPLE_FILENAME, import.meta.url));
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) {
  const out = samplePath();
  await writeFile(out, await sampleDocxBuffer());
  console.log(`  wrote ${out}`);
}
