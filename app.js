(() => {
  "use strict";

  const STORAGE_KEY = "footy-stats-counter-v1";
  const GAME_CODE_KEY = "footy-game-code";

  // AFL Fantasy (Classic) scoring values.
  // Intercept Marks increment the Marks tally (handled at record time) but
  // carry no separate point value of their own, so they aren't double counted.
  const STAT_DEFS = [
    { key: "goals", label: "Goal", points: 6 },
    { key: "behinds", label: "Behind", points: 1 },
    { key: "kicks", label: "Kick", points: 3 },
    { key: "handballs", label: "Handball", points: 2 },
    { key: "marks", label: "Mark", points: 3 },
    { key: "interceptMarks", label: "Intercept Mark", points: 0, addsToMarks: true },
    { key: "tackles", label: "Tackle", points: 4 },
    { key: "hitouts", label: "Hitout", points: 1 },
    { key: "freesFor", label: "Free For", points: 1 },
    { key: "freesAgainst", label: "Free Against", points: -3 },
  ];

  const STAT_KEYS = STAT_DEFS.map((s) => s.key);

  function emptyStats() {
    const s = {};
    for (const k of STAT_KEYS) s[k] = 0;
    return s;
  }

  function normalizePlayers(rawPlayers) {
    return Array.isArray(rawPlayers)
      ? rawPlayers.map((p) => ({
          name: typeof (p && p.name) === "string" ? p.name : "",
          stats: Object.assign(emptyStats(), (p && p.stats) || {}),
          // Archived players are removed from Players/Record but keep their
          // stats visible on Summary — "remove" is a soft delete, not a
          // hard one, so a player's contribution to the game isn't lost.
          archived: !!(p && p.archived),
        }))
      : [];
  }

  // Player rosters and stats belong to a specific game (state.gamesData is
  // keyed by game code) so that deleting a game erases its players/stats
  // too, and having no active game shows no data at all.
  let gameCode = localStorage.getItem(GAME_CODE_KEY) || "";

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          const gamesData = {};
          if (parsed.gamesData && typeof parsed.gamesData === "object") {
            for (const code of Object.keys(parsed.gamesData)) {
              gamesData[code] = { players: normalizePlayers(parsed.gamesData[code] && parsed.gamesData[code].players) };
            }
          } else if (Array.isArray(parsed.players) && gameCode) {
            // Migrating from the old single-roster format: only keep it if
            // it can be attached to the game this device was last in —
            // otherwise there's no game left for it to belong to.
            gamesData[gameCode] = { players: normalizePlayers(parsed.players) };
          }
          return { gamesData, activePlayer: null, history: [] };
        }
      }
    } catch (e) {
      /* corrupt storage, fall through to fresh state */
    }
    return { gamesData: {}, activePlayer: null, history: [] };
  }

  const state = loadState();

  function currentPlayers() {
    if (!gameCode) return [];
    if (!state.gamesData[gameCode]) {
      state.gamesData[gameCode] = { players: [] };
    }
    return state.gamesData[gameCode].players;
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    pushToCloud();
  }

  function scoreFor(stats) {
    let total = 0;
    for (const def of STAT_DEFS) {
      total += (stats[def.key] || 0) * def.points;
    }
    return total;
  }

  // ---------- Cloud sync (live shared game) ----------
  // Each device only ever writes its own players to its own document under
  // games/{gameCode}/devices/{deviceId} — there's no shared document being
  // edited by multiple devices at once, so there's nothing to merge-conflict.
  // The Summary tab is the only place that reads other devices' documents
  // and combines them into one live view; Players and Record stay local.
  const DEVICE_ID_KEY = "footy-device-id";
  const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L, easy to read aloud

  function randomCode(length) {
    return Array.from({ length }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");
  }

  function sanitizeGameCode(raw) {
    return raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  }

  function getDeviceId() {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = randomCode(12);
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  }
  const DEVICE_ID = getDeviceId();

  let db = null;
  let unsubscribeDevices = null;
  let remoteDevices = {}; // deviceId -> that device's named players, from the last snapshot

  function initFirebase() {
    try {
      const configured =
        typeof firebase !== "undefined" &&
        window.FIREBASE_CONFIG &&
        window.FIREBASE_CONFIG.apiKey &&
        window.FIREBASE_CONFIG.apiKey.indexOf("YOUR_") !== 0;
      if (!configured) return;
      firebase.initializeApp(window.FIREBASE_CONFIG);
      db = firebase.firestore();
    } catch (e) {
      console.warn("Cloud sync unavailable:", e);
      db = null;
    }
  }
  initFirebase();

  let pushTimer = null;
  function pushToCloud() {
    if (!db || !gameCode) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      try {
        db.collection("games")
          .doc(gameCode)
          .collection("devices")
          .doc(DEVICE_ID)
          .set({
            players: currentPlayers()
              .filter((p) => p.name.trim() !== "")
              .map((p) => ({ name: p.name.trim(), stats: p.stats })),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          })
          .catch((e) => console.warn("Cloud sync push failed:", e));
      } catch (e) {
        console.warn("Cloud sync push failed:", e);
      }
    }, 300);
  }

  function subscribeToGame() {
    if (unsubscribeDevices) {
      unsubscribeDevices();
      unsubscribeDevices = null;
    }
    remoteDevices = {};
    if (!db || !gameCode) {
      renderSummary();
      return;
    }
    try {
      unsubscribeDevices = db
        .collection("games")
        .doc(gameCode)
        .collection("devices")
        .onSnapshot(
          (snap) => {
            remoteDevices = {};
            snap.forEach((doc) => {
              if (doc.id === DEVICE_ID) return; // our own data is read straight from local state
              const data = doc.data();
              remoteDevices[doc.id] = (data && data.players) || [];
            });
            renderSummary();
          },
          (e) => console.warn("Cloud sync listen failed:", e)
        );
    } catch (e) {
      console.warn("Cloud sync listen failed:", e);
      renderSummary();
    }
  }

  const gameCodeBtn = document.getElementById("game-code-btn");

  function updateGameCodeBtn() {
    gameCodeBtn.textContent = gameCode ? `Game: ${gameCode}` : "Solo mode";
  }

  gameCodeBtn.addEventListener("click", () => switchTab("setup"));

  // ---------- Sharing ----------
  // Copies text with the Clipboard API where available (requires HTTPS and
  // a user-gesture-triggered call, both true here), falling back to a
  // prompt() the user can manually copy from if it's unsupported or denied.
  function copyToClipboard(text, successMessage) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(text)
        .then(() => showToast(successMessage))
        .catch(() => prompt("Copy this:", text));
    } else {
      prompt("Copy this:", text);
    }
  }

  document.getElementById("share-app-btn").addEventListener("click", () => {
    const url = window.location.origin + window.location.pathname;
    if (navigator.share) {
      navigator.share({
        title: "Footy Stats Counter",
        text: "Track AFL player stats fast, right from your phone.",
        url,
      }).catch(() => {}); // ignore cancellation
    } else {
      copyToClipboard(url, "App link copied");
    }
  });

  document.getElementById("setup-copy-code-btn").addEventListener("click", () => {
    if (!gameCode) return;
    copyToClipboard(gameCode, "Game code copied");
  });

  // ---------- Game Setup tab ----------
  // Game metadata (competition/teams/round/date) is stored on the parent
  // games/{code} document, separately from the per-device players/stats
  // documents in its devices subcollection. Each device also keeps a local
  // "recent games" list so it can quickly rejoin a game it's used before
  // without needing to remember or re-fetch the code's details.
  const RECENT_GAMES_KEY = "footy-recent-games";

  function loadRecentGames() {
    try {
      const raw = JSON.parse(localStorage.getItem(RECENT_GAMES_KEY) || "[]");
      return Array.isArray(raw) ? raw : [];
    } catch (e) {
      return [];
    }
  }

  let recentGames = loadRecentGames();

  function findRecentGame(code) {
    return recentGames.find((g) => g.code === code);
  }

  function addRecentGame(entry) {
    recentGames = [entry, ...recentGames.filter((g) => g.code !== entry.code)].slice(0, 12);
    localStorage.setItem(RECENT_GAMES_KEY, JSON.stringify(recentGames));
  }

  let currentGameMeta = gameCode ? findRecentGame(gameCode) || {} : {};

  function joinGame(code, meta) {
    const oldCode = gameCode;
    gameCode = code;
    currentGameMeta = meta || {};
    localStorage.setItem(GAME_CODE_KEY, gameCode);
    addRecentGame({ code, ...currentGameMeta });

    if (oldCode && oldCode !== gameCode && db) {
      db.collection("games").doc(oldCode).collection("devices").doc(DEVICE_ID).delete().catch(() => {});
    }

    // Switching which game is active switches which player roster is in
    // view, so any in-progress selection/undo history from the old game
    // no longer makes sense against the new one.
    state.activePlayer = null;
    state.history = [];

    updateGameCodeBtn();
    saveState();
    subscribeToGame();
    setupView = "current";
    renderSetupTab();
  }

  function leaveGame() {
    const oldCode = gameCode;
    gameCode = "";
    currentGameMeta = {};
    localStorage.removeItem(GAME_CODE_KEY);
    if (oldCode && db) {
      db.collection("games").doc(oldCode).collection("devices").doc(DEVICE_ID).delete().catch(() => {});
    }
    state.activePlayer = null;
    state.history = [];
    updateGameCodeBtn();
    saveState();
    subscribeToGame();
    setupView = "choose";
    renderSetupTab();
  }

  // Deleting a game removes it everywhere: this device's local history and
  // its attached player roster/stats, and (when cloud sync is on) the
  // shared games/{code} document plus everyone's per-device documents under
  // it. There's no login system protecting a game code, so this is a real
  // delete, not just "hide it from me."
  function deleteGame(code) {
    recentGames = recentGames.filter((g) => g.code !== code);
    localStorage.setItem(RECENT_GAMES_KEY, JSON.stringify(recentGames));

    delete state.gamesData[code];

    if (db) {
      try {
        db.collection("games")
          .doc(code)
          .collection("devices")
          .get()
          .then((snap) => snap.forEach((doc) => doc.ref.delete().catch(() => {})))
          .catch((e) => console.warn("Failed to delete game devices:", e));
        db.collection("games")
          .doc(code)
          .delete()
          .catch((e) => console.warn("Failed to delete game:", e));
      } catch (e) {
        console.warn("Failed to delete game:", e);
      }
    }

    if (gameCode === code) {
      gameCode = "";
      currentGameMeta = {};
      localStorage.removeItem(GAME_CODE_KEY);
      state.activePlayer = null;
      state.history = [];
      updateGameCodeBtn();
      subscribeToGame();
      setupView = "choose";
    }
    saveState();
    renderSetupTab();
  }

  const setupCurrentEl = document.getElementById("setup-current");
  const setupChooseEl = document.getElementById("setup-choose");
  const setupCreateEl = document.getElementById("setup-create");
  const setupJoinEl = document.getElementById("setup-join");
  const setupCreateHeadingEl = document.getElementById("setup-create-heading");
  const setupCreateSubmitEl = document.getElementById("setup-create-submit");
  const setupGeneratedCodeEl = document.getElementById("setup-generated-code");

  let setupView = gameCode ? "current" : "choose"; // "current" | "choose" | "create" | "join"
  let setupGeneratedCode = "";
  let setupEditingCode = null; // non-null while "create" view is being used to edit an existing game

  function renderSetupTab() {
    setupCurrentEl.hidden = setupView !== "current";
    setupChooseEl.hidden = setupView !== "choose";
    setupCreateEl.hidden = setupView !== "create";
    setupJoinEl.hidden = setupView !== "join";

    if (setupView === "current") {
      const title = currentGameMeta.teams || currentGameMeta.competition || "Untitled game";
      const metaParts = [currentGameMeta.competition, currentGameMeta.round, currentGameMeta.date].filter(Boolean);
      document.getElementById("setup-current-title").textContent = title;
      document.getElementById("setup-current-meta").textContent = metaParts.join(" • ");
      document.getElementById("setup-current-code").textContent = gameCode;
    }

    if (setupView === "join") {
      renderRecentGamesList();
    }

    renderSavedGamesList();
  }

  function renderRecentGamesList() {
    const wrap = document.getElementById("setup-recent-list");
    wrap.innerHTML = "";
    if (recentGames.length === 0) {
      const p = document.createElement("p");
      p.className = "hint subtle";
      p.textContent = "No games yet.";
      wrap.appendChild(p);
      return;
    }
    recentGames.forEach((g) => {
      const card = document.createElement("div");
      card.className = "recent-game-card";
      const title = g.teams || g.competition || "Untitled game";
      const metaParts = [g.competition, g.round, g.date].filter(Boolean);

      const main = document.createElement("button");
      main.className = "recent-game-main";
      main.innerHTML = `
        <div class="recent-game-title">${escapeHtml(title)}</div>
        ${metaParts.length ? `<div class="recent-game-meta">${escapeHtml(metaParts.join(" • "))}</div>` : ""}
        <div class="recent-game-code">Code: ${escapeHtml(g.code)}</div>
      `;
      main.addEventListener("click", () => {
        joinGame(g.code, g);
        switchTab("players");
      });

      const del = document.createElement("button");
      del.className = "recent-game-delete";
      del.textContent = "✕";
      del.setAttribute("aria-label", "Delete game");
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!confirm(`Delete "${title}"? This removes it for everyone, not just you.`)) return;
        deleteGame(g.code);
      });

      card.appendChild(main);
      card.appendChild(del);
      wrap.appendChild(card);
    });
  }

  document.getElementById("setup-switch-btn").addEventListener("click", () => {
    setupView = "choose";
    renderSetupTab();
  });

  document.getElementById("setup-leave-btn").addEventListener("click", () => {
    if (!confirm("Leave this game and go back to solo mode? Your own players and stats are kept.")) return;
    leaveGame();
  });

  document.getElementById("setup-delete-btn").addEventListener("click", () => {
    if (!confirm(`Delete "${gameCode}"? This removes it for everyone, not just you, and can't be undone.`)) return;
    deleteGame(gameCode);
  });

  document.getElementById("setup-edit-btn").addEventListener("click", () => {
    setupEditingCode = gameCode;
    document.getElementById("setup-competition").value = currentGameMeta.competition || "";
    document.getElementById("setup-teams").value = currentGameMeta.teams || "";
    document.getElementById("setup-round").value = currentGameMeta.round || "";
    document.getElementById("setup-date").value = currentGameMeta.date || "";
    setupGeneratedCodeEl.textContent = gameCode;
    setupCreateHeadingEl.textContent = "Edit game details";
    setupCreateSubmitEl.textContent = "Save Changes";
    setupView = "create";
    renderSetupTab();
  });

  document.getElementById("setup-create-btn").addEventListener("click", () => {
    if (!db) {
      alert(
        'Cloud sync isn\'t set up yet. See the "Set up live sharing" section of README.md to connect a free Firebase project.'
      );
      return;
    }
    setupEditingCode = null;
    setupGeneratedCode = randomCode(5);
    setupGeneratedCodeEl.textContent = setupGeneratedCode;
    setupCreateHeadingEl.textContent = "New game details";
    setupCreateSubmitEl.textContent = "Create Game";
    document.getElementById("setup-competition").value = "";
    document.getElementById("setup-teams").value = "";
    document.getElementById("setup-round").value = "";
    document.getElementById("setup-date").value = new Date().toISOString().slice(0, 10);
    setupView = "create";
    renderSetupTab();
  });

  document.getElementById("setup-create-cancel").addEventListener("click", () => {
    setupEditingCode = null;
    setupView = gameCode ? "current" : "choose";
    renderSetupTab();
  });

  document.getElementById("setup-create-submit").addEventListener("click", () => {
    const meta = {
      competition: document.getElementById("setup-competition").value.trim(),
      teams: document.getElementById("setup-teams").value.trim(),
      round: document.getElementById("setup-round").value.trim(),
      date: document.getElementById("setup-date").value,
    };

    if (setupEditingCode) {
      const code = setupEditingCode;
      currentGameMeta = meta;
      addRecentGame({ code, ...meta });
      if (db) {
        try {
          db.collection("games")
            .doc(code)
            .set(meta, { merge: true })
            .catch((e) => console.warn("Failed to save game details:", e));
        } catch (e) {
          console.warn("Failed to save game details:", e);
        }
      }
      setupEditingCode = null;
      setupView = "current";
      renderSetupTab();
      showToast("Game details updated");
      return;
    }

    const code = setupGeneratedCode;

    if (db) {
      try {
        db.collection("games")
          .doc(code)
          .set({ ...meta, createdAt: firebase.firestore.FieldValue.serverTimestamp() })
          .catch((e) => console.warn("Failed to save game details:", e));
      } catch (e) {
        console.warn("Failed to save game details:", e);
      }
    }

    joinGame(code, meta);
    switchTab("players");
  });

  document.getElementById("setup-join-btn").addEventListener("click", () => {
    if (!db) {
      alert(
        'Cloud sync isn\'t set up yet. See the "Set up live sharing" section of README.md to connect a free Firebase project.'
      );
      return;
    }
    document.getElementById("setup-join-code").value = "";
    setupView = "join";
    renderSetupTab();
  });

  document.getElementById("setup-join-cancel").addEventListener("click", () => {
    setupView = gameCode ? "current" : "choose";
    renderSetupTab();
  });

  document.getElementById("setup-join-submit").addEventListener("click", () => {
    const code = sanitizeGameCode(document.getElementById("setup-join-code").value);
    if (!code) return;

    const known = findRecentGame(code);
    if (known) {
      joinGame(code, known);
      switchTab("players");
      return;
    }

    if (!db) {
      joinGame(code, {});
      switchTab("players");
      return;
    }

    try {
      db.collection("games")
        .doc(code)
        .get()
        .then((doc) => {
          const data = doc.exists ? doc.data() : {};
          joinGame(code, {
            competition: data.competition || "",
            teams: data.teams || "",
            round: data.round || "",
            date: data.date || "",
          });
          switchTab("players");
        })
        .catch(() => {
          joinGame(code, {});
          switchTab("players");
        });
    } catch (e) {
      console.warn("Failed to look up game details:", e);
      joinGame(code, {});
      switchTab("players");
    }
  });

  // ---------- Tab switching ----------
  const views = {
    setup: document.getElementById("view-setup"),
    players: document.getElementById("view-players"),
    record: document.getElementById("view-record"),
    summary: document.getElementById("view-summary"),
  };
  const tabButtons = document.querySelectorAll(".tab-btn");

  function switchTab(tab) {
    for (const [name, el] of Object.entries(views)) {
      el.classList.toggle("active", name === tab);
    }
    for (const btn of tabButtons) {
      btn.classList.toggle("active", btn.dataset.tab === tab);
    }
    if (tab === "setup") renderSetupTab();
    if (tab === "players") renderPlayerInputs();
    if (tab === "record") renderRecord();
    if (tab === "summary") renderSummary();
  }

  for (const btn of tabButtons) {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  }

  // ---------- Players tab ----------
  const playersNoGameEl = document.getElementById("players-no-game");
  const playersContentEl = document.getElementById("players-content");
  const playerInputsEl = document.getElementById("player-inputs");
  const addPlayerBtn = document.getElementById("add-player-btn");

  function renderPlayerInputs() {
    if (!gameCode) {
      playersNoGameEl.hidden = false;
      playersContentEl.style.display = "none";
      return;
    }
    playersNoGameEl.hidden = true;
    playersContentEl.style.display = "block";

    playerInputsEl.innerHTML = "";

    // Archived (removed) players are hidden here and in Record, but keep
    // showing on Summary — "remove" only takes them out of active play.
    const visible = currentPlayers()
      .map((p, idx) => ({ p, idx }))
      .filter((e) => !e.p.archived);

    if (visible.length === 0) {
      const empty = document.createElement("p");
      empty.className = "hint subtle";
      empty.textContent = "No players yet — tap Add Player to get started.";
      playerInputsEl.appendChild(empty);
    }

    visible.forEach(({ p, idx }, displayIdx) => {
      const row = document.createElement("div");
      row.className = "player-row";

      const num = document.createElement("div");
      num.className = "num";
      num.textContent = String(displayIdx + 1);

      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = `Player ${displayIdx + 1} name`;
      input.value = p.name;
      input.autocapitalize = "words";
      input.autocomplete = "off";
      input.enterKeyHint = "done";
      input.addEventListener("input", () => {
        currentPlayers()[idx].name = input.value;
        saveState();
      });

      const removeBtn = document.createElement("button");
      removeBtn.className = "player-remove";
      removeBtn.textContent = "✕";
      removeBtn.setAttribute("aria-label", "Remove player");
      removeBtn.addEventListener("click", () => {
        currentPlayers()[idx].archived = true;
        state.activePlayer = null;
        saveState();
        renderPlayerInputs();
      });

      row.appendChild(num);
      row.appendChild(input);
      row.appendChild(removeBtn);
      playerInputsEl.appendChild(row);
    });

  }

  addPlayerBtn.addEventListener("click", () => {
    currentPlayers().push({ name: "", stats: emptyStats(), archived: false });
    saveState();
    renderPlayerInputs();
    const inputs = playerInputsEl.querySelectorAll(".player-row input");
    const last = inputs[inputs.length - 1];
    if (last) last.focus();
  });

  // ---------- Record tab ----------
  const recordEmptyEl = document.getElementById("record-empty");
  const recordContentEl = document.getElementById("record-content");
  const playerSelectorEl = document.getElementById("player-selector");
  const statGridEl = document.getElementById("stat-grid");
  const undoBtn = document.getElementById("undo-btn");

  function ensureActivePlayerValid() {
    if (state.activePlayer === null) return;
    const p = currentPlayers()[state.activePlayer];
    if (!p || p.archived || p.name.trim() === "") {
      state.activePlayer = null;
    }
  }

  function renderRecord() {
    const named = currentPlayers()
      .map((p, idx) => ({ ...p, idx }))
      .filter((p) => !p.archived && p.name.trim() !== "");

    if (named.length === 0) {
      recordEmptyEl.innerHTML = !gameCode
        ? "<p>Join or create a game on the <strong>Game</strong> tab to start recording stats.</p>"
        : "<p>Add at least one player on the <strong>Players</strong> tab to start recording stats.</p>";
      recordEmptyEl.hidden = false;
      recordContentEl.style.display = "none";
      return;
    }
    recordEmptyEl.hidden = true;
    recordContentEl.style.display = "block";
    ensureActivePlayerValid();

    playerSelectorEl.innerHTML = "";
    named.forEach((p) => {
      const chip = document.createElement("button");
      chip.className = "player-chip" + (p.idx === state.activePlayer ? " active" : "");
      chip.textContent = p.name.trim();
      chip.addEventListener("click", () => {
        state.activePlayer = p.idx;
        saveState();
        renderRecord();
      });
      playerSelectorEl.appendChild(chip);
    });

    const active = state.activePlayer === null ? null : currentPlayers()[state.activePlayer];

    renderStatGrid();
    statGridEl.classList.toggle("disabled", !active);
    undoBtn.disabled = state.history.length === 0;
  }

  function renderStatGrid() {
    statGridEl.innerHTML = "";
    for (const def of STAT_DEFS) {
      const btn = document.createElement("button");
      btn.className = "stat-btn";
      btn.dataset.key = def.key;

      const label = document.createElement("span");
      label.className = "stat-label";
      label.textContent = def.label;

      const minus = document.createElement("button");
      minus.className = "stat-minus";
      minus.textContent = "−";
      minus.addEventListener("click", (e) => {
        e.stopPropagation();
        decrementStat(def.key);
      });

      btn.appendChild(minus);
      btn.appendChild(label);

      btn.addEventListener("click", () => incrementStat(def.key, btn));

      statGridEl.appendChild(btn);
    }
  }

  function incrementStat(key, btnEl) {
    const player = currentPlayers()[state.activePlayer];
    const def = STAT_DEFS.find((d) => d.key === key);
    player.stats[key] = (player.stats[key] || 0) + 1;
    if (def.addsToMarks) {
      player.stats.marks = (player.stats.marks || 0) + 1;
    }
    state.history.push({ playerIdx: state.activePlayer, key, addsToMarks: !!def.addsToMarks });
    if (state.history.length > 200) state.history.shift();

    // Deselect the player after every recorded stat so a stale selection
    // can't cause the next tap to be logged against the wrong player.
    state.activePlayer = null;
    saveState();

    if (btnEl) {
      btnEl.classList.add("flash");
      setTimeout(() => btnEl.classList.remove("flash"), 140);
    }
    renderRecord();
    showToast(`${def.label} recorded for ${player.name.trim()}`);
  }

  function decrementStat(key) {
    const player = currentPlayers()[state.activePlayer];
    if ((player.stats[key] || 0) <= 0) return;
    const def = STAT_DEFS.find((d) => d.key === key);
    player.stats[key] -= 1;
    if (def.addsToMarks && player.stats.marks > 0) {
      player.stats.marks -= 1;
    }
    state.activePlayer = null;
    saveState();
    renderRecord();
  }

  undoBtn.addEventListener("click", () => {
    const last = state.history.pop();
    if (!last) return;
    const player = currentPlayers()[last.playerIdx];
    const def = STAT_DEFS.find((d) => d.key === last.key);
    if (player.stats[last.key] > 0) player.stats[last.key] -= 1;
    if (last.addsToMarks && player.stats.marks > 0) player.stats.marks -= 1;
    saveState();
    renderRecord();
    showToast(`Undid ${def.label} for ${player.name.trim()}`);
  });

  // ---------- Summary tab ----------
  const summaryEmptyEl = document.getElementById("summary-empty");
  const summaryContentEl = document.getElementById("summary-content");
  const summarySyncStatusEl = document.getElementById("summary-sync-status");
  const summaryCardsEl = document.getElementById("summary-cards");
  const summaryTableEl = document.getElementById("summary-table");
  const resetBtn = document.getElementById("reset-btn");

  // Table sort state: which column, and which direction. The score cards
  // above the table always show highest-score-first regardless of this.
  let summarySortKey = "score";
  let summarySortDir = "desc";

  const TABLE_COLUMNS = [
    { key: "name", label: "Player" },
    { key: "score", label: "AF" },
    ...STAT_DEFS.map((d) => ({ key: d.key, label: abbrev(d) })),
  ];

  function sortRows(rows, key, dir) {
    const sorted = [...rows].sort((a, b) => {
      let cmp;
      if (key === "name") {
        cmp = a.name.localeCompare(b.name);
      } else if (key === "score") {
        cmp = a.score - b.score;
      } else {
        cmp = (a.stats[key] || 0) - (b.stats[key] || 0);
      }
      if (cmp === 0) cmp = a.name.localeCompare(b.name);
      return dir === "desc" ? -cmp : cmp;
    });
    return sorted;
  }

  function getCombinedPlayers() {
    const localNamed = currentPlayers()
      .filter((p) => p.name.trim() !== "")
      .map((p) => ({ name: p.name.trim(), stats: p.stats }));

    const remoteNamed = [];
    for (const players of Object.values(remoteDevices)) {
      for (const p of players) {
        if (p && typeof p.name === "string" && p.name.trim() !== "") {
          remoteNamed.push({ name: p.name.trim(), stats: Object.assign(emptyStats(), p.stats || {}) });
        }
      }
    }

    const named = [...localNamed, ...remoteNamed];
    return named.map((p) => ({ name: p.name, stats: p.stats, score: scoreFor(p.stats) }));
  }

  function renderSummary() {
    const base = getCombinedPlayers();

    if (base.length === 0) {
      summaryEmptyEl.innerHTML = !gameCode
        ? "<p>Join or create a game on the <strong>Game</strong> tab to see a summary here.</p>"
        : "<p>Add players and record some stats to see the summary here.</p>";
      summaryEmptyEl.hidden = false;
      summaryContentEl.style.display = "none";
      return;
    }
    summaryEmptyEl.hidden = true;
    summaryContentEl.style.display = "block";

    if (!db) {
      summarySyncStatusEl.textContent = `Game ${gameCode} — cloud sync unavailable right now.`;
    } else {
      const otherCount = Object.keys(remoteDevices).length;
      summarySyncStatusEl.textContent =
        otherCount > 0
          ? `Live in game ${gameCode} — syncing with ${otherCount} other device${otherCount === 1 ? "" : "s"}.`
          : `Live in game ${gameCode} — waiting for others to join.`;
    }

    // Score cards: top 3 by fantasy score only, recalculated fresh every
    // time this renders so the leaderboard stays live as scores change.
    const ranked = sortRows(base, "score", "desc").slice(0, 3);
    summaryCardsEl.innerHTML = "";
    ranked.forEach((p, i) => {
      const card = document.createElement("div");
      card.className = "summary-card";
      card.innerHTML = `
        <div>
          <div class="name">${escapeHtml(p.name)}</div>
          <div class="rank">#${i + 1}</div>
        </div>
        <div class="score">${p.score}</div>
      `;
      summaryCardsEl.appendChild(card);
    });

    // Detail table: sorted by whichever column was last tapped.
    const tableRows = sortRows(base, summarySortKey, summarySortDir);

    const thead = summaryTableEl.querySelector("thead");
    const tbody = summaryTableEl.querySelector("tbody");

    thead.innerHTML = "";
    const headRow = document.createElement("tr");
    TABLE_COLUMNS.forEach((col) => {
      const th = document.createElement("th");
      th.className = "sortable" + (col.key === summarySortKey ? " sorted" : "");
      const arrow = col.key === summarySortKey ? (summarySortDir === "desc" ? " ▼" : " ▲") : "";
      th.textContent = col.label + arrow;
      th.addEventListener("click", () => {
        if (summarySortKey === col.key) {
          summarySortDir = summarySortDir === "desc" ? "asc" : "desc";
        } else {
          summarySortKey = col.key;
          summarySortDir = col.key === "name" ? "asc" : "desc";
        }
        renderSummary();
      });
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);

    tbody.innerHTML = tableRows
      .map(
        (p) => `<tr><td>${escapeHtml(p.name)}</td><td class="score-cell">${p.score}</td>${STAT_DEFS.map(
          (d) => `<td>${p.stats[d.key] || 0}</td>`
        ).join("")}</tr>`
      )
      .join("");
  }

  function abbrev(def) {
    const map = {
      goals: "G",
      behinds: "B",
      kicks: "K",
      handballs: "HB",
      marks: "M",
      interceptMarks: "IM",
      tackles: "T",
      hitouts: "HO",
      freesFor: "FF",
      freesAgainst: "FA",
    };
    return map[def.key] || def.label;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ---------- Saved games ----------
  // A "save" freezes a snapshot of the current combined summary (whatever
  // this device can currently see, local + any synced devices) plus the
  // game's details, so the result survives a later "Reset My Stats" or
  // "Delete This Game". Purely a local, per-device archive — not synced.
  const SAVED_GAMES_KEY = "footy-saved-games";

  function loadSavedGames() {
    try {
      const raw = JSON.parse(localStorage.getItem(SAVED_GAMES_KEY) || "[]");
      return Array.isArray(raw) ? raw : [];
    } catch (e) {
      return [];
    }
  }

  let savedGames = loadSavedGames();

  function saveSavedGames() {
    localStorage.setItem(SAVED_GAMES_KEY, JSON.stringify(savedGames));
  }

  const saveGameBtn = document.getElementById("save-game-btn");
  saveGameBtn.addEventListener("click", () => {
    const players = getCombinedPlayers();
    if (players.length === 0) return;

    const entry = {
      id: Date.now().toString(36) + randomCode(4),
      code: gameCode || null,
      meta: { ...currentGameMeta },
      savedAt: Date.now(),
      players: sortRows(players, "score", "desc"),
    };
    savedGames = [entry, ...savedGames].slice(0, 50);
    saveSavedGames();
    renderSavedGamesList();
    showToast("Game saved");
  });

  function deleteSavedGame(id) {
    savedGames = savedGames.filter((g) => g.id !== id);
    saveSavedGames();
    renderSavedGamesList();
  }

  function renderSavedGamesList() {
    const section = document.getElementById("setup-saved-section");
    const wrap = document.getElementById("setup-saved-list");
    section.hidden = savedGames.length === 0;
    wrap.innerHTML = "";
    if (savedGames.length === 0) return;
    savedGames.forEach((g) => {
      const card = document.createElement("div");
      card.className = "saved-game-card";
      const title = (g.meta && (g.meta.teams || g.meta.competition)) || "Untitled game";
      const metaParts = g.meta ? [g.meta.competition, g.meta.round, g.meta.date].filter(Boolean) : [];
      const savedAt = new Date(g.savedAt).toLocaleString();

      const playersHtml = g.players
        .map(
          (p) =>
            `<div class="saved-game-player"><span>${escapeHtml(p.name)}</span><span class="score">${p.score}</span></div>`
        )
        .join("");

      card.innerHTML = `
        <div class="saved-game-title">${escapeHtml(title)}</div>
        ${metaParts.length ? `<div class="saved-game-meta">${escapeHtml(metaParts.join(" • "))}</div>` : ""}
        <div class="saved-game-timestamp">Saved ${escapeHtml(savedAt)}</div>
        <div class="saved-game-players">${playersHtml}</div>
      `;

      const del = document.createElement("button");
      del.className = "saved-game-delete";
      del.textContent = "✕";
      del.setAttribute("aria-label", "Delete saved game");
      del.addEventListener("click", () => {
        if (!confirm(`Delete the saved record for "${title}"? This can't be undone.`)) return;
        deleteSavedGame(g.id);
      });
      card.appendChild(del);

      wrap.appendChild(card);
    });
  }

  resetBtn.addEventListener("click", () => {
    if (!confirm("Reset your recorded stats for this game? Player names are kept. This only affects your own players, not anyone else sharing this game.")) return;
    for (const p of currentPlayers()) p.stats = emptyStats();
    state.history = [];
    saveState();
    renderSummary();
    renderRecord();
    showToast("Your stats have been reset");
  });

  // ---------- Toast ----------
  let toastTimer = null;
  function showToast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.hidden = false;
    el.style.animation = "none";
    void el.offsetWidth;
    el.style.animation = "";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), 1400);
  }

  // ---------- Init ----------
  updateGameCodeBtn();
  renderSetupTab();
  renderPlayerInputs();
  renderRecord();
  renderSummary();
  subscribeToGame();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("service-worker.js").catch(() => {});
    });
  }
})();
