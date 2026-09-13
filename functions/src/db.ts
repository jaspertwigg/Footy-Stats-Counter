import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import type { RecipeRecord, Recipe } from "./schema.js";

if (getApps().length === 0) {
  initializeApp();
}

const db = getFirestore();
const recipes = db.collection("recipes");

export async function insertRecipe(record: RecipeRecord): Promise<void> {
  await recipes.doc(record.id).set(record);
}

export async function listRecipes(): Promise<RecipeRecord[]> {
  const snapshot = await recipes.orderBy("updatedAt", "desc").get();
  return snapshot.docs.map((doc) => doc.data() as RecipeRecord);
}

export async function getRecipe(id: string): Promise<RecipeRecord | undefined> {
  const doc = await recipes.doc(id).get();
  return doc.exists ? (doc.data() as RecipeRecord) : undefined;
}

export async function updateRecipeCurrent(
  id: string,
  current: Recipe,
  history: RecipeRecord["history"],
): Promise<RecipeRecord | undefined> {
  const updatedAt = new Date().toISOString();
  await recipes.doc(id).update({ current, history, updatedAt });
  return getRecipe(id);
}

export async function deleteRecipe(id: string): Promise<void> {
  await recipes.doc(id).delete();
}
