import { z } from "zod";

export const IngredientSchema = z.object({
  name: z.string().describe("Ingredient name, e.g. 'unsalted butter'"),
  quantity: z
    .number()
    .nullable()
    .describe("Numeric amount, or null for 'to taste' / non-quantified items"),
  unit: z
    .string()
    .nullable()
    .describe("Unit of measure, e.g. 'g', 'tbsp', 'cup', 'tsp', or null if the item is just counted (e.g. '2 eggs' -> unit null)"),
  notes: z
    .string()
    .nullable()
    .describe("Preparation notes, e.g. 'softened', 'finely diced', or null"),
});

export const RecipeSchema = z.object({
  title: z.string(),
  description: z.string().describe("A short 1-3 sentence description of the dish"),
  servings: z.number().describe("Number of servings/portions this recipe makes"),
  prepTimeMinutes: z.number().nullable(),
  cookTimeMinutes: z.number().nullable(),
  ingredients: z.array(IngredientSchema),
  steps: z
    .array(z.string())
    .describe("Ordered method steps, each a single self-contained instruction suitable for a step-by-step 'cook mode' display"),
  tags: z.array(z.string()).describe("Short lowercase tags, e.g. 'dessert', 'baking', 'vegetarian'"),
  notes: z.string().nullable().describe("Any extra tips, storage info, or substitutions worth keeping, or null"),
});

export type Recipe = z.infer<typeof RecipeSchema>;
export type Ingredient = z.infer<typeof IngredientSchema>;

export const RecipeEditResultSchema = z.object({
  recipe: RecipeSchema,
  changeSummary: z
    .string()
    .describe("One or two sentences in plain language explaining exactly what changed and why, to show the user"),
});

export type RecipeEditResult = z.infer<typeof RecipeEditResultSchema>;

export interface RecipeRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  sourceType: "text" | "url" | "photo" | "manual";
  sourceRef: string | null;
  original: Recipe;
  current: Recipe;
  history: Array<{ recipe: Recipe; changeSummary: string; at: string }>;
}
