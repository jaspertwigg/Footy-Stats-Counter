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
- Installable to a phone's home screen like a regular app (it's a website under the hood, so no
  app store needed).

## Stack

- `server/` - Express + TypeScript API, Postgres storage (`pg`), Claude (`@anthropic-ai/sdk`) for
  recipe extraction and editing via structured outputs.
- `web/` - React + TypeScript + Vite + Tailwind CSS frontend.

The server also serves the built frontend directly, so the whole app is one deployable service
with one URL.

## Putting it online (so you can use it from your phone too)

This needs two free accounts: one for a permanent little database (so your recipes don't
disappear), and one to actually run the app and give it a web address.

1. **Database - [neon.com](https://neon.com)**: sign up free, create a project, and copy the
   "connection string" it gives you (starts with `postgresql://`).
2. **Hosting - [render.com](https://render.com)**: sign up free, click **New +** → **Blueprint**,
   connect this GitHub repo, and pick this branch. Render will read `render.yaml` in this repo and
   set itself up automatically. When it asks for environment variables, add:
   - `ANTHROPIC_API_KEY` - your Anthropic API key
   - `DATABASE_URL` - the connection string from Neon
3. Click deploy and wait a few minutes. Render gives you a URL like
   `https://home-kitchen.onrender.com` - that's your app, reachable from any device.
4. On your phone, open that URL in the browser, then use the browser's "Add to Home Screen" (or
   "Install app") option to get an app icon on your home screen.

Note: the free Render plan puts the app to sleep after 15 minutes of no visits, so the first open
after a while takes ~30-60 seconds to wake up - your data is safe either way since it lives in Neon,
not on the server itself.

## Running it on your own computer instead

Requires Node.js 20+ and a Postgres database (a free [neon.com](https://neon.com) one works fine
here too, or a local Postgres install).

```bash
npm run install:all
cp server/.env.example server/.env
# edit server/.env and set ANTHROPIC_API_KEY and DATABASE_URL
npm run dev
```

This starts the API on `http://localhost:8787` and the web app on `http://localhost:5173` (which
proxies `/api` requests to the server). Open `http://localhost:5173` in your browser.

## Notes & limitations

- This is a single-user, local-first style app with no accounts/login.
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
