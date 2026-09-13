export interface Ingredient {
  name: string;
  quantity: number | null;
  unit: string | null;
  notes: string | null;
}

export interface Recipe {
  title: string;
  description: string;
  servings: number;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  ingredients: Ingredient[];
  steps: string[];
  tags: string[];
  notes: string | null;
}

export interface HistoryEntry {
  recipe: Recipe;
  changeSummary: string;
  at: string;
}

export interface RecipeRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  sourceType: "text" | "url" | "photo" | "manual";
  sourceRef: string | null;
  original: Recipe;
  current: Recipe;
  history: HistoryEntry[];
}
