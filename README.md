# Footy Stats Counter

A fast, one-tap AFL player stat counter built as an installable web app (PWA)
for use pitch-side on an iPhone. No App Store, no build step — open it in
Safari and add it to your home screen for a full-screen, app-like experience
that works offline.

## Features

- Track up to **5 players** at once.
- Record: **Goals, Behinds, Kicks, Handballs, Marks, Intercept Marks, Free
  Kicks For, Free Kicks Against, Tackles, Hitouts**.
  - Intercept Marks add to the Marks tally (but Marks don't add to Intercept
    Marks).
- Every stat is **one tap** to record (tap the active player once if you need
  to switch, then tap the stat). A small `−` in the corner of each button
  lets you correct a single stat, and an **Undo** button reverses the very
  last tap instantly.
- Live **AFL Fantasy score** per player, calculated with standard AFL Fantasy
  Classic scoring:

  | Stat              | Points |
  |-------------------|-------:|
  | Kick              |     +3 |
  | Handball          |     +2 |
  | Mark (incl. intercept marks) | +3 |
  | Tackle            |     +4 |
  | Free Kick For     |     +1 |
  | Free Kick Against |     −3 |
  | Hitout            |     +1 |
  | Goal              |     +6 |
  | Behind            |     +1 |

- Three tabs:
  1. **Players** — enter names for up to 5 players.
  2. **Record** — pick the active player and tap stats as they happen.
  3. **Summary** — full stat breakdown and fantasy score for every player,
     ranked highest to lowest, with a one-tap game reset.
- Works fully offline once installed (service worker caches all assets), and
  everything is saved to the device automatically — nothing is lost if you
  background the app or lose signal at the ground.

## Install on iPhone

1. Host the contents of this repo somewhere reachable from your phone (see
   below), or open `index.html` directly.
2. Open the page in **Safari** on your iPhone.
3. Tap the **Share** icon, then **Add to Home Screen**.
4. Launch it from the home screen icon — it opens full-screen like a native
   app.

### Quick local hosting for testing

From the project folder:

```bash
python3 -m http.server 8000
```

Then visit `http://<your-computer-ip>:8000` from your iPhone (same Wi-Fi
network). For real matchday use, host it on any static file host (GitHub
Pages, Netlify, Vercel, etc.) so it has a stable HTTPS URL — HTTPS is
required for the service worker/offline support and "Add to Home Screen" to
behave like a proper installed app.

## Project structure

```
index.html            App shell and markup for all three tabs
styles.css             iOS-style dark UI, large touch targets
app.js                 App logic: state, scoring, rendering
manifest.webmanifest   PWA metadata (name, icons, theme color)
service-worker.js      Offline caching
icons/                 App icons for home screen / splash
```

No build tools, frameworks, or dependencies — plain HTML/CSS/JS.
