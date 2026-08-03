import { create } from "zustand";
import {
  applyEdgeChanges,
  applyNodeChanges,
  type EdgeChange,
  type NodeChange,
} from "@xyflow/react";
import type { GraphPart, NodeKind, SooEdge, SooGraph, SooNode } from "@shared/graph";
import type { Finding, Setpoint, SooDocument } from "@shared/ir";

interface Snapshot {
  parts: GraphPart[];
  activePart: number | null;
}

interface State {
  graph: SooGraph | null;
  doc: SooDocument | null;
  activePart: number | null;
  selection: string[];
  status: string | null;
  busy: boolean;
  past: Snapshot[];
  future: Snapshot[];

  loadImport: (payload: { document: SooDocument; graph: SooGraph }) => void;
  startBlank: (equipmentClass: string) => void;
  setActivePart: (n: number) => void;
  setStatus: (s: string | null) => void;
  setBusy: (b: boolean) => void;

  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  connect: (source: string, target: string) => void;
  addNode: (kind: NodeKind, position: { x: number; y: number }) => void;
  updateNode: (id: string, patch: Partial<SooNode["data"]>) => void;
  deleteSelection: () => void;
  replaceLayout: (nodes: SooNode[]) => void;
  addPart: (title: string) => void;
  renamePart: (n: number, title: string) => void;
  removePart: (n: number) => void;

  commit: () => void;
  undo: () => void;
  redo: () => void;

  activeNodes: () => SooNode[];
  activeEdges: () => SooEdge[];
  findings: () => Finding[];
  setpoints: () => Setpoint[];
}

let seq = 0;
const nextId = (prefix: string) => `${prefix}${Date.now().toString(36)}${(seq += 1).toString(36)}`;

const KIND_LABEL: Record<NodeKind, string> = {
  start: "Start",
  end: "End",
  action: "New action",
  condition: "New condition",
  gate: "ALL of",
  delay: "wait adjustable delay",
  alarm: "New alarm",
  state: "New mode",
  setpoint: "New setpoint",
  note: "Note",
};

function emptyGraph(equipmentClass: string): SooGraph {
  return {
    equipmentClass,
    project: "",
    revision: "A",
    sourceFile: "",
    parts: [
      {
        n: 1,
        title: "System Description",
        archetype: "system_description",
        isInventory: false,
        nodes: [],
        edges: [],
      },
    ],
  };
}

export const useStore = create<State>((set, get) => ({
  graph: null,
  doc: null,
  activePart: null,
  selection: [],
  status: null,
  busy: false,
  past: [],
  future: [],

  loadImport: ({ document, graph }) =>
    set({
      doc: document,
      graph,
      activePart: graph.parts.length ? graph.parts[0].n : null,
      selection: [],
      past: [],
      future: [],
      status: `Imported ${document.sourceFile}`,
    }),

  startBlank: (equipmentClass) => {
    const graph = emptyGraph(equipmentClass);
    set({ graph, doc: null, activePart: 1, selection: [], past: [], future: [], status: null });
  },

  setActivePart: (n) => set({ activePart: n, selection: [] }),
  setStatus: (status) => set({ status }),
  setBusy: (busy) => set({ busy }),

  commit: () => {
    const { graph, activePart, past } = get();
    if (!graph) return;
    const snapshot: Snapshot = {
      parts: structuredClone(graph.parts),
      activePart,
    };
    set({ past: [...past.slice(-49), snapshot], future: [] });
  },

  undo: () => {
    const { past, future, graph, activePart } = get();
    if (!past.length || !graph) return;
    const previous = past[past.length - 1];
    const current: Snapshot = { parts: structuredClone(graph.parts), activePart };
    set({
      graph: { ...graph, parts: previous.parts },
      activePart: previous.activePart,
      past: past.slice(0, -1),
      future: [current, ...future].slice(0, 50),
      selection: [],
    });
  },

  redo: () => {
    const { past, future, graph, activePart } = get();
    if (!future.length || !graph) return;
    const next = future[0];
    const current: Snapshot = { parts: structuredClone(graph.parts), activePart };
    set({
      graph: { ...graph, parts: next.parts },
      activePart: next.activePart,
      past: [...past, current],
      future: future.slice(1),
      selection: [],
    });
  },

  onNodesChange: (changes) => {
    const { graph, activePart } = get();
    if (!graph || activePart === null) return;
    const structural = changes.some(
      (c) => c.type === "remove" || (c.type === "position" && c.dragging === false),
    );
    if (structural) get().commit();

    const parts = graph.parts.map((p) =>
      p.n === activePart
        ? { ...p, nodes: applyNodeChanges(changes, p.nodes as never) as unknown as SooNode[] }
        : p,
    );
    const selection = changes.reduce<string[]>((acc, c) => {
      if (c.type === "select") return c.selected ? [...acc, c.id] : acc.filter((id) => id !== c.id);
      return acc;
    }, get().selection);
    set({ graph: { ...graph, parts }, selection });
  },

  onEdgesChange: (changes) => {
    const { graph, activePart } = get();
    if (!graph || activePart === null) return;
    if (changes.some((c) => c.type === "remove")) get().commit();
    const parts = graph.parts.map((p) =>
      p.n === activePart
        ? { ...p, edges: applyEdgeChanges(changes, p.edges as never) as unknown as SooEdge[] }
        : p,
    );
    set({ graph: { ...graph, parts } });
  },

  connect: (source, target) => {
    const { graph, activePart } = get();
    if (!graph || activePart === null || source === target) return;
    get().commit();
    const parts = graph.parts.map((p) => {
      if (p.n !== activePart) return p;
      const exists = p.edges.some((e) => e.source === source && e.target === target);
      if (exists) return p;
      return {
        ...p,
        edges: [...p.edges, { id: nextId("e"), source, target, variant: "flow" as const }],
      };
    });
    set({ graph: { ...graph, parts } });
  },

  addNode: (kind, position) => {
    const { graph, activePart } = get();
    if (!graph || activePart === null) return;
    get().commit();
    const id = nextId("n");
    const node: SooNode = {
      id,
      type: "soo",
      position,
      data: {
        label: KIND_LABEL[kind],
        kind,
        ...(kind === "gate" ? { op: "AND" as const } : {}),
        ...(kind === "delay" ? { delay: "adjustable delay" } : {}),
        part: activePart,
      },
    };
    const parts = graph.parts.map((p) =>
      p.n === activePart ? { ...p, nodes: [...p.nodes, node] } : p,
    );
    set({ graph: { ...graph, parts }, selection: [id] });
  },

  updateNode: (id, patch) => {
    const { graph, activePart } = get();
    if (!graph || activePart === null) return;
    const parts = graph.parts.map((p) =>
      p.n === activePart
        ? {
            ...p,
            nodes: p.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)),
          }
        : p,
    );
    set({ graph: { ...graph, parts } });
  },

  deleteSelection: () => {
    const { graph, activePart, selection } = get();
    if (!graph || activePart === null || !selection.length) return;
    get().commit();
    const gone = new Set(selection);
    const parts = graph.parts.map((p) =>
      p.n === activePart
        ? {
            ...p,
            nodes: p.nodes.filter((n) => !gone.has(n.id)),
            edges: p.edges.filter((e) => !gone.has(e.source) && !gone.has(e.target)),
          }
        : p,
    );
    set({ graph: { ...graph, parts }, selection: [] });
  },

  replaceLayout: (nodes) => {
    const { graph, activePart } = get();
    if (!graph || activePart === null) return;
    get().commit();
    const parts = graph.parts.map((p) => (p.n === activePart ? { ...p, nodes } : p));
    set({ graph: { ...graph, parts } });
  },

  addPart: (title) => {
    const { graph } = get();
    if (!graph) return;
    get().commit();
    const n = graph.parts.length ? Math.max(...graph.parts.map((p) => p.n)) + 1 : 1;
    const part: GraphPart = {
      n,
      title,
      archetype: "control_loop",
      isInventory: false,
      nodes: [],
      edges: [],
    };
    set({ graph: { ...graph, parts: [...graph.parts, part] }, activePart: n });
  },

  renamePart: (n, title) => {
    const { graph } = get();
    if (!graph) return;
    const parts = graph.parts.map((p) => (p.n === n ? { ...p, title } : p));
    set({ graph: { ...graph, parts } });
  },

  removePart: (n) => {
    const { graph, activePart } = get();
    if (!graph || graph.parts.length <= 1) return;
    get().commit();
    const parts = graph.parts.filter((p) => p.n !== n);
    set({
      graph: { ...graph, parts },
      activePart: activePart === n ? parts[0].n : activePart,
    });
  },

  activeNodes: () => {
    const { graph, activePart } = get();
    if (!graph || activePart === null) return [];
    return graph.parts.find((p) => p.n === activePart)?.nodes ?? [];
  },

  activeEdges: () => {
    const { graph, activePart } = get();
    if (!graph || activePart === null) return [];
    return graph.parts.find((p) => p.n === activePart)?.edges ?? [];
  },

  findings: () => get().doc?.findings ?? [],
  setpoints: () => get().doc?.setpoints ?? [],
}));
