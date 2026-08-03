import type { GraphPart, SooEdge, SooNode } from "@shared/graph";
import { estimateNodeSize } from "@shared/metrics";

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

const sizeOf = (node: SooNode) => estimateNodeSize(node.data);

/**
 * Lay every part out at once, for a freshly imported document.
 *
 * The server places nodes well enough to be readable, but only ELK spreads a part
 * properly, and an import used to arrive un-laid-out — so every document opened as a
 * stack of overlapping boxes until the user found the Auto layout button. A part that
 * fails to lay out keeps its server positions rather than losing the whole import.
 */
export async function layoutAllParts(parts: GraphPart[]): Promise<GraphPart[]> {
  return Promise.all(
    parts.map(async (part) => {
      if (!part.nodes.length) return part;
      try {
        return { ...part, nodes: await autoLayout(part.nodes, part.edges) };
      } catch {
        return part;
      }
    }),
  );
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
      "elk.spacing.nodeNode": "32",
      // A part is mostly disconnected islands — loose statements and separate lead-in
      // groups. Without component spacing they get packed together and read as one
      // tangle, which is the thing this layout exists to avoid.
      "elk.separateConnectedComponents": "true",
      "elk.spacing.componentComponent": "56",
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
