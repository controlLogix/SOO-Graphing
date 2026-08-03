import { useEffect } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { Header } from "./components/Header";
import { Palette } from "./components/Palette";
import { PartsPanel } from "./components/PartsPanel";
import { Canvas } from "./components/Canvas";
import { Inspector } from "./components/Inspector";
import { FindingsPanel } from "./components/FindingsPanel";
import { useStore } from "./store";

export default function App() {
  const graph = useStore((s) => s.graph);
  const doc = useStore((s) => s.doc);
  const status = useStore((s) => s.status);
  const busy = useStore((s) => s.busy);
  const activePart = useStore((s) => s.activePart);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      const meta = e.ctrlKey || e.metaKey;
      if (meta && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) useStore.getState().redo();
        else useStore.getState().undo();
      }
      if (meta && e.key.toLowerCase() === "y") {
        e.preventDefault();
        useStore.getState().redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const part = graph?.parts.find((p) => p.n === activePart) ?? null;

  return (
    <div className="app">
      <Header />

      <main className="layout">
        <aside className="rail rail--left">
          <Palette />
          {graph ? <PartsPanel /> : null}
        </aside>

        <section className="stage">
          {graph ? (
            <>
              <div className="stage-head">
                <div className="stage-title">
                  {part ? (
                    <>
                      <span className="stage-part">PART {part.n}</span>
                      <h2>{part.title}</h2>
                      {part.isInventory ? (
                        <span className="stage-flag">
                          inventory — a point list, not control flow
                        </span>
                      ) : null}
                    </>
                  ) : null}
                </div>
                <div className="stage-meta">
                  <span>{graph.equipmentClass}</span>
                  {doc ? <span>{doc.sourceFile}</span> : <span>unsaved draft</span>}
                </div>
              </div>
              <ReactFlowProvider>
                <Canvas />
              </ReactFlowProvider>
            </>
          ) : (
            <Welcome />
          )}
        </section>

        <aside className="rail rail--right">
          <Inspector />
          <FindingsPanel />
        </aside>
      </main>

      <footer className={`statusbar${busy ? " is-busy" : ""}`}>
        <span className="status-dot" aria-hidden="true" />
        <span>{status ?? "Ready."}</span>
        {graph ? (
          <span className="status-right">
            {graph.parts.length} parts ·{" "}
            {graph.parts.reduce((sum, p) => sum + p.nodes.length, 0)} shapes
          </span>
        ) : null}
      </footer>
    </div>
  );
}

function Welcome() {
  const startBlank = useStore((s) => s.startBlank);
  return (
    <div className="welcome">
      <div className="welcome-card">
        <h2>Read a specification, or draw one.</h2>
        <p>
          Import a <b>.docx</b> or <b>.pdf</b> sequence of operations and it is parsed into
          control flow you can inspect, part by part — conditions converging on gates,
          ordered start sequences, timers, and the gaps between them.
        </p>
        <p>
          Or start from an empty canvas, draw the logic, and export it back out as a
          specification in the house format.
        </p>
        <div className="welcome-actions">
          <button type="button" className="btn btn--primary" onClick={() => startBlank("New Equipment")}>
            Start drawing
          </button>
        </div>
        <dl className="welcome-keys">
          <div><dt>Drag</dt><dd>a shape from the left onto the canvas</dd></div>
          <div><dt>Drag a handle</dt><dd>from one shape to another to connect them</dd></div>
          <div><dt>Delete</dt><dd>removes the selection</dd></div>
          <div><dt>Ctrl + Z</dt><dd>undo · Ctrl + Shift + Z to redo</dd></div>
        </dl>
      </div>
    </div>
  );
}
