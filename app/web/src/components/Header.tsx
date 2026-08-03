import { useRef } from "react";
import { useStore } from "../store";
import { autoLayout, layoutAllParts } from "../lib/layout";
import { exportDocument, importDocument } from "../lib/api";

export function Header() {
  const fileInput = useRef<HTMLInputElement>(null);

  const graph = useStore((s) => s.graph);
  const doc = useStore((s) => s.doc);
  const busy = useStore((s) => s.busy);
  const past = useStore((s) => s.past);
  const future = useStore((s) => s.future);
  const loadImport = useStore((s) => s.loadImport);
  const startBlank = useStore((s) => s.startBlank);
  const setStatus = useStore((s) => s.setStatus);
  const setBusy = useStore((s) => s.setBusy);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const replaceLayout = useStore((s) => s.replaceLayout);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setStatus(`Reading ${file.name}…`);
    try {
      const result = await importDocument(file);
      // Lay every part out before it reaches the canvas, so the first thing the user
      // sees is a spread graph rather than a pile they have to un-stack by hand.
      setStatus(`Laying out ${result.document.parts.length} parts…`);
      const parts = await layoutAllParts(result.graph.parts);
      loadImport({ ...result, graph: { ...result.graph, parts } });
      setStatus(
        `${result.document.equipmentClass} — ${result.document.parts.length} parts, ` +
          `${result.document.steps.length} statements, ${result.document.findings.length} findings`,
      );
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const onLayout = async () => {
    const nodes = useStore.getState().activeNodes();
    const edges = useStore.getState().activeEdges();
    if (!nodes.length) return;
    setBusy(true);
    try {
      replaceLayout(await autoLayout(nodes, edges));
      setStatus("Re-laid out.");
    } catch {
      setStatus("Could not lay this part out.");
    } finally {
      setBusy(false);
    }
  };

  const onExport = async (format: "docx" | "pdf") => {
    if (!graph) return;
    setBusy(true);
    setStatus(`Writing ${format.toUpperCase()}…`);
    try {
      await exportDocument(format, graph, doc?.setpoints ?? [], {
        revision: graph.revision || "A",
      });
      setStatus(`Exported ${format.toUpperCase()}.`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-text">
          <strong>Sequence of Operations</strong>
          <small>Flow tool — runs locally</small>
        </span>
      </div>

      <div className="toolbar">
        <input
          ref={fileInput}
          type="file"
          accept=".docx,.pdf"
          hidden
          onChange={(e) => onFile(e.target.files?.[0])}
        />
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => fileInput.current?.click()}
          disabled={busy}
        >
          Import DOCX / PDF
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => startBlank("New Equipment")}
          disabled={busy}
        >
          New graph
        </button>

        <span className="toolbar-sep" aria-hidden="true" />

        <button type="button" className="btn btn--icon" onClick={undo} disabled={!past.length} title="Undo (Ctrl+Z)">
          ↶
        </button>
        <button type="button" className="btn btn--icon" onClick={redo} disabled={!future.length} title="Redo (Ctrl+Shift+Z)">
          ↷
        </button>
        <button type="button" className="btn" onClick={onLayout} disabled={!graph || busy}>
          Auto layout
        </button>

        <span className="toolbar-sep" aria-hidden="true" />

        <button type="button" className="btn" onClick={() => onExport("docx")} disabled={!graph || busy}>
          Export DOCX
        </button>
        <button type="button" className="btn" onClick={() => onExport("pdf")} disabled={!graph || busy}>
          Export PDF
        </button>
      </div>
    </header>
  );
}
