import pg from "pg";
import fs from "node:fs/promises";
import path from "node:path";

const { Pool } = pg;

let pool;
const localStorePath = process.env.RESULT_STORE_PATH || path.resolve(process.cwd(), "server-data", "results.json");

function getConnectionString() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRESQL_URL || "";
}

function getSslConfig() {
  const connectionString = getConnectionString();
  const sslMode = process.env.PGSSLMODE || "";

  if (sslMode === "disable") {
    return false;
  }

  if (sslMode === "require" || sslMode === "no-verify") {
    return { rejectUnauthorized: false };
  }

  if (connectionString.includes("railway.internal")) {
    return false;
  }

  return false;
}

export function hasDatabaseConfig() {
  return Boolean(getConnectionString());
}

export function getStorageMode() {
  return hasDatabaseConfig() ? "postgres" : "file";
}

export function getPool() {
  if (!hasDatabaseConfig()) {
    return null;
  }

  if (!pool) {
    pool = new Pool({
      connectionString: getConnectionString(),
      ssl: getSslConfig()
    });
  }

  return pool;
}

export async function ensureSchema() {
  const client = getPool();

  if (!client) {
    return false;
  }

  await client.query(`
    CREATE TABLE IF NOT EXISTS test_attempts (
      attempt_id TEXT PRIMARY KEY,
      student_name TEXT NOT NULL,
      student_surname TEXT NOT NULL,
      test_id TEXT NOT NULL,
      test_title TEXT NOT NULL,
      percentage INTEGER NOT NULL,
      score INTEGER NOT NULL,
      total_points INTEGER NOT NULL,
      warning_count INTEGER NOT NULL DEFAULT 0,
      time_spent_seconds INTEGER NOT NULL DEFAULT 0,
      passed BOOLEAN NOT NULL DEFAULT FALSE,
      submitted_at TIMESTAMPTZ NOT NULL,
      result_json JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_test_attempts_submitted_at
    ON test_attempts (submitted_at DESC);
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_test_attempts_student
    ON test_attempts (student_surname, student_name);
  `);

  return true;
}

async function readLocalAttempts() {
  try {
    const raw = await fs.readFile(localStorePath, "utf8");
    const records = JSON.parse(raw);
    return Array.isArray(records) ? records : [];
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function writeLocalAttempts(records) {
  await fs.mkdir(path.dirname(localStorePath), { recursive: true });
  await fs.writeFile(localStorePath, JSON.stringify(records, null, 2));
}

export async function listAttempts() {
  const client = getPool();

  if (!client) {
    const records = await readLocalAttempts();
    return records.sort(
      (first, second) => Number(second.submittedAt || 0) - Number(first.submittedAt || 0)
    );
  }

  const result = await client.query(`
    SELECT result_json
    FROM test_attempts
    ORDER BY submitted_at DESC;
  `);

  return result.rows.map((row) => row.result_json);
}

export async function upsertAttempt(record) {
  const client = getPool();

  if (!client) {
    const records = await readLocalAttempts();
    const existingIndex = records.findIndex((item) => item.attemptId === record.attemptId);

    if (existingIndex >= 0) {
      records[existingIndex] = record;
    } else {
      records.unshift(record);
    }

    await writeLocalAttempts(records);
    return record;
  }

  await client.query(
    `
      INSERT INTO test_attempts (
        attempt_id,
        student_name,
        student_surname,
        test_id,
        test_title,
        percentage,
        score,
        total_points,
        warning_count,
        time_spent_seconds,
        passed,
        submitted_at,
        result_json,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, TO_TIMESTAMP($12 / 1000.0), $13::jsonb, NOW()
      )
      ON CONFLICT (attempt_id)
      DO UPDATE SET
        student_name = EXCLUDED.student_name,
        student_surname = EXCLUDED.student_surname,
        test_id = EXCLUDED.test_id,
        test_title = EXCLUDED.test_title,
        percentage = EXCLUDED.percentage,
        score = EXCLUDED.score,
        total_points = EXCLUDED.total_points,
        warning_count = EXCLUDED.warning_count,
        time_spent_seconds = EXCLUDED.time_spent_seconds,
        passed = EXCLUDED.passed,
        submitted_at = EXCLUDED.submitted_at,
        result_json = EXCLUDED.result_json,
        updated_at = NOW();
    `,
    [
      record.attemptId,
      record.student.name,
      record.student.surname,
      record.testId,
      record.testTitle,
      record.percentage,
      record.score,
      record.totalPoints,
      record.warningCount ?? 0,
      record.timeSpentSeconds ?? 0,
      Boolean(record.passed),
      record.submittedAt,
      JSON.stringify(record)
    ]
  );

  return record;
}

export async function deleteAttempt(attemptId) {
  const client = getPool();

  if (!client) {
    const records = await readLocalAttempts();
    const nextRecords = records.filter((record) => record.attemptId !== attemptId);
    await writeLocalAttempts(nextRecords);
    return nextRecords.length !== records.length;
  }

  const result = await client.query(
    `
      DELETE FROM test_attempts
      WHERE attempt_id = $1;
    `,
    [attemptId]
  );

  return result.rowCount > 0;
}
