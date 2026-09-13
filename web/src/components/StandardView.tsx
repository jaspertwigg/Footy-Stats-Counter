import type { Recipe } from "../types";

function formatQty(q: number) {
  if (Number.isInteger(q)) return q.toString();
  return q.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export default function StandardView({ recipe }: { recipe: Recipe }) {
  return (
    <div className="grid sm:grid-cols-[1fr_1.4fr] gap-8">
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-orange-700 mb-3">
          Ingredients
        </h2>
        <ul className="space-y-2">
          {recipe.ingredients.map((ing, i) => (
            <li key={i} className="flex gap-2 text-sm text-stone-800">
              <span className="font-medium text-stone-900 whitespace-nowrap">
                {ing.quantity != null ? formatQty(ing.quantity) : ""} {ing.unit ?? ""}
              </span>
              <span>
                {ing.name}
                {ing.notes ? <span className="text-stone-500">, {ing.notes}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-orange-700 mb-3">
          Method
        </h2>
        <ol className="space-y-3 list-decimal list-inside">
          {recipe.steps.map((step, i) => (
            <li key={i} className="text-sm text-stone-800 leading-relaxed">
              {step}
            </li>
          ))}
        </ol>

        {recipe.notes && (
          <div className="mt-5 rounded-lg bg-orange-50 border border-orange-100 px-3 py-2 text-sm text-stone-700">
            <span className="font-medium text-orange-800">Notes: </span>
            {recipe.notes}
          </div>
        )}
      </section>
    </div>
  );
}
