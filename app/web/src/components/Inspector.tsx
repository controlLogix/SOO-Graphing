import { useMemo } from "react";
import type { NodeKind } from "@shared/graph";
import { NODE_KINDS } from "@shared/graph";
import { useStore } from "../store";

const MODALITIES = ["", "shall", "shall not", "should", "may"];
const CONDITIONS = ["", "where provided", "where available", "where required", "where applicable"];

export function Inspector() {
  const graph = useStore((s) => s.graph);
  const activePart = useStore((s) => s.activePart);
  const selection = useStore((s) => s.selection);
  const updateNode = useStore((s) => s.updateNode);
  const deleteSelection = useStore((s) => s.deleteSelection);
  const commit = useStore((s) => s.commit);

  const node = useMemo(() => {
    if (!graph || activePart === null || selection.length !== 1) return null;
    const part = graph.parts.find((p) => p.n === activePart);
    return part?.nodes.find((n) => n.id === selection[0]) ?? null;
  }, [graph, activePart, selection]);

  if (!node) {
    return (
      <div className="inspector">
        <h3 className="panel-title">Properties</h3>
        <p className="panel-hint">
          {selection.length > 1
            ? `${selection.length} shapes selected. Press Delete to remove them.`
            : "Select a shape to edit it."}
        </p>
      </div>
    );
  }

  const d = node.data;

  return (
    <div className="inspector">
      <h3 className="panel-title">Properties</h3>

      <label className="field">
        <span>Text</span>
        <textarea
          rows={4}
          value={d.label}
          onFocus={commit}
          onChange={(e) => updateNode(node.id, { label: e.target.value })}
        />
      </label>

      <label className="field">
        <span>Shape</span>
        <select
          value={d.kind}
          onChange={(e) => {
            commit();
            updateNode(node.id, { kind: e.target.value as NodeKind });
          }}
        >
          {NODE_KINDS.map(({ kind, label }) => (
            <option key={kind} value={kind}>
              {label}
            </option>
          ))}
        </select>
      </label>

      {d.kind === "gate" ? (
        <label className="field">
          <span>Operator</span>
          <div className="segmented">
            {(["AND", "OR"] as const).map((op) => (
              <button
                key={op}
                type="button"
                className={d.op === op ? "is-active" : ""}
                onClick={() => {
                  commit();
                  updateNode(node.id, { op, label: op === "OR" ? "ANY of" : "ALL of" });
                }}
              >
                {op === "OR" ? "ANY of" : "ALL of"}
              </button>
            ))}
          </div>
        </label>
      ) : null}

      {d.kind === "delay" ? (
        <label className="field">
          <span>Delay</span>
          <input
            type="text"
            value={d.delay ?? ""}
            onFocus={commit}
            onChange={(e) =>
              updateNode(node.id, { delay: e.target.value, label: `wait ${e.target.value}` })
            }
          />
        </label>
      ) : null}

      <label className="field">
        <span>Modality</span>
        <select
          value={d.modality ?? ""}
          onChange={(e) => {
            commit();
            updateNode(node.id, { modality: e.target.value || null });
          }}
        >
          {MODALITIES.map((m) => (
            <option key={m} value={m}>
              {m || "— none —"}
            </option>
          ))}
        </select>
        <small>Contractual force. Exported verbatim, never promoted or demoted.</small>
      </label>

      <label className="field">
        <span>Conditional</span>
        <select
          value={d.condition ?? ""}
          onChange={(e) => {
            commit();
            updateNode(node.id, { condition: e.target.value || null });
          }}
        >
          {CONDITIONS.map((c) => (
            <option key={c} value={c}>
              {c || "— always applies —"}
            </option>
          ))}
        </select>
        <small>Optional equipment. Drawn ghosted and never reported as missing.</small>
      </label>

      <button type="button" className="btn btn--danger" onClick={deleteSelection}>
        Delete shape
      </button>
    </div>
  );
}
