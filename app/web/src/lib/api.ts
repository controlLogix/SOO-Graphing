import type { SooGraph } from "@shared/graph";
import type { Setpoint, SooDocument } from "@shared/ir";

export interface ImportResult {
  document: SooDocument;
  graph: SooGraph;
  blockCount: number;
  format: "docx" | "pdf";
}

async function fail(res: Response): Promise<never> {
  let message = `${res.status} ${res.statusText}`;
  try {
    const body = await res.json();
    if (body?.error) message = body.error;
  } catch {
    /* keep the status line */
  }
  throw new Error(message);
}

export async function importDocument(file: File): Promise<ImportResult> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/import", { method: "POST", body: form });
  if (!res.ok) await fail(res);
  return res.json();
}

export interface ExportMeta {
  project?: string;
  section?: string;
  revision?: string;
  dateIssued?: string;
  preparedBy?: string;
  reviewedBy?: string;
}

export async function exportDocument(
  format: "docx" | "pdf",
  graph: SooGraph,
  setpoints: Setpoint[],
  meta: ExportMeta = {},
): Promise<void> {
  const res = await fetch(`/api/export/${format}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ graph, setpoints, meta }),
  });
  if (!res.ok) await fail(res);

  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = /filename="([^"]+)"/.exec(disposition);
  const name = match ? match[1] : `sequence-of-operations.${format}`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
