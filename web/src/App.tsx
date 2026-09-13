import { Routes, Route, Link } from "react-router-dom";
import RecipeList from "./components/RecipeList";
import ImportRecipe from "./components/ImportRecipe";
import RecipeDetail from "./components/RecipeDetail";

export default function App() {
  return (
    <div className="min-h-svh flex flex-col">
      <header className="border-b border-orange-100 bg-white/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="text-xl font-semibold text-orange-900 tracking-tight">
            🍲 Home Kitchen
          </Link>
          <Link
            to="/import"
            className="rounded-full bg-orange-600 text-white text-sm font-medium px-4 py-2 hover:bg-orange-700 transition-colors"
          >
            + Add recipe
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-6">
        <Routes>
          <Route path="/" element={<RecipeList />} />
          <Route path="/import" element={<ImportRecipe />} />
          <Route path="/recipes/:id" element={<RecipeDetail />} />
        </Routes>
      </main>
    </div>
  );
}
