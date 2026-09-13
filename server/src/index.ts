import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { recipesRouter } from "./routes/recipes.js";
import { initDb } from "./db.js";

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 8787;

app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/recipes", recipesRouter);

// Serve the built frontend (web/dist) if it's present, so the whole app can
// be deployed as a single service with one URL.
const here = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.join(here, "..", "..", "web", "dist");
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(path.join(webDist, "index.html"));
  });
}

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err.message || "Internal server error" });
});

async function start() {
  await initDb();
  app.listen(PORT, () => {
    console.log(`Recipe app server listening on http://localhost:${PORT}`);
    if (!process.env.ANTHROPIC_API_KEY) {
      console.warn("Warning: ANTHROPIC_API_KEY is not set. Recipe import/edit calls will fail.");
    }
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
