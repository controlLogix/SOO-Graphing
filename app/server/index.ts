/**
 * Local API for the SOO flow tool. Nothing leaves this machine.
 */
import express from "express";
import cors from "cors";
import multer from "multer";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { readDocxBlocks } from "./parse/docx-reader.js";
import { readPdfBlocks } from "./parse/pdf-reader.js";
import { parseBlocks } from "./parse/parser.js";
import { irToGraph } from "./graph/build.js";
import { graphToDocx } from "./export/docx.js";
import { graphToPdf } from "./export/pdf.js";

const PORT = Number(process.env.PORT ?? 3001);

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 40 * 1024 * 1024 },
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "soo-flow" });
});

app.post("/api/import", upload.single("file"), async (req, res) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "No file received." });
    return;
  }

  const name = file.originalname;
  const isDocx = /\.docx$/i.test(name);
  const isPdf = /\.pdf$/i.test(name);
  if (!isDocx && !isPdf) {
    res.status(400).json({ error: "Import a .docx or .pdf file." });
    return;
  }
  if (!file.size) {
    res.status(400).json({ error: `${name} is zero bytes — there is nothing to read.` });
    return;
  }

  try {
    const blocks = isDocx
      ? await readDocxBlocks(file.buffer)
      : await readPdfBlocks(file.buffer);
    const document = parseBlocks(blocks, name);
    const graph = irToGraph(document);
    res.json({ document, graph, blockCount: blocks.length, format: isDocx ? "docx" : "pdf" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(422).json({ error: `Could not read ${name}: ${message}` });
  }
});

app.post("/api/export/docx", async (req, res) => {
  try {
    const { graph, setpoints = [], meta = {} } = req.body ?? {};
    if (!graph) {
      res.status(400).json({ error: "No graph supplied." });
      return;
    }
    const buffer = await graphToDocx(graph, setpoints, meta);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileStem(graph)}.docx"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/api/export/pdf", async (req, res) => {
  try {
    const { graph, setpoints = [], meta = {} } = req.body ?? {};
    if (!graph) {
      res.status(400).json({ error: "No graph supplied." });
      return;
    }
    const buffer = await graphToPdf(graph, setpoints, meta);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileStem(graph)}.pdf"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

function fileStem(graph: { equipmentClass?: string }): string {
  const base = (graph.equipmentClass || "sequence-of-operations").trim();
  return `SOO ${base}`.replace(/[\\/:*?"<>|]/g, "-");
}

// Serve the built frontend when it exists, so `npm run build && npm start` is a
// single local app rather than two processes.
const dist = fileURLToPath(new URL("../dist", import.meta.url));
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get("*", (_req, res) => res.sendFile(`${dist}/index.html`));
}

app.listen(PORT, () => {
  console.log(`  SOO Flow — API on http://localhost:${PORT}`);
});
