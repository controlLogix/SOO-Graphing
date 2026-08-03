/**
 * IR <-> graph.
 *
 * `irToGraph` draws an imported document. `graphToIr` reads the canvas back so a
 * hand-drawn graph can be written out as a specification — the two directions the
 * tool exists for.
 */
import type { GraphPart, SooEdge, SooGraph, SooNode, SooNodeData } from "@shared/graph";
import type { Group, SooDocument, Step } from "@shared/ir";

const COL = 380;
const ROW = 74;
const GROUP_GAP = 90;

function node(
  id: string,
  x: number,
  y: number,
  data: SooNodeData,
): SooNode {
  return { id, type: "soo", position: { x, y }, data };
}

export function irToGraph(doc: SooDocument): SooGraph {
  const stepById = new Map(doc.steps.map((s) => [s.id, s]));

  const parts: GraphPart[] = doc.parts.map((part) => {
    const nodes: SooNode[] = [];
    const edges: SooEdge[] = [];
    let cursorY = 0;

    for (const sid of part.statements) {
      const step = stepById.get(sid);
      if (!step) continue;
      nodes.push(
        node(sid, 0, cursorY, {
          label: step.text,
          kind: "note",
          modality: step.modality,
          condition: step.condition,
          part: part.n,
          sourceBlock: step.source?.block ?? null,
        }),
      );
      cursorY += ROW;
    }
    if (part.statements.length) cursorY += GROUP_GAP;

    for (const gid of part.groups) {
      const group = doc.groups.find((g) => g.id === gid);
      if (!group) continue;
      const built = buildGroup(group, stepById, cursorY, part.n);
      nodes.push(...built.nodes);
      edges.push(...built.edges);
      cursorY = built.nextY + GROUP_GAP;
    }

    return {
      n: part.n,
      title: part.title,
      archetype: part.archetype,
      isInventory: part.isInventory,
      nodes,
      edges,
    };
  });

  return {
    equipmentClass: doc.equipmentClass,
    project: doc.project,
    revision: doc.revision,
    sourceFile: doc.sourceFile,
    parts,
  };
}

function buildGroup(
  group: Group,
  stepById: Map<string, Step>,
  startY: number,
  partN: number,
): { nodes: SooNode[]; edges: SooEdge[]; nextY: number } {
  const nodes: SooNode[] = [];
  const edges: SooEdge[] = [];
  const items = group.items.map((id) => stepById.get(id)).filter(Boolean) as Step[];

  const base = (step: Step, kind: SooNodeData["kind"]): SooNodeData => ({
    label: step.text,
    kind,
    modality: step.modality,
    condition: step.condition,
    part: partN,
    sourceBlock: step.source?.block ?? null,
  });

  if (group.operator === "INVENTORY") {
    nodes.push(
      node(group.id, 0, startY, {
        label: group.leadIn,
        kind: "note",
        part: partN,
        modality: group.modality,
        condition: group.condition,
        sourceBlock: group.source?.block ?? null,
      }),
    );
    // Fan the items out from the lead-in so the list survives a graph -> document
    // round trip. Without the edges they read back as loose paragraphs.
    items.forEach((step, i) => {
      nodes.push(node(step.id, COL, startY + i * ROW, base(step, "note")));
      edges.push({
        id: `${group.id}->${step.id}`,
        source: group.id,
        target: step.id,
        variant: "flow",
      });
    });
    return { nodes, edges, nextY: startY + Math.max(1, items.length) * ROW };
  }

  if (group.operator === "SEQUENCE") {
    nodes.push(
      node(group.id, 0, startY, {
        label: group.leadIn,
        kind: "start",
        part: partN,
        modality: group.modality,
        condition: group.condition,
        sourceBlock: group.source?.block ?? null,
      }),
    );
    let prev = group.id;
    items.forEach((step, i) => {
      const kind: SooNodeData["kind"] = /alarm/i.test(step.text) ? "alarm" : "action";
      nodes.push(node(step.id, COL, startY + i * ROW, base(step, kind)));
      edges.push({ id: `${prev}->${step.id}`, source: prev, target: step.id, variant: "flow" });
      prev = step.id;
    });
    return { nodes, edges, nextY: startY + Math.max(1, items.length) * ROW };
  }

  // AND / OR / UNKNOWN: conditions converge on a gate, then optionally a delay.
  const gateId = `${group.id}_gate`;
  items.forEach((step, i) => {
    nodes.push(node(step.id, 0, startY + i * ROW, base(step, "condition")));
    edges.push({ id: `${step.id}->${gateId}`, source: step.id, target: gateId, variant: "flow" });
  });

  const midY = startY + ((Math.max(1, items.length) - 1) * ROW) / 2;
  nodes.push(
    node(gateId, COL, midY, {
      label: group.operator === "OR" ? "ANY of" : "ALL of",
      kind: "gate",
      op: group.operator === "OR" ? "OR" : "AND",
      part: partN,
    }),
  );

  let tail = gateId;
  let x = COL * 2;
  if (group.delay) {
    const delayId = `${group.id}_delay`;
    nodes.push(
      node(delayId, x, midY, {
        label: `wait ${group.delay}`,
        kind: "delay",
        delay: group.delay,
        part: partN,
      }),
    );
    edges.push({ id: `${tail}->${delayId}`, source: tail, target: delayId, variant: "flow" });
    tail = delayId;
    x += COL;
  }

  nodes.push(
    node(group.id, x, midY, {
      label: group.leadIn,
      kind: "state",
      part: partN,
      modality: group.modality,
      condition: group.condition,
      sourceBlock: group.source?.block ?? null,
    }),
  );
  edges.push({ id: `${tail}->${group.id}`, source: tail, target: group.id, variant: "flow" });

  return { nodes, edges, nextY: startY + Math.max(1, items.length) * ROW };
}

/* ------------------------------------------------------------------ */
/* graph -> IR                                                         */
/* ------------------------------------------------------------------ */

export interface ProseGroup {
  leadIn: string;
  operator: "AND" | "OR" | "SEQUENCE" | "INVENTORY";
  delay: string | null;
  items: string[];
}

export interface ProsePart {
  n: number;
  title: string;
  groups: ProseGroup[];
  statements: string[];
}

/**
 * Read the canvas back into ordered prose groups.
 *
 * Gates are the anchor: whatever feeds a gate is a condition set, and whatever
 * the gate eventually reaches is the outcome that becomes the lead-in. Chains
 * starting from a terminator are sequences. Anything left over is a statement,
 * so nothing the user drew is silently dropped on export.
 */
export function graphToProse(graph: SooGraph): ProsePart[] {
  return graph.parts.map((part) => {
    const byId = new Map(part.nodes.map((n) => [n.id, n]));
    const outgoing = new Map<string, SooEdge[]>();
    const incoming = new Map<string, SooEdge[]>();
    for (const e of part.edges) {
      if (!outgoing.has(e.source)) outgoing.set(e.source, []);
      if (!incoming.has(e.target)) incoming.set(e.target, []);
      outgoing.get(e.source)!.push(e);
      incoming.get(e.target)!.push(e);
    }

    const consumed = new Set<string>();
    const groups: ProseGroup[] = [];

    const sorted = [...part.nodes].sort(
      (a, b) => a.position.y - b.position.y || a.position.x - b.position.x,
    );

    // Gates first — they define the conjunctive and disjunctive sets.
    for (const gate of sorted) {
      if (gate.data.kind !== "gate") continue;
      const feeders = (incoming.get(gate.id) ?? [])
        .map((e) => byId.get(e.source))
        .filter(Boolean) as SooNode[];

      let delay: string | null = null;
      let cursor: SooNode | undefined = gate;
      const chain: SooNode[] = [];
      while (cursor) {
        const next = (outgoing.get(cursor.id) ?? [])
          .map((e) => byId.get(e.target))
          .filter(Boolean)[0] as SooNode | undefined;
        if (!next || consumed.has(next.id)) break;
        if (next.data.kind === "delay") {
          delay = next.data.delay ?? next.data.label.replace(/^wait\s+/i, "");
          consumed.add(next.id);
          cursor = next;
          continue;
        }
        chain.push(next);
        break;
      }

      const outcome = chain[0];
      const leadIn = outcome ? outcome.data.label : gate.data.label;
      consumed.add(gate.id);
      if (outcome) consumed.add(outcome.id);
      feeders.forEach((f) => consumed.add(f.id));

      groups.push({
        leadIn: withColon(leadIn),
        operator: gate.data.op === "OR" ? "OR" : "AND",
        delay,
        items: feeders.map((f) => f.data.label),
      });
    }

    // Then hubs: one node fanning out to leaves is a list, not a chain — an
    // inventory on import, and the natural way to draw a bulleted list by hand.
    for (const hub of sorted) {
      if (consumed.has(hub.id) || hub.data.kind === "gate") continue;
      const outs = (outgoing.get(hub.id) ?? [])
        .map((e) => byId.get(e.target))
        .filter(Boolean) as SooNode[];
      if (outs.length < 2) continue;
      const allLeaves = outs.every(
        (n) => !consumed.has(n.id) && (outgoing.get(n.id) ?? []).length === 0,
      );
      if (!allLeaves) continue;

      consumed.add(hub.id);
      outs.forEach((n) => consumed.add(n.id));
      groups.push({
        leadIn: withColon(hub.data.label),
        operator: "INVENTORY",
        delay: null,
        items: outs.map((n) => n.data.label),
      });
    }

    // Then sequences: a chain hanging off a terminator or an unconsumed root.
    for (const start of sorted) {
      if (consumed.has(start.id)) continue;
      const hasOut = (outgoing.get(start.id) ?? []).length > 0;
      const hasIn = (incoming.get(start.id) ?? []).length > 0;
      if (!hasOut || hasIn) continue;

      const items: string[] = [];
      let cursor: SooNode | undefined = start;
      const seen = new Set<string>([start.id]);
      while (cursor) {
        const next = (outgoing.get(cursor.id) ?? [])
          .map((e) => byId.get(e.target))
          .filter(Boolean)[0] as SooNode | undefined;
        if (!next || seen.has(next.id)) break;
        seen.add(next.id);
        items.push(next.data.label);
        cursor = next;
      }
      seen.forEach((id) => consumed.add(id));
      if (!items.length) continue;
      groups.push({
        leadIn: withColon(start.data.label),
        operator: "SEQUENCE",
        delay: null,
        items,
      });
    }

    const statements = sorted
      .filter((n) => !consumed.has(n.id) && n.data.kind !== "gate")
      .map((n) => n.data.label);

    return { n: part.n, title: part.title, groups, statements };
  });
}

function withColon(text: string): string {
  const trimmed = text.trim().replace(/[:.]$/, "");
  return `${trimmed}:`;
}
