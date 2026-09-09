# Claude Quest 🧭

A small, self-contained web game that gamifies getting better at working with Claude and Claude Code.

Pick a skill tree, clear quests, and level up while actually learning real techniques —
better prompting, Claude Code features (CLAUDE.md, plan mode, subagents, hooks), agentic
workflow habits, context management, and a few advanced tricks.

## How it plays

- **Skill Map** — 5 categories, each a short set of quests: untimed multiple-choice
  scenarios and "rewrite this prompt" exercises that are scored against a keyword
  rubric and always show a strong example answer.
- **XP & Levels** — clearing quests earns XP; leveling up triggers a title change and a
  confetti burst.
- **Daily Challenge** — one bonus-XP question per day, picked deterministically by date.
  Playing on consecutive days builds a streak.
- **Achievements** — badges for milestones like mastering a whole category, a 10-answer
  correct streak, or a 7-day daily streak.
- **Stats** — totals, streaks, and buttons to export/import or reset your progress.

Progress is saved to `localStorage` in your browser — nothing is sent anywhere.

## Running it

No build step or dependencies. Either:

- Open `index.html` directly in a browser, or
- Serve the folder locally, e.g. `python3 -m http.server 8080` then visit
  `http://localhost:8080`.

## Files

- `index.html` — page structure
- `styles.css` — theme and layout
- `data.js` — quest content, categories, and badge definitions
- `app.js` — game logic (state, scoring, leveling, rendering)
