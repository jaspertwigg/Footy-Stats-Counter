import type { RecipeRecord } from "./types";

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  listRecipes: () => fetch("/api/recipes").then((r) => handle<RecipeRecord[]>(r)),

  getRecipe: (id: string) => fetch(`/api/recipes/${id}`).then((r) => handle<RecipeRecord>(r)),

  deleteRecipe: (id: string) =>
    fetch(`/api/recipes/${id}`, { method: "DELETE" }).then((r) => {
      if (!r.ok) throw new Error("Failed to delete recipe");
    }),

  importText: (text: string) =>
    fetch("/api/recipes/import/text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    }).then((r) => handle<RecipeRecord>(r)),

  importUrl: (url: string) =>
    fetch("/api/recipes/import/url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    }).then((r) => handle<RecipeRecord>(r)),

  importPhoto: (files: File[], context?: string) => {
    const form = new FormData();
    for (const f of files) form.append("images", f);
    if (context) form.append("context", context);
    return fetch("/api/recipes/import/photo", { method: "POST", body: form }).then((r) =>
      handle<RecipeRecord>(r),
    );
  },

  editRecipe: (id: string, instruction: string) =>
    fetch(`/api/recipes/${id}/edit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instruction }),
    }).then((r) => handle<{ record: RecipeRecord; changeSummary: string }>(r)),

  revert: (id: string, to: "original" | "previous") =>
    fetch(`/api/recipes/${id}/revert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to }),
    }).then((r) => handle<RecipeRecord>(r)),
};
