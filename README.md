# Claude Quest 🧭

A small, self-contained web game that gamifies getting better at working with Claude and Claude Code.

Pick a skill tree and play two mini-games against **BOLT**, a fast, overconfident rival
who never reads the prompt properly. Beating BOLT means the technique actually stuck.

## How it plays

- **Memory Match** — flip cards to pair each technique with the payoff it buys you
  (e.g. "CLAUDE.md" ↔ "persistent project notes Claude reads every session"). No
  timer — it's scored on moves, and you're racing BOLT's move count, not a clock.
- **Prompt Race** — given a real scenario, draft technique cards one at a time against
  BOLT. Good picks push your progress bar further than traps and filler do. After 4
  rounds, whoever's further along wins — and you get a recap of the "prompt" your
  picks assembled.
- **XP & Levels** — clearing a deck or winning a race earns XP; leveling up triggers a
  title change and a confetti burst.
- **Daily Challenge** — one bonus-XP Prompt Race per day, category picked
  deterministically by date. Playing on consecutive days builds a streak.
- **Achievements** — badges for things like clearing every deck, beating BOLT everywhere,
  a flawless memory run, winning by exactly 1 point, or a 3-race win streak.
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
- `data.js` — memory decks, race scenarios, BOLT's flavor text, and badge definitions
- `app.js` — game logic (state, both mini-games, leveling, rendering)
