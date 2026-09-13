import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import type { RecipeRecord } from "../types";

export default function RecipeList() {
  const [recipes, setRecipes] = useState<RecipeRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listRecipes()
      .then(setRecipes)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="text-red-600">{error}</p>;
  if (!recipes) return <p className="text-stone-500">Loading recipes…</p>;

  if (recipes.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-lg text-stone-600 mb-4">No recipes yet.</p>
        <Link
          to="/import"
          className="inline-block rounded-full bg-orange-600 text-white font-medium px-5 py-2.5 hover:bg-orange-700 transition-colors"
        >
          Import your first recipe
        </Link>
      </div>
    );
  }

  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {recipes.map((r) => (
        <Link
          key={r.id}
          to={`/recipes/${r.id}`}
          className="block rounded-xl border border-orange-100 bg-white p-4 hover:shadow-md hover:border-orange-200 transition-all"
        >
          <h2 className="font-semibold text-stone-900 mb-1">{r.current.title}</h2>
          <p className="text-sm text-stone-500 line-clamp-2 mb-2">{r.current.description}</p>
          <div className="flex flex-wrap gap-1.5">
            {r.current.tags.slice(0, 4).map((t) => (
              <span key={t} className="text-xs bg-orange-50 text-orange-700 rounded-full px-2 py-0.5">
                {t}
              </span>
            ))}
          </div>
        </Link>
      ))}
    </div>
  );
}
