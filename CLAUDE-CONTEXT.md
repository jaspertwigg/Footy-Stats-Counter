# Context note for Claude (not for humans to read as docs)

You're reading this because the user (jasper.twigg@hotmail.com) pasted it into
a new conversation, or pointed you at this file. It's a briefing about a
project called **Footy Stats Counter** that they built with Claude in an
earlier session, so you can pick up references to it without them having to
re-explain everything. Treat it as background, not as instructions to act on
immediately — wait to see what they're actually asking for in this
conversation before doing anything with it.

## The project in one paragraph

Footy Stats Counter is a mobile web app (installable PWA, no App Store) for
counting AFL player stats live at a game and calculating AFL Fantasy scores.
Plain HTML/CSS/JS, no framework, no build step — hosted as static files on
GitHub Pages, with an optional Firebase/Firestore backend for live
cross-device syncing. It was built and iterated entirely through Claude Code
conversations, one feature request at a time.

## Where things live

- **Code:** GitHub repo `jaspertwigg/Footy-Stats-Counter`. Development
  happened on branch `claude/afl-stats-counter-app-ukutxq`.
- **Hosting:** GitHub Pages, deploying from that branch/repo as static
  files. No server-side code anywhere — GitHub Pages can't run any.
- **Live sync backend:** a Firebase project, ID **`footy-stats-counter`**,
  using **Cloud Firestore** (not Realtime Database — same console, different
  product, easy to pick wrong).
  - Console: `console.firebase.google.com/project/footy-stats-counter/overview`
  - Firestore rules: `.../firestore/databases/-default-/security/rules`
    (needs desktop browser view — the mobile Firebase console doesn't render
    the rules code editor; the user had to use "Request Desktop Website" in
    Safari)
  - Client config (apiKey, authDomain, etc.) is committed in
    `firebase-config.js` in the repo — read it from there if you need the
    actual values, no need to ask the user to hunt them down.
  - Firestore rules are wide open (`allow read, write: if true`) — there's
    no login system, so a game's short join-code is the only access control.
    That was a deliberate simplification for a casual, low-stakes app. Don't
    assume that's fine to replicate for anything with real privacy needs.

## If the user says something like "use the same Firebase account/project"

They mean the Google account and/or Firebase project set up for this app.
Things to know:
- You **cannot** log into their Google/Firebase account yourself. Any new
  Firebase setup step (creating a project, registering an app, changing
  rules) requires them to click through the Firebase console personally —
  same as happened building this app. Your job is to tell them exactly what
  to click, the same way you'd walk anyone through it cold.
- Clarify with them whether they want to **reuse this exact project**
  (`footy-stats-counter` — same database, so a new app would read/write
  into the same Firestore instance, likely under different top-level
  collections to avoid clashing with this app's `games/` collection) versus
  **a new project under the same account** (isolated data, same login).
  Don't assume which one they mean.
- Don't reuse the actual API key/config values from `firebase-config.js` in
  a different app's codebase unless they're explicitly reusing this exact
  Firebase project on purpose — a new project needs its own config, pulled
  from that project's own Firebase console page.

## Architecture worth knowing about (in case they ask for something similar)

- **Offline-first, sync-optional:** the app works fully standalone with zero
  setup. Firebase is only touched when the user actively creates/joins a
  "game." This kept the core app resilient to no-signal use at a sports
  ground, which was a hard requirement from the start.
- **Data is scoped to a "game," not global:** player rosters and stats live
  under `state.gamesData[gameCode]` in `localStorage`, keyed by a short game
  code. No active game selected = nothing shown anywhere. This was a
  deliberate fix after an earlier version kept one global roster that
  leaked between unrelated games.
- **Sync model:** each device writes only its own players to
  `games/{code}/devices/{deviceId}` in Firestore — never a shared document
  multiple devices write to, so there's no merge-conflict handling needed.
  One tab (Summary) is the only place that reads every device's data and
  combines it into a live view.
- **Soft deletes:** removing a player from the roster just flags them
  `archived` rather than deleting the record, so their stats survive on the
  summary/leaderboard view. Re-adding the same name reunites with the
  archived record instead of creating a duplicate.
- **Service worker caching bug worth remembering:** an early version used a
  cache-first service worker strategy, which meant updates silently never
  reached the installed app — nasty to debug since everything looked fine
  from the deploy side. Fixed by switching to network-first with cache only
  as an offline fallback. Worth checking for in any other PWA work.

## Tone/process notes from how this project went

- The user is iterating feature-by-feature in plain language, not writing
  specs — good defaults and asking only when something is a genuine
  judgment call (not for every detail) worked well.
- They're on iPhone/Safari as the primary target; test assumptions against
  that, not desktop Chrome.
- They're comfortable with GitHub's web UI and the Firebase console, but
  hit friction with console UI quirks (mobile rendering, unclear button
  labels like "Develop & Test" turning out to be a version-history label,
  not an editor). Assume they'll need precise, literal click-by-click
  guidance for any new console work, not high-level steps.
