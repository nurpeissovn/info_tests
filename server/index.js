import cors from "cors";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deleteAttempt, ensureSchema, hasDatabaseConfig, listAttempts, upsertAttempt } from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");

const app = express();
const port = Number(process.env.PORT || 8787);

app.use(cors());
app.use(express.json({ limit: "2mb" }));

function validateAttempt(payload) {
  if (!payload || typeof payload !== "object") {
    return "Result payload is required.";
  }

  if (!payload.attemptId) {
    return "attemptId is required.";
  }

  if (!payload.student?.name || !payload.student?.surname) {
    return "Student name and surname are required.";
  }

  if (!payload.testId || !payload.testTitle) {
    return "Test metadata is required.";
  }

  return "";
}

app.get("/api/health", async (_request, response) => {
  let database = "disabled";

  if (hasDatabaseConfig()) {
    try {
      await ensureSchema();
      database = "connected";
    } catch (error) {
      database = "error";
      console.error("Database health check failed:", error);
    }
  }

  response.json({
    ok: true,
    database,
    timestamp: new Date().toISOString()
  });
});

app.get("/api/results", async (_request, response) => {
  if (!hasDatabaseConfig()) {
    response.json({
      records: await listAttempts(),
      source: "server-memory"
    });
    return;
  }

  try {
    await ensureSchema();
    const records = await listAttempts();
    response.json({
      records,
      source: "postgres"
    });
  } catch (error) {
    console.error("Failed to fetch attempts:", error);
    response.status(500).json({
      error: "Failed to fetch results."
    });
  }
});

app.post("/api/results", async (request, response) => {
  const validationError = validateAttempt(request.body);

  if (validationError) {
    response.status(400).json({ error: validationError });
    return;
  }

  try {
    if (hasDatabaseConfig()) {
      await ensureSchema();
    }

    const saved = await upsertAttempt(request.body);
    response.status(201).json({
      record: saved
    });
  } catch (error) {
    console.error("Failed to save attempt:", error);
    response.status(500).json({
      error: "Failed to save result."
    });
  }
});

app.delete("/api/results/:attemptId", async (request, response) => {
  const { attemptId } = request.params;

  if (!attemptId) {
    response.status(400).json({ error: "attemptId is required." });
    return;
  }

  try {
    if (hasDatabaseConfig()) {
      await ensureSchema();
    }

    const deleted = await deleteAttempt(attemptId);

    if (!deleted) {
      response.status(404).json({ error: "Result not found." });
      return;
    }

    response.json({ ok: true });
  } catch (error) {
    console.error("Failed to delete attempt:", error);
    response.status(500).json({
      error: "Failed to delete result."
    });
  }
});

if (process.env.NODE_ENV === "production") {
  app.use(express.static(distDir));

  app.get(/.*/, (_request, response) => {
    response.sendFile(path.join(distDir, "index.html"));
  });
}

app.listen(port, async () => {
  try {
    if (hasDatabaseConfig()) {
      await ensureSchema();
      console.log(`Server ready on port ${port} with PostgreSQL enabled.`);
    } else {
      console.log(`Server ready on port ${port}. DATABASE_URL is not set, API will use shared in-memory results.`);
    }
  } catch (error) {
    console.error("Server started, but database schema initialization failed:", error);
  }
});
