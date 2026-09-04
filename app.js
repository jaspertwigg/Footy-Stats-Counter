(() => {
  "use strict";

  const STORAGE_KEY = "footy-stats-counter-v1";
  const MAX_PLAYERS = 5;

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

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.players)) {
          const players = parsed.players.slice(0, MAX_PLAYERS).map((p) => ({
            name: typeof p.name === "string" ? p.name : "",
            stats: Object.assign(emptyStats(), (p && p.stats) || {}),
          }));
          return { players, activePlayer: null, history: [] };
        }
      }
    } catch (e) {
      /* corrupt storage, fall through to fresh state */
    }
    return { players: [], activePlayer: null, history: [] };
  }

  const state = loadState();

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
  const GAME_CODE_KEY = "footy-game-code";
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

  let gameCode = localStorage.getItem(GAME_CODE_KEY) || "";
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
      db.collection("games")
        .doc(gameCode)
        .collection("devices")
        .doc(DEVICE_ID)
        .set({
          players: state.players
            .filter((p) => p.name.trim() !== "")
            .map((p) => ({ name: p.name.trim(), stats: p.stats })),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        })
        .catch((e) => console.warn("Cloud sync push failed:", e));
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
  }

  const gameCodeBtn = document.getElementById("game-code-btn");

  function updateGameCodeBtn() {
    gameCodeBtn.textContent = gameCode ? `Game: ${gameCode}` : "Solo mode";
  }

  gameCodeBtn.addEventListener("click", () => {
    if (!db) {
      alert(
        'Cloud sync isn\'t set up yet. See the "Set up live sharing" section of README.md to connect a free Firebase project.'
      );
      return;
    }

    const hadCode = !!gameCode;
    const oldCode = gameCode;
    const message = hadCode
      ? `Currently in game "${gameCode}". Enter a different code to switch, clear the text to go solo, or Cancel to stay as you are.`
      : "Enter a game code to join your team's shared game, or leave this blank to create a new one.";
    const input = prompt(message, gameCode);
    if (input === null) return; // cancelled, no change

    const code = sanitizeGameCode(input);
    if (!code) {
      if (hadCode) {
        gameCode = "";
        localStorage.removeItem(GAME_CODE_KEY);
      } else {
        gameCode = randomCode(5);
        localStorage.setItem(GAME_CODE_KEY, gameCode);
        alert(`Your new game code is ${gameCode}. Share it with your team so they can join the same live scoreboard.`);
      }
    } else {
      gameCode = code;
      localStorage.setItem(GAME_CODE_KEY, gameCode);
    }

    if (hadCode && oldCode !== gameCode) {
      db.collection("games").doc(oldCode).collection("devices").doc(DEVICE_ID).delete().catch(() => {});
    }

    updateGameCodeBtn();
    pushToCloud();
    subscribeToGame();
  });

  // ---------- Tab switching ----------
  const views = {
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
    if (tab === "record") renderRecord();
    if (tab === "summary") renderSummary();
  }

  for (const btn of tabButtons) {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  }

  // ---------- Players tab ----------
  const playerInputsEl = document.getElementById("player-inputs");
  const addPlayerBtn = document.getElementById("add-player-btn");

  function renderPlayerInputs() {
    playerInputsEl.innerHTML = "";

    if (state.players.length === 0) {
      const empty = document.createElement("p");
      empty.className = "hint subtle";
      empty.textContent = "No players yet — tap Add Player to get started.";
      playerInputsEl.appendChild(empty);
    }

    state.players.forEach((p, idx) => {
      const row = document.createElement("div");
      row.className = "player-row";

      const num = document.createElement("div");
      num.className = "num";
      num.textContent = String(idx + 1);

      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = `Player ${idx + 1} name`;
      input.value = p.name;
      input.autocapitalize = "words";
      input.autocomplete = "off";
      input.enterKeyHint = "done";
      input.addEventListener("input", () => {
        state.players[idx].name = input.value;
        saveState();
      });

      const removeBtn = document.createElement("button");
      removeBtn.className = "player-remove";
      removeBtn.textContent = "✕";
      removeBtn.setAttribute("aria-label", "Remove player");
      removeBtn.addEventListener("click", () => {
        state.players.splice(idx, 1);
        state.activePlayer = null;
        state.history = [];
        saveState();
        renderPlayerInputs();
      });

      row.appendChild(num);
      row.appendChild(input);
      row.appendChild(removeBtn);
      playerInputsEl.appendChild(row);
    });

    const full = state.players.length >= MAX_PLAYERS;
    addPlayerBtn.disabled = full;
    addPlayerBtn.textContent = full ? "Maximum 5 players" : "+ Add Player";
  }

  addPlayerBtn.addEventListener("click", () => {
    if (state.players.length >= MAX_PLAYERS) return;
    state.players.push({ name: "", stats: emptyStats() });
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
    const p = state.players[state.activePlayer];
    if (!p || p.name.trim() === "") {
      state.activePlayer = null;
    }
  }

  function renderRecord() {
    const named = state.players
      .map((p, idx) => ({ ...p, idx }))
      .filter((p) => p.name.trim() !== "");

    if (named.length === 0) {
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

    const active = state.activePlayer === null ? null : state.players[state.activePlayer];

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
    const player = state.players[state.activePlayer];
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
    const player = state.players[state.activePlayer];
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
    const player = state.players[last.playerIdx];
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
    ...STAT_DEFS.map((d) => ({ key: d.key, label: abbrev(d) })),
    { key: "score", label: "Score" },
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

  function renderSummary() {
    const localNamed = state.players
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

    if (named.length === 0) {
      summaryEmptyEl.hidden = false;
      summaryContentEl.style.display = "none";
      return;
    }
    summaryEmptyEl.hidden = true;
    summaryContentEl.style.display = "block";

    if (!gameCode) {
      summarySyncStatusEl.textContent = "Solo mode — showing only your own players.";
    } else if (!db) {
      summarySyncStatusEl.textContent = `Game ${gameCode} — cloud sync unavailable right now.`;
    } else {
      const otherCount = Object.keys(remoteDevices).length;
      summarySyncStatusEl.textContent =
        otherCount > 0
          ? `Live in game ${gameCode} — syncing with ${otherCount} other device${otherCount === 1 ? "" : "s"}.`
          : `Live in game ${gameCode} — waiting for others to join.`;
    }

    const base = named.map((p) => ({ name: p.name, stats: p.stats, score: scoreFor(p.stats) }));

    // Score cards: always highest fantasy score first, recalculated fresh
    // every time this renders so the leaderboard order stays live.
    const ranked = sortRows(base, "score", "desc");
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
        (p) => `<tr><td>${escapeHtml(p.name)}</td>${STAT_DEFS.map(
          (d) => `<td>${p.stats[d.key] || 0}</td>`
        ).join("")}<td class="score-cell">${p.score}</td></tr>`
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

  resetBtn.addEventListener("click", () => {
    if (!confirm("Reset your recorded stats for this game? Player names are kept. This only affects your own players, not anyone else sharing this game.")) return;
    for (const p of state.players) p.stats = emptyStats();
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
