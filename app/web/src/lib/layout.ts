import type { SooEdge, SooNode } from "@shared/graph";

// ELK is ~1.4 MB. Load it the first time someone actually lays a part out rather
// than making every page load carry it.
type Elk = { layout: (graph: unknown) => Promise<{ children?: { id: string; x?: number; y?: number }[] }> };
let elkPromise: Promise<Elk> | null = null;

function getElk(): Promise<Elk> {
  if (!elkPromise) {
    elkPromise = import("elkjs/lib/elk.bundled.js").then((m) => new m.default() as Elk);
  }
  return elkPromise;
}

const SIZE: Record<string, { w: number; h: number }> = {
  gate: { w: 108, h: 56 },
  delay: { w: 190, h: 52 },
  start: { w: 260, h: 56 },
  end: { w: 200, h: 52 },
  note: { w: 280, h: 60 },
  default: { w: 280, h: 62 },
};

function sizeOf(node: SooNode) {
  const base = SIZE[node.data.kind] ?? SIZE.default;
  // Long labels need more room or the layout overlaps them.
  const lines = Math.ceil((node.data.label?.length ?? 20) / 38);
  return { w: base.w, h: Math.max(base.h, 26 + lines * 18) };
}

export async function autoLayout(
  nodes: SooNode[],
  edges: SooEdge[],
  direction: "RIGHT" | "DOWN" = "RIGHT",
): Promise<SooNode[]> {
  if (!nodes.length) return nodes;

  const graph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": direction,
      "elk.layered.spacing.nodeNodeBetweenLayers": "90",
      "elk.spacing.nodeNode": "28",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.edgeRouting": "ORTHOGONAL",
    },
    children: nodes.map((n) => {
      const { w, h } = sizeOf(n);
      return { id: n.id, width: w, height: h };
    }),
    edges: edges.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  };

  const elk = await getElk();
  const laid = await elk.layout(graph);
  const positions = new Map<string, { x: number; y: number }>(
    (laid.children ?? []).map((child) => [child.id, { x: child.x ?? 0, y: child.y ?? 0 }]),
  );

  return nodes.map((n) => {
    const p = positions.get(n.id);
    return p ? { ...n, position: p } : n;
  });
}
