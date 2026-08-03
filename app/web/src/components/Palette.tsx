import { NODE_KINDS, type NodeKind } from "@shared/graph";
import { useStore } from "../store";

const GLYPH: Record<NodeKind, string> = {
  start: "▭",
  end: "▭",
  action: "▬",
  condition: "◇",
  gate: "⬡",
  delay: "▱",
  alarm: "△",
  state: "▢",
  setpoint: "▰",
  note: "▢",
};

export function Palette() {
  const addNode = useStore((s) => s.addNode);
  const graph = useStore((s) => s.graph);

  const onDragStart = (event: React.DragEvent, kind: NodeKind) => {
    event.dataTransfer.setData("application/soo-kind", kind);
    event.dataTransfer.effectAllowed = "copy";
  };

  return (
    <div className="palette">
      <h3 className="panel-title">Shapes</h3>
      <p className="panel-hint">Drag onto the canvas, or click to drop one in the centre.</p>
      <div className="palette-grid">
        {NODE_KINDS.map(({ kind, label, hint }) => (
          <button
            key={kind}
            type="button"
            className={`palette-item palette-item--${kind}`}
            draggable={Boolean(graph)}
            disabled={!graph}
            onDragStart={(e) => onDragStart(e, kind)}
            onClick={() => addNode(kind, { x: 220, y: 160 })}
            title={hint}
          >
            <span className={`palette-glyph glyph--${kind}`} aria-hidden="true">
              {GLYPH[kind]}
            </span>
            <span className="palette-label">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
