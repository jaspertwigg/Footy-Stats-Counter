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
        if (parsed && Array.isArray(parsed.players) && parsed.players.length === MAX_PLAYERS) {
          for (const p of parsed.players) {
            p.stats = Object.assign(emptyStats(), p.stats || {});
          }
          if (!Array.isArray(parsed.history)) parsed.history = [];
          return parsed;
        }
      }
    } catch (e) {
      /* corrupt storage, fall through to fresh state */
    }
    return {
      players: Array.from({ length: MAX_PLAYERS }, () => ({ name: "", stats: emptyStats() })),
      activePlayer: 0,
      history: [],
    };
  }

  const state = loadState();

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function scoreFor(stats) {
    let total = 0;
    for (const def of STAT_DEFS) {
      total += (stats[def.key] || 0) * def.points;
    }
    return total;
  }

  function activePlayers() {
    return state.players.filter((p) => p.name.trim().length > 0);
  }

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

  function renderPlayerInputs() {
    playerInputsEl.innerHTML = "";
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

      row.appendChild(num);
      row.appendChild(input);
      playerInputsEl.appendChild(row);
    });
  }

  // ---------- Record tab ----------
  const recordEmptyEl = document.getElementById("record-empty");
  const recordContentEl = document.getElementById("record-content");
  const playerSelectorEl = document.getElementById("player-selector");
  const activeScoreEl = document.getElementById("active-score");
  const statGridEl = document.getElementById("stat-grid");
  const undoBtn = document.getElementById("undo-btn");

  function ensureActivePlayerValid() {
    const players = state.players;
    if (!players[state.activePlayer] || players[state.activePlayer].name.trim() === "") {
      const firstNamed = players.findIndex((p) => p.name.trim() !== "");
      state.activePlayer = firstNamed === -1 ? 0 : firstNamed;
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

    const active = state.players[state.activePlayer];
    activeScoreEl.textContent = scoreFor(active.stats);

    renderStatGrid(active.stats);
    undoBtn.disabled = state.history.length === 0;
  }

  function renderStatGrid(stats) {
    statGridEl.innerHTML = "";
    for (const def of STAT_DEFS) {
      const btn = document.createElement("button");
      btn.className = "stat-btn";
      btn.dataset.key = def.key;

      const count = document.createElement("span");
      count.className = "stat-count";
      count.textContent = stats[def.key] || 0;

      const label = document.createElement("span");
      label.className = "stat-label";
      label.textContent = def.label;

      const pts = document.createElement("span");
      pts.className = "stat-points";
      pts.textContent = def.addsToMarks
        ? "+1 mark"
        : def.points >= 0
        ? `+${def.points} pt${def.points === 1 ? "" : "s"}`
        : `${def.points} pts`;

      const minus = document.createElement("button");
      minus.className = "stat-minus";
      minus.textContent = "−";
      minus.addEventListener("click", (e) => {
        e.stopPropagation();
        decrementStat(def.key);
      });

      btn.appendChild(minus);
      btn.appendChild(count);
      btn.appendChild(label);
      btn.appendChild(pts);

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
    saveState();

    if (btnEl) {
      btnEl.classList.add("flash");
      setTimeout(() => btnEl.classList.remove("flash"), 140);
    }
    renderRecord();
  }

  function decrementStat(key) {
    const player = state.players[state.activePlayer];
    if ((player.stats[key] || 0) <= 0) return;
    const def = STAT_DEFS.find((d) => d.key === key);
    player.stats[key] -= 1;
    if (def.addsToMarks && player.stats.marks > 0) {
      player.stats.marks -= 1;
    }
    saveState();
    renderRecord();
  }

  undoBtn.addEventListener("click", () => {
    const last = state.history.pop();
    if (!last) return;
    const player = state.players[last.playerIdx];
    if (player.stats[last.key] > 0) player.stats[last.key] -= 1;
    if (last.addsToMarks && player.stats.marks > 0) player.stats.marks -= 1;
    state.activePlayer = last.playerIdx;
    saveState();
    renderRecord();
    showToast("Last stat undone");
  });

  // ---------- Summary tab ----------
  const summaryEmptyEl = document.getElementById("summary-empty");
  const summaryContentEl = document.getElementById("summary-content");
  const summaryCardsEl = document.getElementById("summary-cards");
  const summaryTableEl = document.getElementById("summary-table");
  const resetBtn = document.getElementById("reset-btn");

  function renderSummary() {
    const named = state.players.filter((p) => p.name.trim() !== "");
    if (named.length === 0) {
      summaryEmptyEl.hidden = false;
      summaryContentEl.style.display = "none";
      return;
    }
    summaryEmptyEl.hidden = true;
    summaryContentEl.style.display = "block";

    const ranked = named
      .map((p) => ({ name: p.name.trim(), stats: p.stats, score: scoreFor(p.stats) }))
      .sort((a, b) => b.score - a.score);

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

    const thead = summaryTableEl.querySelector("thead");
    const tbody = summaryTableEl.querySelector("tbody");
    thead.innerHTML = `<tr><th>Player</th>${STAT_DEFS.map((d) => `<th>${abbrev(d)}</th>`).join("")}<th>Score</th></tr>`;
    tbody.innerHTML = ranked
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
    if (!confirm("Reset all recorded stats for this game? Player names are kept.")) return;
    for (const p of state.players) p.stats = emptyStats();
    state.history = [];
    saveState();
    renderSummary();
    renderRecord();
    showToast("Game stats reset");
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
  renderPlayerInputs();
  renderRecord();
  renderSummary();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("service-worker.js").catch(() => {});
    });
  }
})();
