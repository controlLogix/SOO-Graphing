import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { SooNodeData } from "@shared/graph";

const HANDLES: [Position, string][] = [
  [Position.Top, "t"],
  [Position.Right, "r"],
  [Position.Bottom, "b"],
  [Position.Left, "l"],
];

export function SooNodeView({ data, selected }: NodeProps) {
  const d = data as SooNodeData;
  const kind = d.kind ?? "action";
  const optional = Boolean(d.condition);

  return (
    <div
      className={`node node--${kind}${optional ? " node--optional" : ""}${
        selected ? " is-selected" : ""
      }`}
    >
      {HANDLES.map(([position, id]) => (
        <Handle
          key={`t-${id}`}
          type="target"
          position={position}
          id={`t-${id}`}
          className="node-handle"
        />
      ))}

      <div className="node-body">
        {kind === "gate" ? (
          <span className="node-gate">{d.op === "OR" ? "ANY of" : "ALL of"}</span>
        ) : (
          <span className="node-label">{d.label}</span>
        )}
        {d.modality && kind !== "gate" && kind !== "note" ? (
          <span className={`node-modality mod--${String(d.modality).replace(/\s+/g, "-")}`}>
            {d.modality}
          </span>
        ) : null}
      </div>

      {optional ? <span className="node-flag">{d.condition}</span> : null}

      {HANDLES.map(([position, id]) => (
        <Handle
          key={`s-${id}`}
          type="source"
          position={position}
          id={`s-${id}`}
          className="node-handle node-handle--source"
        />
      ))}
    </div>
  );
}
