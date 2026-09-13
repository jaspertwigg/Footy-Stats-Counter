# Home Kitchen

An AI-assisted app for organizing and cooking from your recipes.

## Features

- **Import recipes** from pasted text, a web link, or photos of a physical recipe book (multi-page
  supported). Claude restructures whatever you give it into a clean, consistent recipe format.
- **Two ways to view a recipe**: a traditional ingredients + method page, or "Cook mode" - a
  step-by-step, one-instruction-at-a-time view for following along while you cook.
- **Request changes in plain language**, e.g.:
  - "This is too sweet, make it less sweet"
  - "I only have 4 bananas" (scales the whole recipe to match)
  - "Use grams for butter instead of tablespoons"
  - Any other edit - swap an ingredient, change a technique, adjust serving size, etc.
- Full history of changes per recipe, with one-click undo or revert to the original import.

## Stack

- `server/` - Express + TypeScript API, SQLite storage (`better-sqlite3`), Claude (`@anthropic-ai/sdk`)
  for recipe extraction and editing via structured outputs.
- `web/` - React + TypeScript + Vite + Tailwind CSS frontend.

## Setup

Requires Node.js 20+.

```bash
npm run install:all
```

Then add your Anthropic API key:

```bash
cp server/.env.example server/.env
# edit server/.env and set ANTHROPIC_API_KEY=sk-ant-...
```

## Run it

```bash
npm run dev
```

This starts the API on `http://localhost:8787` and the web app on `http://localhost:5173` (which
proxies `/api` requests to the server). Open `http://localhost:5173` in your browser.

## Notes & limitations

- Recipes are stored locally in a SQLite file at `server/data/recipes.db` - this is a single-user,
  local-first app with no accounts.
- Importing from a link works well for recipe blogs and most articles. Heavily gated social
  platforms (Instagram, TikTok, Facebook) often block automated fetching entirely - if a link
  import fails, paste the caption or recipe text directly using the "Paste text" tab instead.
- Photo import sends the image(s) directly to Claude's vision capabilities to transcribe
  handwriting/print - no separate OCR step is needed, but very messy handwriting may need minor
  manual correction afterward via a change request (e.g. "the second ingredient should be 200g
  flour, not 100g").
- Ingredient-based scaling and unit conversion use Claude's culinary knowledge (e.g. typical
  banana/butter densities) rather than a fixed conversion table, so results are estimates - always
  a good idea to sanity-check quantities for anything sensitive to precision (baking chemistry,
  etc).
