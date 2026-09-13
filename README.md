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

- `functions/` - a Firebase Cloud Function (Express + TypeScript) that talks to Firestore for
  storage and to Claude (`@anthropic-ai/sdk`) for recipe extraction and editing via structured
  outputs.
- `web/` - React + TypeScript + Vite + Tailwind CSS frontend, served by Firebase Hosting.
- `firebase.json` ties them together: Hosting serves the built frontend and rewrites `/api/**`
  requests to the function, so the whole app is one Firebase project with one URL.

## Putting it online (so you can use it from your phone too)

This uses the same Firebase account/CLI flow as the footy stats app - just a new project so the
two apps' data stay separate.

1. **Create a Firebase project** at [console.firebase.google.com](https://console.firebase.google.com)
   (or `firebase projects:create` from the CLI).
2. **Upgrade it to the Blaze (pay-as-you-go) plan.** This is required because the app calls the
   Anthropic API from a Cloud Function, and Google only allows Cloud Functions to make outbound
   network calls on Blaze. Firestore and Hosting stay free either way, and Blaze includes a
   generous free-usage tier - a personal recipe app won't come close to real charges.
3. From the repo root, log in and point the CLI at your new project:
   ```bash
   npx firebase-tools login
   npx firebase-tools use --add
   ```
   (pick the project you just created; this writes a local `.firebaserc`, which is gitignored)
4. Set your Anthropic API key as a Cloud Functions secret:
   ```bash
   npx firebase-tools functions:secrets:set ANTHROPIC_API_KEY
   ```
   (paste your key when prompted)
5. Build and deploy everything:
   ```bash
   npm run install:all
   npm run deploy
   ```
6. When it finishes, the CLI prints your **Hosting URL** (something like
   `https://home-kitchen-xxxxx.web.app`) - that's your app, reachable from any device.
7. On your phone, open that URL in the browser, then use the browser's "Add to Home Screen" (or
   "Install app") option to get an app icon on your home screen.

To push a later update, just run `npm run deploy` again.

## Running it locally (Firebase emulators)

Requires Node.js 20+ and the Firebase CLI (`npx firebase-tools`, no separate install needed).

```bash
npm run install:all
npx firebase-tools login
npx firebase-tools use --add   # link to your Firebase project (or a throwaway one for testing)

# optional, only needed to test import/edit locally against the real Claude API:
echo 'ANTHROPIC_API_KEY=sk-ant-...' > functions/.secret.local

npm run emulate
```

This builds everything and starts the Firebase Emulator Suite - open **http://localhost:5000** for
the full app (frontend + API + a local Firestore, all emulated, nothing deployed). The Emulator UI
at **http://localhost:4000** lets you inspect stored recipes.

For fast frontend-only iteration with hot reload, run `npm run emulate` in one terminal and
`npm run dev` in another - the Vite dev server on port 5173 proxies `/api` to the emulators.

## Notes & limitations

- This is a single-user, local-first style app with no accounts/login. Firestore security rules
  deny all direct client access - the frontend only ever talks to Firestore through the Cloud
  Function.
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
- The deployed Cloud Function spins down when idle, like most pay-as-you-go serverless functions,
  so the first request after a quiet period takes a couple of seconds longer while it wakes up -
  your data is unaffected either way, since it lives in Firestore, not in the function itself.
