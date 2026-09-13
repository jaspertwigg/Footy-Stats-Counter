import pg from "pg";
import type { Recipe, RecipeRecord } from "./schema.js";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.warn("Warning: DATABASE_URL is not set. Recipe storage will fail.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("localhost") ? false : { rejectUnauthorized: false },
});

export async function initDb(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS recipes (
      id TEXT PRIMARY KEY,
      "createdAt" TEXT NOT NULL,
      "updatedAt" TEXT NOT NULL,
      "sourceType" TEXT NOT NULL,
      "sourceRef" TEXT,
      original JSONB NOT NULL,
      current JSONB NOT NULL,
      history JSONB NOT NULL
    );
  `);
}

interface Row {
  id: string;
  createdAt: string;
  updatedAt: string;
  sourceType: string;
  sourceRef: string | null;
  original: Recipe;
  current: Recipe;
  history: RecipeRecord["history"];
}

function rowToRecord(row: Row): RecipeRecord {
  return {
    id: row.id,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    sourceType: row.sourceType as RecipeRecord["sourceType"],
    sourceRef: row.sourceRef,
    original: row.original,
    current: row.current,
    history: row.history,
  };
}

export async function insertRecipe(record: RecipeRecord): Promise<void> {
  await pool.query(
    `INSERT INTO recipes (id, "createdAt", "updatedAt", "sourceType", "sourceRef", original, current, history)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      record.id,
      record.createdAt,
      record.updatedAt,
      record.sourceType,
      record.sourceRef,
      JSON.stringify(record.original),
      JSON.stringify(record.current),
      JSON.stringify(record.history),
    ],
  );
}

export async function listRecipes(): Promise<RecipeRecord[]> {
  const result = await pool.query<Row>(`SELECT * FROM recipes ORDER BY "updatedAt" DESC`);
  return result.rows.map(rowToRecord);
}

export async function getRecipe(id: string): Promise<RecipeRecord | undefined> {
  const result = await pool.query<Row>(`SELECT * FROM recipes WHERE id = $1`, [id]);
  return result.rows[0] ? rowToRecord(result.rows[0]) : undefined;
}

export async function updateRecipeCurrent(
  id: string,
  current: Recipe,
  history: RecipeRecord["history"],
): Promise<RecipeRecord | undefined> {
  const updatedAt = new Date().toISOString();
  await pool.query(`UPDATE recipes SET current = $1, history = $2, "updatedAt" = $3 WHERE id = $4`, [
    JSON.stringify(current),
    JSON.stringify(history),
    updatedAt,
    id,
  ]);
  return getRecipe(id);
}

export async function deleteRecipe(id: string): Promise<void> {
  await pool.query(`DELETE FROM recipes WHERE id = $1`, [id]);
}
