import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";

type Tab = "text" | "url" | "photo";

export default function ImportRecipe() {
  const [tab, setTab] = useState<Tab>("text");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [photoContext, setPhotoContext] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function run(fn: () => Promise<{ id: string }>) {
    setLoading(true);
    setError(null);
    try {
      const record = await fn();
      navigate(`/recipes/${record.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "text", label: "Paste text" },
    { id: "url", label: "From a link" },
    { id: "photo", label: "Photo of a recipe" },
  ];

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-2xl font-semibold text-stone-900 mb-4">Add a recipe</h1>

      <div className="flex gap-1 mb-5 border-b border-orange-100">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? "border-orange-600 text-orange-700"
                : "border-transparent text-stone-500 hover:text-stone-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">
          {error}
        </div>
      )}

      {tab === "text" && (
        <div className="space-y-3">
          <p className="text-sm text-stone-500">
            Paste a recipe from a document, email, or anywhere else - the app will restructure it
            into the standard format.
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={12}
            placeholder="Paste your recipe text here…"
            className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
          />
          <button
            disabled={loading || !text.trim()}
            onClick={() => run(() => api.importText(text))}
            className="rounded-full bg-orange-600 text-white font-medium px-5 py-2.5 disabled:opacity-40 hover:bg-orange-700 transition-colors"
          >
            {loading ? "Importing…" : "Import recipe"}
          </button>
        </div>
      )}

      {tab === "url" && (
        <div className="space-y-3">
          <p className="text-sm text-stone-500">
            Paste a link to a recipe blog, news article, or social media post. Some platforms
            (Instagram, TikTok, Facebook) block automated fetching - if that happens, paste the
            caption/recipe text instead using the "Paste text" tab.
          </p>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/my-favourite-cookies"
            className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
          />
          <button
            disabled={loading || !url.trim()}
            onClick={() => run(() => api.importUrl(url))}
            className="rounded-full bg-orange-600 text-white font-medium px-5 py-2.5 disabled:opacity-40 hover:bg-orange-700 transition-colors"
          >
            {loading ? "Fetching…" : "Import from link"}
          </button>
        </div>
      )}

      {tab === "photo" && (
        <div className="space-y-3">
          <p className="text-sm text-stone-500">
            Upload one or more photos of a recipe (e.g. pages from your handwritten recipe book).
            Add more than one photo if the recipe spans multiple pages.
          </p>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            className="block text-sm"
          />
          {files.length > 0 && (
            <p className="text-xs text-stone-500">{files.length} photo(s) selected</p>
          )}
          <input
            value={photoContext}
            onChange={(e) => setPhotoContext(e.target.value)}
            placeholder="Optional: any extra context (e.g. 'Grandma's shortbread, second page is the icing')"
            className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
          />
          <button
            disabled={loading || files.length === 0}
            onClick={() => run(() => api.importPhoto(files, photoContext || undefined))}
            className="rounded-full bg-orange-600 text-white font-medium px-5 py-2.5 disabled:opacity-40 hover:bg-orange-700 transition-colors"
          >
            {loading ? "Reading photo(s)…" : "Import from photo"}
          </button>
        </div>
      )}
    </div>
  );
}
