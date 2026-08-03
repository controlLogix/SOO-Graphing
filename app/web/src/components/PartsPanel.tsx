import { useState } from "react";
import { useStore } from "../store";

export function PartsPanel() {
  const graph = useStore((s) => s.graph);
  const activePart = useStore((s) => s.activePart);
  const setActivePart = useStore((s) => s.setActivePart);
  const addPart = useStore((s) => s.addPart);
  const renamePart = useStore((s) => s.renamePart);
  const removePart = useStore((s) => s.removePart);
  const [editing, setEditing] = useState<number | null>(null);

  if (!graph) return null;

  return (
    <div className="parts">
      <div className="panel-head">
        <h3 className="panel-title">Parts</h3>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => addPart("New Part")}
        >
          + Add
        </button>
      </div>

      <ol className="part-list">
        {graph.parts.map((part) => {
          const isActive = part.n === activePart;
          return (
            <li key={part.n}>
              <div className={`part-row${isActive ? " is-active" : ""}`}>
                <button
                  type="button"
                  className="part-open"
                  onClick={() => setActivePart(part.n)}
                  onDoubleClick={() => setEditing(part.n)}
                >
                  <span className="part-n">{part.n}</span>
                  {editing === part.n ? (
                    <input
                      autoFocus
                      className="part-edit"
                      value={part.title}
                      onChange={(e) => renamePart(part.n, e.target.value)}
                      onBlur={() => setEditing(null)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === "Escape") setEditing(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span className="part-title">{part.title}</span>
                  )}
                </button>
                <span className="part-count">{part.nodes.length}</span>
                {graph.parts.length > 1 ? (
                  <button
                    type="button"
                    className="part-remove"
                    title={`Delete PART ${part.n}`}
                    onClick={() => removePart(part.n)}
                  >
                    ×
                  </button>
                ) : null}
              </div>
              {part.isInventory ? <span className="part-tag">inventory</span> : null}
            </li>
          );
        })}
      </ol>
      <p className="panel-hint">Double-click a title to rename it.</p>
    </div>
  );
}
