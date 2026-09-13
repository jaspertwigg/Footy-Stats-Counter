import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import type { RecipeRecord } from "../types";
import StandardView from "./StandardView";
import CookMode from "./CookMode";
import EditRequestBox from "./EditRequestBox";

type ViewMode = "standard" | "cook";

export default function RecipeDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [record, setRecord] = useState<RecipeRecord | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("standard");
  const [error, setError] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [changeSummary, setChangeSummary] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (!id) return;
    api
      .getRecipe(id)
      .then(({ data, fromCache }) => {
        setRecord(data);
        setFromCache(fromCache);
      })
      .catch((e) => setError(e.message));
  }, [id]);

  async function handleEdit(instruction: string) {
    if (!id) return;
    setEditLoading(true);
    setError(null);
    setChangeSummary(null);
    try {
      const result = await api.editRecipe(id, instruction);
      setRecord(result.record);
      setChangeSummary(result.changeSummary);
      setFromCache(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setEditLoading(false);
    }
  }

  async function handleRevert(to: "original" | "previous") {
    if (!id) return;
    setError(null);
    setChangeSummary(null);
    try {
      const updated = await api.revert(id, to);
      setRecord(updated);
      setFromCache(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleDelete() {
    if (!id || !confirm("Delete this recipe?")) return;
    await api.deleteRecipe(id);
    navigate("/");
  }

  if (error && !record) return <p className="text-red-600">{error}</p>;
  if (!record) return <p className="text-stone-500">Loading…</p>;

  const recipe = record.current;

  return (
    <div>
      <div className="flex items-start justify-between mb-1">
        <h1 className="text-2xl font-semibold text-stone-900">{recipe.title}</h1>
        <button onClick={handleDelete} className="text-sm text-stone-400 hover:text-red-600 transition-colors">
          Delete
        </button>
      </div>
      <p className="text-stone-600 mb-3">{recipe.description}</p>

      <div className="flex flex-wrap gap-3 text-sm text-stone-500 mb-4">
        <span>🍽 Serves {recipe.servings}</span>
        {recipe.prepTimeMinutes != null && <span>⏱ Prep {recipe.prepTimeMinutes} min</span>}
        {recipe.cookTimeMinutes != null && <span>🔥 Cook {recipe.cookTimeMinutes} min</span>}
      </div>

      <div className="flex flex-wrap gap-1.5 mb-6">
        {recipe.tags.map((t) => (
          <span key={t} className="text-xs bg-orange-50 text-orange-700 rounded-full px-2 py-0.5">
            {t}
          </span>
        ))}
      </div>

      {fromCache && (
        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm px-3 py-2">
          Couldn't reach the server - showing your last saved copy. Requesting changes needs a
          connection.
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">
          {error}
        </div>
      )}
      {changeSummary && (
        <div className="mb-4 rounded-lg bg-green-50 border border-green-200 text-green-800 text-sm px-3 py-2">
          ✓ {changeSummary}
        </div>
      )}

      <div className="mb-6">
        <EditRequestBox onSubmit={handleEdit} loading={editLoading} />
      </div>

      <div className="flex items-center justify-between mb-5">
        <div className="inline-flex rounded-full border border-stone-200 p-0.5">
          <button
            onClick={() => setViewMode("standard")}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              viewMode === "standard" ? "bg-orange-600 text-white" : "text-stone-600 hover:bg-stone-50"
            }`}
          >
            Standard
          </button>
          <button
            onClick={() => setViewMode("cook")}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              viewMode === "cook" ? "bg-orange-600 text-white" : "text-stone-600 hover:bg-stone-50"
            }`}
          >
            Cook mode
          </button>
        </div>

        {record.history.length > 0 && (
          <button
            onClick={() => setShowHistory((v) => !v)}
            className="text-sm text-stone-500 hover:text-stone-700 transition-colors"
          >
            History ({record.history.length})
          </button>
        )}
      </div>

      {showHistory && (
        <div className="mb-6 rounded-lg border border-stone-200 p-4 space-y-3">
          {record.history.length === 0 ? (
            <p className="text-sm text-stone-500">No changes yet.</p>
          ) : (
            <ul className="space-y-1.5 text-sm text-stone-600">
              {record.history.map((h, i) => (
                <li key={i}>
                  <span className="text-stone-400">{new Date(h.at).toLocaleString()}: </span>
                  {h.changeSummary}
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => handleRevert("previous")}
              disabled={record.history.length === 0}
              className="text-sm text-orange-700 disabled:opacity-30 hover:underline"
            >
              Undo last change
            </button>
            <button onClick={() => handleRevert("original")} className="text-sm text-orange-700 hover:underline">
              Revert to original
            </button>
          </div>
        </div>
      )}

      {viewMode === "standard" ? <StandardView recipe={recipe} /> : <CookMode key={JSON.stringify(recipe.steps)} recipe={recipe} />}
    </div>
  );
}
