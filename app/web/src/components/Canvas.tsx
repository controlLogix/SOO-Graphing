import { useCallback, useMemo, useRef } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import type { NodeKind } from "@shared/graph";
import { useStore } from "../store";
import { SooNodeView } from "./SooNode";

const nodeTypes = { soo: SooNodeView };

const MINIMAP_COLOR: Record<string, string> = {
  gate: "#0e9c86",
  start: "#0e9c86",
  end: "#6d6e70",
  alarm: "#c2542f",
  delay: "#b08322",
  condition: "#5c7d8a",
  state: "#12b48c",
  note: "#9aa5a1",
};

export function Canvas() {
  const wrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();

  const graph = useStore((s) => s.graph);
  const activePart = useStore((s) => s.activePart);
  const onNodesChange = useStore((s) => s.onNodesChange);
  const onEdgesChange = useStore((s) => s.onEdgesChange);
  const connect = useStore((s) => s.connect);
  const addNode = useStore((s) => s.addNode);

  const part = useMemo(
    () => graph?.parts.find((p) => p.n === activePart) ?? null,
    [graph, activePart],
  );

  const nodes = (part?.nodes ?? []) as unknown as Node[];
  const edges = useMemo(
    () =>
      (part?.edges ?? []).map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label,
        type: "smoothstep",
        animated: false,
        className: e.variant === "interlock" ? "edge--interlock" : "edge--flow",
      })) as unknown as Edge[],
    [part],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      if (c.source && c.target) connect(c.source, c.target);
    },
    [connect],
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const kind = event.dataTransfer.getData("application/soo-kind") as NodeKind;
      if (!kind) return;
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      addNode(kind, { x: position.x - 130, y: position.y - 28 });
    },
    [addNode, screenToFlowPosition],
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  if (!part) {
    return (
      <div className="canvas-empty">
        <p>No part selected.</p>
      </div>
    );
  }

  return (
    <div className="canvas" ref={wrapper} onDrop={onDrop} onDragOver={onDragOver}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
        fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
        minZoom={0.15}
        maxZoom={2.5}
        proOptions={{ hideAttribution: true }}
        deleteKeyCode={["Backspace", "Delete"]}
        connectionRadius={28}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} className="canvas-bg" />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          nodeColor={(n) => MINIMAP_COLOR[(n.data as { kind?: string }).kind ?? ""] ?? "#9aa5a1"}
          maskColor="rgba(14, 20, 19, 0.08)"
        />
      </ReactFlow>
    </div>
  );
}
