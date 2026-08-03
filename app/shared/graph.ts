/**
 * Graph model — what the canvas edits.
 *
 * Deliberately a peer of the IR rather than a view of it: a user can draw a graph
 * that never came from a document, and it still has to export. `toIr`/`fromIr`
 * bridge the two.
 */

export type NodeKind =
  | "start"
  | "end"
  | "action"
  | "condition"
  | "gate"
  | "delay"
  | "alarm"
  | "state"
  | "setpoint"
  | "note";

export interface SooNodeData {
  label: string;
  kind: NodeKind;
  /** Gate nodes only. */
  op?: "AND" | "OR";
  modality?: string | null;
  /** "where provided" — renders ghosted, excluded from missing-equipment checks. */
  condition?: string | null;
  part?: number | null;
  /** Timer text for delay nodes, e.g. "adjustable staging delay". */
  delay?: string | null;
  /** Back-pointer into the source document, when this came from an import. */
  sourceBlock?: number | null;
  [key: string]: unknown;
}

export interface SooNode {
  id: string;
  type: "soo";
  position: { x: number; y: number };
  data: SooNodeData;
  width?: number;
  height?: number;
}

export interface SooEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  /** "flow" is normal control flow; "interlock" draws dashed. */
  variant?: "flow" | "interlock";
}

export interface GraphPart {
  n: number;
  title: string;
  archetype: string;
  isInventory: boolean;
  nodes: SooNode[];
  edges: SooEdge[];
}

export interface SooGraph {
  equipmentClass: string;
  project: string;
  revision: string;
  sourceFile: string;
  parts: GraphPart[];
}

export const NODE_KINDS: { kind: NodeKind; label: string; hint: string }[] = [
  { kind: "start", label: "Start / End", hint: "Terminator — entry or exit of a sequence" },
  { kind: "action", label: "Action", hint: "A commanded step: start, open, enable, reset" },
  { kind: "condition", label: "Condition", hint: "Something that is or is not true" },
  { kind: "gate", label: "AND / OR gate", hint: "Combines conditions" },
  { kind: "delay", label: "Delay", hint: "An adjustable time delay before the action" },
  { kind: "alarm", label: "Alarm", hint: "Generates a BMS alarm" },
  { kind: "state", label: "Mode / State", hint: "An operating mode the system sits in" },
  { kind: "setpoint", label: "Setpoint", hint: "An adjustable value" },
  { kind: "note", label: "Note", hint: "Annotation — never exported as logic" },
];
