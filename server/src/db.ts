import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import type { Recipe, RecipeRecord } from "./schema.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(here, "..", "data");
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, "recipes.db"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS recipes (
    id TEXT PRIMARY KEY,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    sourceType TEXT NOT NULL,
    sourceRef TEXT,
    original TEXT NOT NULL,
    current TEXT NOT NULL,
    history TEXT NOT NULL
  );
`);

interface Row {
  id: string;
  createdAt: string;
  updatedAt: string;
  sourceType: string;
  sourceRef: string | null;
  original: string;
  current: string;
  history: string;
}

function rowToRecord(row: Row): RecipeRecord {
  return {
    id: row.id,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    sourceType: row.sourceType as RecipeRecord["sourceType"],
    sourceRef: row.sourceRef,
    original: JSON.parse(row.original),
    current: JSON.parse(row.current),
    history: JSON.parse(row.history),
  };
}

export function insertRecipe(record: RecipeRecord): void {
  db.prepare(
    `INSERT INTO recipes (id, createdAt, updatedAt, sourceType, sourceRef, original, current, history)
     VALUES (@id, @createdAt, @updatedAt, @sourceType, @sourceRef, @original, @current, @history)`,
  ).run({
    id: record.id,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    sourceType: record.sourceType,
    sourceRef: record.sourceRef,
    original: JSON.stringify(record.original),
    current: JSON.stringify(record.current),
    history: JSON.stringify(record.history),
  });
}

export function listRecipes(): RecipeRecord[] {
  const rows = db.prepare(`SELECT * FROM recipes ORDER BY updatedAt DESC`).all() as Row[];
  return rows.map(rowToRecord);
}

export function getRecipe(id: string): RecipeRecord | undefined {
  const row = db.prepare(`SELECT * FROM recipes WHERE id = ?`).get(id) as Row | undefined;
  return row ? rowToRecord(row) : undefined;
}

export function updateRecipeCurrent(
  id: string,
  current: Recipe,
  history: RecipeRecord["history"],
): RecipeRecord | undefined {
  const updatedAt = new Date().toISOString();
  db.prepare(`UPDATE recipes SET current = ?, history = ?, updatedAt = ? WHERE id = ?`).run(
    JSON.stringify(current),
    JSON.stringify(history),
    updatedAt,
    id,
  );
  return getRecipe(id);
}

export function deleteRecipe(id: string): void {
  db.prepare(`DELETE FROM recipes WHERE id = ?`).run(id);
}
