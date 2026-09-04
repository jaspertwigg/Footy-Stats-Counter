# Footy Stats Counter

A fast, one-tap AFL player stat counter built as an installable web app (PWA)
for use pitch-side on an iPhone. No App Store, no build step — open it in
Safari and add it to your home screen for a full-screen, app-like experience
that works offline.

## Features

- Each device tracks its **own roster of players** — tap **+ Add Player** to
  add as many as you need (starts empty), with a remove button on each row.
- Record: **Goals, Behinds, Kicks, Handballs, Marks, Intercept Marks, Free
  Kicks For, Free Kicks Against, Tackles, Hitouts**.
  - Intercept Marks add to the Marks tally (but Marks don't add to Intercept
    Marks).
- The **Record tab is stripped down to just the stat buttons** — no scores or
  running totals to look at, just the button titles so it's fast under
  pressure. Tap a player chip, then tap a stat — the selection clears
  immediately afterward so a stale selection can never catch the next tap.
  A small `−` in the corner of each button corrects a single stat, and an
  **Undo** button reverses the very last tap instantly. A toast confirms
  what was just recorded.
- Live **AFL Fantasy score** per player on the **Summary tab**, calculated
  with standard AFL Fantasy Classic scoring:

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
  1. **Players** — add/remove as many players as you need. Local to this
     device only.
  2. **Record** — pick the active player and tap stats as they happen. Local
     to this device only.
  3. **Summary** — the only tab where other people's contributions show up
     (see "Live sharing" below). Full stat breakdown and fantasy score for
     every player, sortable by tapping any column, with a reset for your own
     stats.
- **Live sharing across phones** (optional): everyone adds and records their
  own players on their own phone as normal, and the Summary tab merges
  everyone's players into one live, shared scoreboard in real time. See
  "Set up live sharing" below — this needs a one-time, free setup step.
- Works fully offline once installed (service worker caches all assets), and
  everything is saved to the device automatically — nothing is lost if you
  background the app or lose signal at the ground. Live sharing is optional
  on top of that: with no game code set, the app runs exactly as a
  single-device tool.

## Install on iPhone

1. Host the contents of this repo somewhere reachable from your phone (see
   below), or open `index.html` directly.
2. Open the page in **Safari** on your iPhone.
3. Tap the **Share** icon, then **Add to Home Screen** (not "Add Bookmark" —
   that just saves a link and reopens in Safari).
4. Launch it from the home screen icon — it opens full-screen like a native
   app, no browser bar.

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

## Set up live sharing (optional)

By default the app works entirely on one device — nothing to set up. To let
everyone's phones contribute to one shared, live Summary tab, you need a free
Firebase project (Google's realtime database). This is a one-time setup for
whoever maintains the app; nobody else needs to do anything beyond tapping
the game-code button.

1. Go to [console.firebase.google.com](https://console.firebase.google.com/)
   and sign in with any Google account.
2. Click **Add project**, give it any name, and create it (the free "Spark"
   plan is enough — no credit card needed). You can skip Google Analytics.
3. In the project, click the **`</>`** (web app) icon to register a new web
   app. Give it any nickname; you don't need Firebase Hosting.
4. Firebase will show you a `firebaseConfig` object with six values
   (`apiKey`, `authDomain`, `projectId`, `storageBucket`,
   `messagingSenderId`, `appId`). Copy them into **`firebase-config.js`** in
   this repo, replacing the `"YOUR_..."` placeholders. You can edit the file
   directly on GitHub (pencil icon) if that's easier than cloning locally.
5. In the left sidebar, go to **Build → Firestore Database → Create
   database**. Pick any location close to you.
6. Once created, open the **Rules** tab and replace the rules with:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /games/{gameId}/devices/{deviceId} {
         allow read, write: if true;
       }
     }
   }
   ```

   Click **Publish**. (Firestore's default "test mode" rules expire after 30
   days — these don't, so sharing won't quietly stop working a month later.)

   **Note on privacy:** these rules mean anyone who knows or guesses a game
   code can read or write that game's data. There's no login system — the
   game code is the only thing standing between your group's data and
   anyone else's. That's an acceptable trade-off for a casual team stat
   counter, but don't use this for anything sensitive.
7. Commit/save `firebase-config.js` and let the site redeploy (GitHub Pages
   takes a minute or so).

Once that's done, everyone can tap the **"Solo mode"** button in the top
right of the app:
- Leaving it blank creates a **new game code** to share with your group
  (e.g. by text message).
- Everyone else taps the same button and types in that code to join.
- The button then reads **"Game: XXXXX"**, and the Summary tab shows a live,
  combined scoreboard of everyone in that game. Players and Record stay
  private to each device — only the Summary tab shows what others are doing.
- Tap the button again any time to switch games or clear the code to go back
  to solo mode.

## Project structure

```
index.html            App shell and markup for all three tabs
styles.css             iOS-style dark UI, large touch targets
app.js                 App logic: state, scoring, rendering, cloud sync
firebase-config.js     Your Firebase project's config (see above)
manifest.webmanifest   PWA metadata (name, icons, theme color)
service-worker.js      Offline caching
icons/                 App icons for home screen / splash
```

No build tools or frameworks — plain HTML/CSS/JS, plus the Firebase SDK
loaded from a CDN only for the optional live-sharing feature.
