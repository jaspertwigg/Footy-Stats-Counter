import express from "express";
import cors from "cors";
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { recipesRouter } from "./routes/recipes.js";

const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/recipes", recipesRouter);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err.message || "Internal server error" });
});

export const api = onRequest({ secrets: [anthropicApiKey], cors: true }, app);
