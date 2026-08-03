/**
 * The SOO intermediate representation.
 *
 * Documents parse into it, the canvas renders from it, exports generate from it,
 * and the gap rules run on it. Shared verbatim between server and web.
 */

export type Operator = "AND" | "OR" | "SEQUENCE" | "INVENTORY" | "UNKNOWN";
export type Modality = "shall" | "shall not" | "should" | "may" | null;
export type Severity = "error" | "warning" | "info";
export type DocType = "standalone" | "delta";

export interface Source {
  part: number | null;
  block: number;
  page?: number | null;
}

export interface Step {
  id: string;
  text: string;
  part: number | null;
  group: string | null;
  modality: Modality;
  /** "where provided" and friends — conditional equipment, drawn ghosted. */
  condition: string | null;
  source: Source | null;
}

export interface Group {
  id: string;
  part: number | null;
  leadIn: string;
  operator: Operator;
  modality: Modality;
  /** e.g. "adjustable staging delay" — becomes a timer node. */
  delay: string | null;
  condition: string | null;
  items: string[];
  source: Source | null;
}

export interface Setpoint {
  id: string;
  name: string;
  rawValue: string;
  value: number | null;
  units: string | null;
  isPlaceholder: boolean;
  declaredInPart: number | null;
}

export interface Part {
  n: number;
  title: string;
  archetype: string;
  isInventory: boolean;
  blockStart: number;
  blockEnd: number;
  groups: string[];
  statements: string[];
}

export interface Finding {
  rule: string;
  severity: Severity;
  message: string;
  part: number | null;
  block: number | null;
}

export interface SooDocument {
  sourceFile: string;
  equipmentClass: string;
  docType: DocType;
  project: string;
  revision: string;
  parts: Part[];
  groups: Group[];
  steps: Step[];
  setpoints: Setpoint[];
  findings: Finding[];
}

export function emptyDocument(sourceFile = "", equipmentClass = ""): SooDocument {
  return {
    sourceFile,
    equipmentClass,
    docType: "standalone",
    project: "",
    revision: "",
    parts: [],
    groups: [],
    steps: [],
    setpoints: [],
    findings: [],
  };
}
