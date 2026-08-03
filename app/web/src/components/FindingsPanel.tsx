import { useMemo, useState } from "react";
import type { Severity } from "@shared/ir";
import { useStore } from "../store";

const ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

export function FindingsPanel() {
  const doc = useStore((s) => s.doc);
  const setActivePart = useStore((s) => s.setActivePart);
  const [filter, setFilter] = useState<Severity | "all">("all");

  const findings = useMemo(() => {
    const all = doc?.findings ?? [];
    return [...all]
      .filter((f) => filter === "all" || f.severity === filter)
      .sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || a.rule.localeCompare(b.rule));
  }, [doc, filter]);

  const counts = useMemo(() => {
    const c = { error: 0, warning: 0, info: 0 };
    for (const f of doc?.findings ?? []) c[f.severity] += 1;
    return c;
  }, [doc]);

  if (!doc) {
    return (
      <div className="findings">
        <h3 className="panel-title">Gaps</h3>
        <p className="panel-hint">
          Import a specification to check it, or draw a graph and export it.
        </p>
      </div>
    );
  }

  return (
    <div className="findings">
      <div className="panel-head">
        <h3 className="panel-title">Gaps</h3>
        <div className="chips">
          {(["all", "error", "warning", "info"] as const).map((key) => (
            <button
              key={key}
              type="button"
              className={`chip chip--${key}${filter === key ? " is-active" : ""}`}
              onClick={() => setFilter(key)}
            >
              {key === "all" ? "All" : key}
              {key !== "all" ? <b>{counts[key]}</b> : null}
            </button>
          ))}
        </div>
      </div>

      {findings.length === 0 ? (
        <p className="panel-hint">Nothing at this level.</p>
      ) : (
        <ul className="find-list">
          {findings.map((f, i) => (
            <li key={`${f.rule}-${i}`} className={`find find--${f.severity}`}>
              <button
                type="button"
                className="find-btn"
                onClick={() => f.part !== null && setActivePart(f.part)}
                disabled={f.part === null}
              >
                <span className="find-rule">{f.rule.replace(/_/g, " ")}</span>
                <span className="find-msg">{f.message}</span>
                {f.part !== null ? <span className="find-part">PART {f.part}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
