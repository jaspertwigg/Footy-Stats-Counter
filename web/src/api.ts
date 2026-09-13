import type { RecipeRecord } from "./types";

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

// Last-known-good copy of your recipes, kept in the browser so the app can
// still show something if the network/server is briefly unreachable (e.g.
// spotty wifi in the kitchen) - view-only, not used for imports or edits.
const CACHE_KEY = "home-kitchen:recipes-cache";

function readCache(): RecipeRecord[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as RecipeRecord[]) : [];
  } catch {
    return [];
  }
}

function writeCache(list: RecipeRecord[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(list));
  } catch {
    // ignore (private browsing, quota, etc.) - caching is a nice-to-have
  }
}

function upsertCache(record: RecipeRecord) {
  const list = readCache().filter((r) => r.id !== record.id);
  list.unshift(record);
  writeCache(list);
}

function removeCache(id: string) {
  writeCache(readCache().filter((r) => r.id !== id));
}

export interface CachedResult<T> {
  data: T;
  fromCache: boolean;
}

export const api = {
  listRecipes: async (): Promise<CachedResult<RecipeRecord[]>> => {
    try {
      const data = await fetch("/api/recipes").then((r) => handle<RecipeRecord[]>(r));
      writeCache(data);
      return { data, fromCache: false };
    } catch (err) {
      const cached = readCache();
      if (cached.length > 0) return { data: cached, fromCache: true };
      throw err;
    }
  },

  getRecipe: async (id: string): Promise<CachedResult<RecipeRecord>> => {
    try {
      const data = await fetch(`/api/recipes/${id}`).then((r) => handle<RecipeRecord>(r));
      upsertCache(data);
      return { data, fromCache: false };
    } catch (err) {
      const cached = readCache().find((r) => r.id === id);
      if (cached) return { data: cached, fromCache: true };
      throw err;
    }
  },

  deleteRecipe: async (id: string) => {
    const res = await fetch(`/api/recipes/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete recipe");
    removeCache(id);
  },

  importText: (text: string) =>
    fetch("/api/recipes/import/text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    })
      .then((r) => handle<RecipeRecord>(r))
      .then((record) => (upsertCache(record), record)),

  importUrl: (url: string) =>
    fetch("/api/recipes/import/url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    })
      .then((r) => handle<RecipeRecord>(r))
      .then((record) => (upsertCache(record), record)),

  importPhoto: (files: File[], context?: string) => {
    const form = new FormData();
    for (const f of files) form.append("images", f);
    if (context) form.append("context", context);
    return fetch("/api/recipes/import/photo", { method: "POST", body: form })
      .then((r) => handle<RecipeRecord>(r))
      .then((record) => (upsertCache(record), record));
  },

  editRecipe: (id: string, instruction: string) =>
    fetch(`/api/recipes/${id}/edit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instruction }),
    })
      .then((r) => handle<{ record: RecipeRecord; changeSummary: string }>(r))
      .then((result) => (upsertCache(result.record), result)),

  revert: (id: string, to: "original" | "previous") =>
    fetch(`/api/recipes/${id}/revert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to }),
    })
      .then((r) => handle<RecipeRecord>(r))
      .then((record) => (upsertCache(record), record)),
};
