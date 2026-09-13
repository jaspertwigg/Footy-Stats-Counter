import { useState } from "react";

const SUGGESTIONS = [
  "Make it less sweet",
  "I only have 4 bananas",
  "Use grams for butter instead of tablespoons",
  "Make it serve 2 people",
];

export default function EditRequestBox({
  onSubmit,
  loading,
}: {
  onSubmit: (instruction: string) => void;
  loading: boolean;
}) {
  const [value, setValue] = useState("");

  function submit() {
    if (!value.trim() || loading) return;
    onSubmit(value.trim());
    setValue("");
  }

  return (
    <div className="rounded-xl border border-orange-100 bg-white p-4">
      <h3 className="text-sm font-semibold text-stone-900 mb-2">Request a change</h3>
      <p className="text-xs text-stone-500 mb-3">
        Ask for taste adjustments, scale to what you have on hand, or swap units - in plain
        language.
      </p>
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="e.g. 'this is too sweet, make it less sweet'"
          className="flex-1 rounded-lg border border-stone-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
        />
        <button
          onClick={submit}
          disabled={loading || !value.trim()}
          className="rounded-lg bg-orange-600 text-white text-sm font-medium px-4 disabled:opacity-40 hover:bg-orange-700 transition-colors"
        >
          {loading ? "Updating…" : "Apply"}
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-3">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => setValue(s)}
            className="text-xs bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-full px-2.5 py-1 transition-colors"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
