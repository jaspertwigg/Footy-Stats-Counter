import { useState } from "react";
import type { Recipe } from "../types";

function formatQty(q: number) {
  if (Number.isInteger(q)) return q.toString();
  return q.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export default function CookMode({ recipe }: { recipe: Recipe }) {
  const [step, setStep] = useState(0);
  const [showIngredients, setShowIngredients] = useState(false);
  const total = recipe.steps.length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setShowIngredients((v) => !v)}
          className="text-sm text-orange-700 font-medium hover:underline"
        >
          {showIngredients ? "Hide" : "Show"} ingredients
        </button>
        <span className="text-sm text-stone-500">
          Step {step + 1} of {total}
        </span>
      </div>

      {showIngredients && (
        <ul className="mb-6 rounded-lg bg-orange-50 border border-orange-100 p-4 space-y-1.5">
          {recipe.ingredients.map((ing, i) => (
            <li key={i} className="text-sm text-stone-800">
              <span className="font-medium">
                {ing.quantity != null ? formatQty(ing.quantity) : ""} {ing.unit ?? ""}
              </span>{" "}
              {ing.name}
              {ing.notes ? `, ${ing.notes}` : ""}
            </li>
          ))}
        </ul>
      )}

      <div className="h-1.5 w-full bg-orange-100 rounded-full mb-8 overflow-hidden">
        <div
          className="h-full bg-orange-600 transition-all"
          style={{ width: `${((step + 1) / total) * 100}%` }}
        />
      </div>

      <div className="min-h-40 flex items-center justify-center text-center px-4 mb-8">
        <p className="text-2xl leading-snug text-stone-900">{recipe.steps[step]}</p>
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className="rounded-full px-5 py-2.5 border border-stone-200 text-stone-700 disabled:opacity-30 hover:bg-stone-50 transition-colors"
        >
          ← Back
        </button>
        {step < total - 1 ? (
          <button
            onClick={() => setStep((s) => Math.min(total - 1, s + 1))}
            className="rounded-full px-6 py-2.5 bg-orange-600 text-white font-medium hover:bg-orange-700 transition-colors"
          >
            Next →
          </button>
        ) : (
          <span className="text-orange-700 font-medium">🎉 That's the last step!</span>
        )}
      </div>
    </div>
  );
}
