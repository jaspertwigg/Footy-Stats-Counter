// Claude Quest — game logic (vanilla JS, no build step required)
(function () {
  'use strict';

  const STORAGE_KEY = 'claudeQuestState_v2';
  const MEMORY_PAIR_COUNT = 6;
  const BOLT_PICK_DELAY_MS = 650;

  const LEVEL_TITLES = [
    { min: 1, title: 'Prompt Novice' },
    { min: 2, title: 'Prompt Apprentice' },
    { min: 3, title: 'Context Cadet' },
    { min: 4, title: 'Tool Tinkerer' },
    { min: 5, title: 'Workflow Wrangler' },
    { min: 6, title: 'Agentic Adept' },
    { min: 7, title: 'Claude Code Journeyman' },
    { min: 8, title: 'Prompt Engineer' },
    { min: 9, title: 'Context Architect' },
    { min: 10, title: 'Agentic Strategist' },
    { min: 11, title: 'Claude Whisperer' },
    { min: 12, title: 'Grandmaster of Claude' },
  ];

  // ---------- state ----------

  function defaultState() {
    return {
      xp: 0,
      memoryCleared: {},      // categoryId -> { moves }
      raceWon: {},            // categoryId -> true (sticky, once ever beaten)
      memoryXpGiven: {},      // categoryId -> true
      raceXpGiven: {},        // categoryId -> true
      perfectRecallAchieved: false,
      photoFinishAchieved: false,
      raceWinStreak: 0,
      bestRaceWinStreak: 0,
      gamesCompleted: 0,
      badges: [],
      lastDailyDate: null,
      dailyStreak: 0,
      soundOn: true,
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      return Object.assign(defaultState(), JSON.parse(raw));
    } catch (e) {
      return defaultState();
    }
  }

  let state = loadState();

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  // ---------- leveling math ----------

  function totalXpForLevel(level) {
    return 50 * level * (level - 1);
  }

  function levelFromXp(xp) {
    let level = 1;
    while (totalXpForLevel(level + 1) <= xp) level++;
    return level;
  }

  function levelProgress(xp) {
    const level = levelFromXp(xp);
    const floor = totalXpForLevel(level);
    const ceil = totalXpForLevel(level + 1);
    return { level, into: xp - floor, needed: ceil - floor, title: titleForLevel(level) };
  }

  function titleForLevel(level) {
    let title = LEVEL_TITLES[0].title;
    for (const t of LEVEL_TITLES) if (level >= t.min) title = t.title;
    if (level > 12) title = `Claude Legend Lv.${level}`;
    return title;
  }

  // ---------- date / streak helpers ----------

  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function daysBetween(a, b) {
    return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
  }

  function dailyCategory() {
    const key = todayKey();
    let hash = 0;
    for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
    return CATEGORIES[hash % CATEGORIES.length];
  }

  function markDailyPlayed() {
    const today = todayKey();
    if (state.lastDailyDate === today) return;
    if (state.lastDailyDate) {
      const gap = daysBetween(state.lastDailyDate, today);
      state.dailyStreak = gap === 1 ? state.dailyStreak + 1 : 1;
    } else {
      state.dailyStreak = 1;
    }
    state.lastDailyDate = today;
  }

  // ---------- badges ----------

  function checkBadges() {
    const helpers = { level: levelFromXp };
    const unlocked = [];
    for (const badge of BADGES) {
      if (state.badges.includes(badge.id)) continue;
      if (badge.check(state, helpers)) {
        state.badges.push(badge.id);
        unlocked.push(badge);
      }
    }
    return unlocked;
  }

  // ---------- sound ----------

  let audioCtx = null;
  function beep(freq, duration, type) {
    if (!state.soundOn) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type || 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (e) { /* audio not available */ }
  }
  function soundGood() { beep(880, 0.15, 'sine'); setTimeout(() => beep(1175, 0.18, 'sine'), 90); }
  function soundBad() { beep(180, 0.28, 'sawtooth'); }
  function soundFlip() { beep(520, 0.08, 'triangle'); }
  function soundLevelUp() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.22, 'triangle'), i * 110)); }
  function soundBadge() { beep(660, 0.12, 'square'); setTimeout(() => beep(990, 0.2, 'square'), 100); }

  // ---------- confetti ----------

  function fireConfetti() {
    const canvas = document.getElementById('confetti-canvas');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.classList.add('active');
    const ctx = canvas.getContext('2d');
    const colors = ['#a855f7', '#3b82f6', '#22c55e', '#f59e0b', '#ec4899', '#facc15'];
    const pieces = Array.from({ length: 140 }, () => ({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * canvas.height * 0.3,
      w: 6 + Math.random() * 6,
      h: 8 + Math.random() * 10,
      color: colors[Math.floor(Math.random() * colors.length)],
      vy: 2 + Math.random() * 3,
      vx: -2 + Math.random() * 4,
      rot: Math.random() * Math.PI,
      vr: -0.2 + Math.random() * 0.4,
    }));
    let frame = 0;
    const maxFrames = 130;
    function tick() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pieces.forEach((p) => {
        p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.color; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
      });
      frame++;
      if (frame < maxFrames) requestAnimationFrame(tick);
      else { ctx.clearRect(0, 0, canvas.width, canvas.height); canvas.classList.remove('active'); }
    }
    tick();
  }

  function showToast(html, kind) {
    const container = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = `toast toast--${kind || 'info'}`;
    el.innerHTML = html;
    container.appendChild(el);
    requestAnimationFrame(() => el.classList.add('toast--show'));
    setTimeout(() => { el.classList.remove('toast--show'); setTimeout(() => el.remove(), 300); }, 3200);
  }

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  // ---------- rendering: header ----------

  function renderHeader() {
    const prog = levelProgress(state.xp);
    document.getElementById('level-badge').textContent = prog.level;
    document.getElementById('level-title').textContent = prog.title;
    document.getElementById('xp-fill').style.width = `${Math.min(100, (prog.into / prog.needed) * 100)}%`;
    document.getElementById('xp-label').textContent = `${prog.into} / ${prog.needed} XP`;
    document.getElementById('streak-count').textContent = state.dailyStreak;
    document.getElementById('total-xp').textContent = state.xp;

    const soundBtn = document.getElementById('sound-toggle');
    soundBtn.textContent = state.soundOn ? '🔊' : '🔇';
    soundBtn.setAttribute('aria-label', state.soundOn ? 'Mute sound' : 'Unmute sound');

    const dailyDone = state.lastDailyDate === todayKey();
    const dailyBtn = document.getElementById('daily-btn');
    dailyBtn.classList.toggle('daily-btn--done', dailyDone);
    dailyBtn.querySelector('.daily-btn__label').textContent = dailyDone ? 'Daily Done ✓' : 'Daily Race';
  }

  // ---------- rendering: skill map ----------

  function renderSkillMap() {
    const grid = document.getElementById('skill-grid');
    grid.innerHTML = '';
    CATEGORIES.forEach((cat) => {
      const memDone = state.memoryCleared[cat.id];
      const raceDone = state.raceWon[cat.id];
      const pct = (memDone ? 50 : 0) + (raceDone ? 50 : 0);
      const card = document.createElement('button');
      card.className = 'skill-card';
      card.style.setProperty('--cat-color', cat.color);
      card.innerHTML = `
        <div class="skill-card__icon">${cat.icon}</div>
        <div class="skill-card__name">${cat.name}</div>
        <div class="skill-card__desc">${cat.description}</div>
        <div class="skill-card__bar"><div class="skill-card__fill" style="width:${pct}%"></div></div>
        <div class="skill-card__status">
          <span>🧠 ${memDone ? `${memDone.moves} moves` : 'unplayed'}</span>
          <span>🏁 ${raceDone ? 'beat BOLT' : 'unplayed'}</span>
        </div>
      `;
      card.addEventListener('click', () => openArena(cat.id));
      grid.appendChild(card);
    });
  }

  function openArena(categoryId) {
    const cat = CATEGORIES.find((c) => c.id === categoryId);
    const memDone = state.memoryCleared[categoryId];
    const raceDone = state.raceWon[categoryId];
    document.querySelector('.modal__panel').style.setProperty('--cat-color', cat.color);
    document.getElementById('modal-body').innerHTML = `
      <div class="cat-header">
        <span class="cat-header__icon">${cat.icon}</span>
        <div><h2>${cat.name}</h2><p>${cat.description}</p></div>
      </div>
      <div class="arena-choices">
        <button class="arena-choice" id="choice-memory">
          <div class="arena-choice__icon">🧠</div>
          <div class="arena-choice__name">Memory Match</div>
          <div class="arena-choice__desc">Flip cards, match concepts to what they buy you.</div>
          <div class="arena-choice__status">${memDone ? `Cleared in ${memDone.moves} moves` : 'Not played yet'}</div>
        </button>
        <button class="arena-choice" id="choice-race">
          <div class="arena-choice__icon">🏁</div>
          <div class="arena-choice__name">Prompt Race</div>
          <div class="arena-choice__desc">Draft technique cards, race BOLT to the best prompt.</div>
          <div class="arena-choice__status">${raceDone ? 'You\'ve beaten BOLT' : 'Not raced yet'}</div>
        </button>
      </div>
    `;
    document.getElementById('choice-memory').addEventListener('click', () => openMemoryGame(categoryId, false));
    document.getElementById('choice-race').addEventListener('click', () => openRaceGame(categoryId, false));
    openModal();
  }

  // ================= MEMORY MATCH =================

  function openMemoryGame(categoryId, isDaily) {
    const cat = CATEGORIES.find((c) => c.id === categoryId);
    const pairs = MEMORY_DECKS[categoryId];
    document.querySelector('.modal__panel').style.setProperty('--cat-color', cat.color);

    let cards = [];
    pairs.forEach((p, i) => {
      cards.push({ pairId: i, text: p.term, matched: false });
      cards.push({ pairId: i, text: p.match, matched: false });
    });
    cards = shuffle(cards);

    const gameState = { cards, flipped: [], moves: 0, matchedPairs: 0, busy: false };

    function render() {
      const body = document.getElementById('modal-body');
      body.innerHTML = `
        ${isDaily ? '<div class="daily-tag">⭐ Daily Challenge</div>' : ''}
        <div class="game-head">
          <h2>${cat.icon} Memory Match</h2>
          <div class="game-stat">Moves: <span id="move-count">${gameState.moves}</span></div>
        </div>
        <p class="quest-scenario">Find each technique and its payoff. BOLT's best on this deck: ${BOLT.memoryBestMoves} moves.</p>
        <div class="memory-grid" id="memory-grid"></div>
      `;
      const grid = document.getElementById('memory-grid');
      gameState.cards.forEach((card, idx) => {
        const btn = document.createElement('button');
        const isOpen = card.matched || gameState.flipped.includes(idx);
        btn.className = `memory-card ${isOpen ? 'memory-card--open' : ''} ${card.matched ? 'memory-card--matched' : ''}`;
        btn.innerHTML = isOpen ? `<span>${card.text}</span>` : `<span class="memory-card__back">🧭</span>`;
        if (!isOpen && !gameState.busy) {
          btn.addEventListener('click', () => flipCard(idx));
        }
        grid.appendChild(btn);
      });
    }

    function flipCard(idx) {
      if (gameState.busy) return;
      if (gameState.flipped.includes(idx) || gameState.cards[idx].matched) return;
      soundFlip();
      gameState.flipped.push(idx);
      render();
      if (gameState.flipped.length === 2) {
        gameState.moves++;
        gameState.busy = true;
        const [a, b] = gameState.flipped;
        const isMatch = gameState.cards[a].pairId === gameState.cards[b].pairId;
        if (isMatch) {
          gameState.cards[a].matched = true;
          gameState.cards[b].matched = true;
          gameState.matchedPairs++;
          gameState.flipped = [];
          gameState.busy = false;
          soundGood();
          render();
          if (gameState.matchedPairs === MEMORY_PAIR_COUNT) {
            setTimeout(() => finishMemoryGame(categoryId, isDaily, gameState.moves), 400);
          }
        } else {
          setTimeout(() => {
            gameState.flipped = [];
            gameState.busy = false;
            render();
          }, 700);
        }
      }
    }

    render();
    openModal();
  }

  function finishMemoryGame(categoryId, isDaily, moves) {
    const cat = CATEGORIES.find((c) => c.id === categoryId);
    const beatBolt = moves <= BOLT.memoryBestMoves;
    const already = !!state.memoryCleared[categoryId];
    const priorBest = already ? state.memoryCleared[categoryId].moves : Infinity;
    state.memoryCleared[categoryId] = { moves: Math.min(moves, priorBest) };

    let xpEarned = 0;
    if (!state.memoryXpGiven[categoryId]) {
      xpEarned = 40 + (beatBolt ? 15 : 0);
      if (isDaily) xpEarned += Math.round(xpEarned * 0.5);
      state.memoryXpGiven[categoryId] = true;
      state.xp += xpEarned;
    }
    if (moves <= MEMORY_PAIR_COUNT) state.perfectRecallAchieved = true;
    state.gamesCompleted++;
    if (isDaily) markDailyPlayed();

    if (beatBolt) soundGood(); else soundBad();

    const body = document.getElementById('modal-body');
    body.innerHTML = `
      <div class="game-head"><h2>${cat.icon} Memory Match — Cleared!</h2></div>
      <div class="feedback ${beatBolt ? 'feedback--correct' : 'feedback--wrong'}">
        <div class="feedback__headline">${beatBolt ? '🎉 You beat BOLT!' : 'BOLT keeps this one'}</div>
        <p>You cleared it in <strong>${moves} moves</strong> — BOLT's best here is ${BOLT.memoryBestMoves}.</p>
        <p class="bolt-line">${pick(beatBolt ? BOLT.memoryWinPlayer : BOLT.memoryWinBolt)}</p>
        ${xpEarned ? `<div class="feedback__xp">+${xpEarned} XP</div>` : ''}
      </div>
      <div class="modal-actions">
        <button class="btn btn--secondary" id="replay-btn">Play Again</button>
        <button class="btn btn--primary" id="continue-btn">Continue</button>
      </div>
    `;
    document.getElementById('replay-btn').addEventListener('click', () => openMemoryGame(categoryId, false));
    document.getElementById('continue-btn').addEventListener('click', () => { closeModal(); handleGameComplete(); });

    saveState();
    renderHeader();
    renderSkillMap();
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // ================= PROMPT RACE =================

  const RACE_ROUNDS = 4;
  const RACE_BAR_MAX = 12;

  function openRaceGame(categoryId, isDaily) {
    const cat = CATEGORIES.find((c) => c.id === categoryId);
    const scenario = RACE_SCENARIOS[categoryId];
    document.querySelector('.modal__panel').style.setProperty('--cat-color', cat.color);

    const raceState = {
      pool: scenario.cards.map((c, i) => ({ ...c, id: i, used: false })),
      round: 0,
      playerScore: 0,
      rivalScore: 0,
      playerPicks: [],
      intro: pick(BOLT.raceIntro),
      lastReveal: null,
      resolving: false,
    };

    function render() {
      const body = document.getElementById('modal-body');
      const available = raceState.pool.filter((c) => !c.used);
      const playerPct = Math.min(100, (raceState.playerScore / RACE_BAR_MAX) * 100);
      const rivalPct = Math.min(100, (raceState.rivalScore / RACE_BAR_MAX) * 100);
      body.innerHTML = `
        ${isDaily ? '<div class="daily-tag">⭐ Daily Challenge</div>' : ''}
        <div class="game-head"><h2>${cat.icon} Prompt Race</h2><div class="game-stat">Round ${Math.min(raceState.round + 1, RACE_ROUNDS)} / ${RACE_ROUNDS}</div></div>
        <p class="quest-scenario">${scenario.scenario}</p>
        ${raceState.round === 0 && !raceState.lastReveal ? `<p class="bolt-line">${raceState.intro}</p>` : ''}

        <div class="race-track">
          <div class="race-lane">
            <div class="race-lane__label">🧭 You — ${raceState.playerScore} pts</div>
            <div class="race-lane__bar"><div class="race-lane__fill race-lane__fill--player" style="width:${playerPct}%"></div></div>
          </div>
          <div class="race-lane">
            <div class="race-lane__label">${BOLT.icon} BOLT — ${raceState.rivalScore} pts</div>
            <div class="race-lane__bar"><div class="race-lane__fill race-lane__fill--rival" style="width:${rivalPct}%"></div></div>
          </div>
        </div>

        ${raceState.lastReveal ? `<div class="round-reveal">${raceState.lastReveal}</div>` : ''}

        ${available.length > 0 ? `
          <p class="race-prompt-label">Pick your next move:</p>
          <div class="options" id="race-options"></div>
        ` : ''}
      `;
      if (available.length > 0) {
        const optionsEl = document.getElementById('race-options');
        available.forEach((card) => {
          const btn = document.createElement('button');
          btn.className = 'option-btn';
          btn.textContent = card.label;
          btn.disabled = raceState.resolving;
          btn.addEventListener('click', () => playerPicks(card.id));
          optionsEl.appendChild(btn);
        });
      }
    }

    function playerPicks(cardId) {
      if (raceState.resolving) return;
      raceState.resolving = true;
      const card = raceState.pool.find((c) => c.id === cardId);
      card.used = true;
      raceState.playerScore += card.points;
      raceState.playerPicks.push(card);
      raceState.lastReveal = `
        <div class="round-reveal__row"><strong>You:</strong> ${card.label} <span class="round-reveal__pts">+${card.points}</span></div>
        <div class="round-reveal__note">${card.note}</div>
      `;
      render();
      soundGood();

      setTimeout(() => {
        const remaining = raceState.pool.filter((c) => !c.used);
        if (remaining.length > 0) {
          const weights = remaining.map((c) => Math.pow(4 - c.points, 2) + 1);
          const total = weights.reduce((a, b) => a + b, 0);
          let r = Math.random() * total;
          let chosen = remaining[0];
          for (let i = 0; i < remaining.length; i++) {
            r -= weights[i];
            if (r <= 0) { chosen = remaining[i]; break; }
          }
          chosen.used = true;
          raceState.rivalScore += chosen.points;
          const line = pick(chosen.points >= 2 ? BOLT.racePickGood : BOLT.racePickBad);
          raceState.lastReveal += `
            <div class="round-reveal__row"><strong>BOLT:</strong> ${chosen.label} <span class="round-reveal__pts">+${chosen.points}</span></div>
            <div class="round-reveal__note bolt-line">${line}</div>
          `;
        }
        raceState.round++;
        raceState.resolving = false;
        render();
        if (raceState.pool.every((c) => c.used)) {
          setTimeout(() => finishRace(categoryId, isDaily, raceState), 500);
        }
      }, BOLT_PICK_DELAY_MS);
    }

    render();
    openModal();
  }

  function finishRace(categoryId, isDaily, raceState) {
    const cat = CATEGORIES.find((c) => c.id === categoryId);
    const won = raceState.playerScore > raceState.rivalScore;
    const draw = raceState.playerScore === raceState.rivalScore;
    const margin = raceState.playerScore - raceState.rivalScore;

    let xpEarned = 0;
    if (!state.raceXpGiven[categoryId]) {
      xpEarned = 50 + (won ? 25 : 0);
      if (isDaily) xpEarned += Math.round(xpEarned * 0.5);
      state.raceXpGiven[categoryId] = true;
      state.xp += xpEarned;
    }
    if (won) {
      state.raceWon[categoryId] = true;
      state.raceWinStreak++;
      state.bestRaceWinStreak = Math.max(state.bestRaceWinStreak, state.raceWinStreak);
      if (margin === 1) state.photoFinishAchieved = true;
    } else if (!draw) {
      state.raceWinStreak = 0;
    }
    state.gamesCompleted++;
    if (isDaily) markDailyPlayed();

    if (won) soundGood(); else soundBad();

    const resultLine = won ? pick(BOLT.raceWinPlayer) : draw ? pick(BOLT.raceDraw) : pick(BOLT.raceWinBolt);
    const headline = won ? '🏁 You win the race!' : draw ? '🤝 Dead heat' : 'BOLT crosses first';

    const recap = raceState.playerPicks.map((c) => c.label).join(' · ');

    const body = document.getElementById('modal-body');
    body.innerHTML = `
      <div class="game-head"><h2>${cat.icon} Prompt Race — Final</h2></div>
      <div class="feedback ${won ? 'feedback--correct' : 'feedback--wrong'}">
        <div class="feedback__headline">${headline}</div>
        <p>Final score: <strong>You ${raceState.playerScore} — BOLT ${raceState.rivalScore}</strong></p>
        <p class="bolt-line">${resultLine}</p>
        <div class="race-recap"><strong>Your assembled prompt used:</strong><br>${recap}</div>
        ${xpEarned ? `<div class="feedback__xp">+${xpEarned} XP</div>` : ''}
      </div>
      <div class="modal-actions">
        <button class="btn btn--secondary" id="replay-btn">Race Again</button>
        <button class="btn btn--primary" id="continue-btn">Continue</button>
      </div>
    `;
    document.getElementById('replay-btn').addEventListener('click', () => openRaceGame(categoryId, false));
    document.getElementById('continue-btn').addEventListener('click', () => { closeModal(); handleGameComplete(); });

    saveState();
    renderHeader();
    renderSkillMap();
  }

  // ---------- shared post-game effects ----------

  function handleGameComplete() {
    const newBadges = checkBadges();
    saveState();
    renderHeader();
    renderSkillMap();
    renderAchievements();
    renderStats();
    newBadges.forEach((badge, i) => {
      setTimeout(() => {
        soundBadge();
        fireConfetti();
        showToast(`<strong>${badge.icon} Badge unlocked:</strong> ${badge.name}`, 'badge');
      }, i * 600);
    });
  }

  let lastKnownLevel = levelFromXp(state.xp);
  function checkLevelUp() {
    const newLevel = levelFromXp(state.xp);
    if (newLevel > lastKnownLevel) {
      lastKnownLevel = newLevel;
      soundLevelUp();
      fireConfetti();
      showToast(`<strong>🎉 Level ${newLevel}!</strong> ${titleForLevel(newLevel)}`, 'levelup');
    }
  }

  // ---------- achievements tab ----------

  function renderAchievements() {
    const grid = document.getElementById('achievements-grid');
    grid.innerHTML = BADGES.map((b) => {
      const unlocked = state.badges.includes(b.id);
      return `
        <div class="badge-card ${unlocked ? 'badge-card--unlocked' : 'badge-card--locked'}">
          <div class="badge-card__icon">${unlocked ? b.icon : '🔒'}</div>
          <div class="badge-card__name">${b.name}</div>
          <div class="badge-card__desc">${b.description}</div>
        </div>
      `;
    }).join('');
  }

  // ---------- stats tab ----------

  function renderStats() {
    const memDone = Object.keys(state.memoryCleared).length;
    const raceDone = Object.keys(state.raceWon).length;
    const prog = levelProgress(state.xp);
    document.getElementById('stats-body').innerHTML = `
      <div class="stat-grid">
        <div class="stat-tile"><div class="stat-tile__value">${prog.level}</div><div class="stat-tile__label">Level</div></div>
        <div class="stat-tile"><div class="stat-tile__value">${state.xp}</div><div class="stat-tile__label">Total XP</div></div>
        <div class="stat-tile"><div class="stat-tile__value">${memDone} / ${CATEGORIES.length}</div><div class="stat-tile__label">Decks Cleared</div></div>
        <div class="stat-tile"><div class="stat-tile__value">${raceDone} / ${CATEGORIES.length}</div><div class="stat-tile__label">Races Won</div></div>
        <div class="stat-tile"><div class="stat-tile__value">${state.dailyStreak}</div><div class="stat-tile__label">Daily Streak</div></div>
        <div class="stat-tile"><div class="stat-tile__value">${state.badges.length} / ${BADGES.length}</div><div class="stat-tile__label">Badges</div></div>
      </div>
      <div class="stat-actions">
        <button class="btn btn--secondary" id="export-btn">Export Progress</button>
        <label class="btn btn--secondary file-btn">Import Progress<input type="file" id="import-input" accept="application/json" hidden></label>
        <button class="btn btn--danger" id="reset-btn">Reset All Progress</button>
      </div>
    `;
    document.getElementById('export-btn').addEventListener('click', exportProgress);
    document.getElementById('import-input').addEventListener('change', importProgress);
    document.getElementById('reset-btn').addEventListener('click', () => {
      if (confirm('This will erase all XP, badges, and progress. Are you sure?')) {
        state = defaultState();
        lastKnownLevel = 1;
        saveState();
        renderAll();
      }
    });
  }

  function exportProgress() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'claude-quest-progress.json';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  function importProgress(evt) {
    const file = evt.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        state = Object.assign(defaultState(), parsed);
        lastKnownLevel = levelFromXp(state.xp);
        saveState();
        renderAll();
        showToast('Progress imported.', 'info');
      } catch (e) {
        alert('That file could not be read as valid progress data.');
      }
    };
    reader.readAsText(file);
  }

  // ---------- modal helpers ----------

  function openModal() { document.getElementById('modal').classList.add('modal--open'); }
  function closeModal() { document.getElementById('modal').classList.remove('modal--open'); }

  // ---------- tabs ----------

  function switchTab(tabId) {
    document.querySelectorAll('.tab-panel').forEach((el) => el.classList.toggle('tab-panel--active', el.id === `tab-${tabId}`));
    document.querySelectorAll('.tab-btn').forEach((el) => el.classList.toggle('tab-btn--active', el.dataset.tab === tabId));
  }

  // ---------- wiring ----------

  function renderAll() {
    renderHeader();
    renderSkillMap();
    renderAchievements();
    renderStats();
  }

  function init() {
    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.getElementById('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
    document.querySelectorAll('.tab-btn').forEach((btn) => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
    document.getElementById('sound-toggle').addEventListener('click', () => {
      state.soundOn = !state.soundOn;
      saveState();
      renderHeader();
    });
    document.getElementById('daily-btn').addEventListener('click', () => {
      if (state.lastDailyDate === todayKey()) {
        showToast('Already raced today — come back tomorrow!', 'info');
        return;
      }
      openRaceGame(dailyCategory().id, true);
    });

    document.addEventListener('click', (e) => {
      if (e.target && e.target.id === 'continue-btn') checkLevelUp();
    }, true);

    renderAll();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
