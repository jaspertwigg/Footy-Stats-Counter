// Claude Quest — app logic (vanilla JS, no build step required)
(function () {
  'use strict';

  const STORAGE_KEY = 'claudeQuestState_v1';
  const QUESTION_TIME_LIMIT = 20; // seconds, multiple-choice only
  const REWRITE_PASS_RATIO = 0.34; // fraction of hints needed to "match" a keyword-scored rewrite

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
      completed: {},        // questId -> { xpEarned, score (0-100), attempts }
      bestCorrectStreak: 0,
      correctStreak: 0,
      badges: [],
      lastDailyDate: null,  // YYYY-MM-DD of last completed daily challenge
      dailyStreak: 0,
      soundOn: true,
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      return Object.assign(defaultState(), parsed);
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
    return {
      level,
      into: xp - floor,
      needed: ceil - floor,
      title: titleForLevel(level),
    };
  }

  function titleForLevel(level) {
    let title = LEVEL_TITLES[0].title;
    for (const t of LEVEL_TITLES) {
      if (level >= t.min) title = t.title;
    }
    if (level > 12) title = `Claude Legend Lv.${level}`;
    return title;
  }

  // ---------- date / streak helpers ----------

  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function daysBetween(a, b) {
    const da = new Date(a + 'T00:00:00');
    const db = new Date(b + 'T00:00:00');
    return Math.round((db - da) / 86400000);
  }

  function dailyChallengeQuest() {
    const mcQuests = QUESTS.filter((q) => q.type === 'mc');
    const key = todayKey();
    let hash = 0;
    for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
    return mcQuests[hash % mcQuests.length];
  }

  // ---------- badge helpers ----------

  function categoryComplete(categoryId) {
    const quests = QUESTS_BY_CATEGORY[categoryId] || [];
    return quests.length > 0 && quests.every((q) => state.completed[q.id]);
  }

  function checkBadges() {
    const helpers = { categoryComplete, level: levelFromXp };
    const newlyUnlocked = [];
    for (const badge of BADGES) {
      if (state.badges.includes(badge.id)) continue;
      if (badge.check(state, helpers)) {
        state.badges.push(badge.id);
        newlyUnlocked.push(badge);
      }
    }
    return newlyUnlocked;
  }

  // ---------- sound (tiny synthesized beeps, no assets needed) ----------

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
    } catch (e) { /* audio not available, ignore */ }
  }
  function soundCorrect() { beep(880, 0.15, 'sine'); setTimeout(() => beep(1175, 0.18, 'sine'), 90); }
  function soundWrong() { beep(180, 0.28, 'sawtooth'); }
  function soundLevelUp() {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.22, 'triangle'), i * 110));
  }
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
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });
      frame++;
      if (frame < maxFrames) {
        requestAnimationFrame(tick);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        canvas.classList.remove('active');
      }
    }
    tick();
  }

  // ---------- toast notifications ----------

  function showToast(html, kind) {
    const container = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = `toast toast--${kind || 'info'}`;
    el.innerHTML = html;
    container.appendChild(el);
    requestAnimationFrame(() => el.classList.add('toast--show'));
    setTimeout(() => {
      el.classList.remove('toast--show');
      setTimeout(() => el.remove(), 300);
    }, 3200);
  }

  // ---------- rewrite scoring ----------

  function scoreRewrite(text, hints) {
    const lower = text.toLowerCase();
    const matched = hints.filter((h) => {
      const words = h.toLowerCase().split(/\s+or\s+|\s*,\s*|\s+/).filter((w) => w.length > 3);
      return words.some((w) => lower.includes(w)) || lower.includes(h.toLowerCase());
    });
    const ratio = hints.length ? matched.length / hints.length : 0;
    return { matched, ratio, score: Math.round(ratio * 100) };
  }

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
    dailyBtn.querySelector('.daily-btn__label').textContent = dailyDone ? 'Daily Done ✓' : 'Daily Challenge';
  }

  // ---------- rendering: skill map ----------

  function renderSkillMap() {
    const grid = document.getElementById('skill-grid');
    grid.innerHTML = '';
    CATEGORIES.forEach((cat) => {
      const quests = QUESTS_BY_CATEGORY[cat.id];
      const done = quests.filter((q) => state.completed[q.id]).length;
      const pct = Math.round((done / quests.length) * 100);
      const card = document.createElement('button');
      card.className = 'skill-card';
      card.style.setProperty('--cat-color', cat.color);
      card.innerHTML = `
        <div class="skill-card__icon">${cat.icon}</div>
        <div class="skill-card__name">${cat.name}</div>
        <div class="skill-card__desc">${cat.description}</div>
        <div class="skill-card__bar"><div class="skill-card__fill" style="width:${pct}%"></div></div>
        <div class="skill-card__count">${done} / ${quests.length} mastered</div>
      `;
      card.addEventListener('click', () => openCategory(cat.id));
      grid.appendChild(card);
    });
  }

  function openCategory(categoryId) {
    const cat = CATEGORIES.find((c) => c.id === categoryId);
    const quests = QUESTS_BY_CATEGORY[categoryId];
    const modal = document.getElementById('modal');
    modal.querySelector('.modal__panel').style.setProperty('--cat-color', cat.color);
    document.getElementById('modal-body').innerHTML = `
      <div class="cat-header">
        <span class="cat-header__icon">${cat.icon}</span>
        <div>
          <h2>${cat.name}</h2>
          <p>${cat.description}</p>
        </div>
      </div>
      <div class="quest-list">
        ${quests.map((q) => {
          const done = state.completed[q.id];
          const label = q.type === 'mc' ? q.question : q.task;
          return `
            <button class="quest-row ${done ? 'quest-row--done' : ''}" data-quest-id="${q.id}">
              <span class="quest-row__status">${done ? '✅' : '▫️'}</span>
              <span class="quest-row__label">${label}</span>
              <span class="quest-row__xp">${done ? `+${done.xpEarned} XP` : `${q.xp} XP`}</span>
            </button>
          `;
        }).join('')}
      </div>
    `;
    document.getElementById('modal-body').querySelectorAll('.quest-row').forEach((row) => {
      row.addEventListener('click', () => openQuest(row.dataset.questId, false));
    });
    openModal();
  }

  // ---------- quest play flow ----------

  let activeTimer = null;

  function openQuest(questId, isDaily) {
    const quest = QUESTS_BY_ID[questId];
    if (quest.type === 'mc') renderMcQuest(quest, isDaily);
    else renderRewriteQuest(quest, isDaily);
    openModal();
  }

  function renderMcQuest(quest, isDaily) {
    clearActiveTimer();
    const cat = CATEGORIES.find((c) => c.id === quest.category);
    const body = document.getElementById('modal-body');
    modalSetColor(cat.color);
    body.innerHTML = `
      ${isDaily ? '<div class="daily-tag">⭐ Daily Challenge — bonus XP</div>' : ''}
      <div class="timer-bar"><div class="timer-bar__fill" id="timer-fill"></div></div>
      <p class="quest-scenario">${quest.scenario}</p>
      <h3 class="quest-question">${quest.question}</h3>
      <div class="options" id="options"></div>
      <div class="feedback" id="feedback" hidden></div>
      <div class="modal-actions" id="modal-actions" hidden>
        <button class="btn btn--primary" id="continue-btn">Continue</button>
      </div>
    `;
    const optionsEl = document.getElementById('options');
    quest.options.forEach((opt, i) => {
      const btn = document.createElement('button');
      btn.className = 'option-btn';
      btn.textContent = opt;
      btn.addEventListener('click', () => lockAnswer(quest, i, isDaily));
      optionsEl.appendChild(btn);
    });

    let remaining = QUESTION_TIME_LIMIT;
    const fill = document.getElementById('timer-fill');
    fill.style.transition = `width ${QUESTION_TIME_LIMIT}s linear`;
    requestAnimationFrame(() => { fill.style.width = '0%'; });
    activeTimer = setTimeout(() => {
      if (!optionsEl.dataset.locked) lockAnswer(quest, -1, isDaily);
    }, QUESTION_TIME_LIMIT * 1000);
  }

  function clearActiveTimer() {
    if (activeTimer) { clearTimeout(activeTimer); activeTimer = null; }
  }

  function lockAnswer(quest, chosenIndex, isDaily) {
    clearActiveTimer();
    const optionsEl = document.getElementById('options');
    if (optionsEl.dataset.locked) return;
    optionsEl.dataset.locked = 'true';
    const fill = document.getElementById('timer-fill');
    const timeUsedFraction = fill ? 1 - (parseFloat(getComputedStyle(fill).width) / fill.parentElement.clientWidth) : 1;

    const correct = chosenIndex === quest.correct;
    const buttons = optionsEl.querySelectorAll('.option-btn');
    buttons.forEach((btn, i) => {
      btn.disabled = true;
      if (i === quest.correct) btn.classList.add('option-btn--correct');
      else if (i === chosenIndex) btn.classList.add('option-btn--wrong');
    });

    const already = !!state.completed[quest.id];
    let xpEarned = 0;
    if (correct) {
      state.correctStreak++;
      state.bestCorrectStreak = Math.max(state.bestCorrectStreak, state.correctStreak);
      if (!already) {
        const speedBonus = Math.round(20 * Math.max(0, 1 - timeUsedFraction));
        xpEarned = quest.xp + speedBonus;
        const dailyBonus = isDaily ? Math.round(xpEarned * 0.5) : 0;
        xpEarned += dailyBonus;
        state.completed[quest.id] = { xpEarned, score: 100, attempts: 1 };
        state.xp += xpEarned;
      }
      soundCorrect();
    } else {
      state.correctStreak = 0;
      soundWrong();
    }

    if (isDaily) markDailyPlayed();

    saveState();
    renderHeader();
    renderSkillMap();

    const feedback = document.getElementById('feedback');
    feedback.hidden = false;
    feedback.className = `feedback ${correct ? 'feedback--correct' : 'feedback--wrong'}`;
    feedback.innerHTML = `
      <div class="feedback__headline">${chosenIndex === -1 ? '⏱️ Time\'s up!' : correct ? '✅ Correct!' : '❌ Not quite.'}</div>
      <p>${quest.explanation}</p>
      ${xpEarned ? `<div class="feedback__xp">+${xpEarned} XP</div>` : ''}
    `;
    document.getElementById('modal-actions').hidden = false;
    document.getElementById('continue-btn').addEventListener('click', () => {
      closeModal();
      handlePostAnswerEffects();
    });
  }

  function renderRewriteQuest(quest, isDaily) {
    const cat = CATEGORIES.find((c) => c.id === quest.category);
    const body = document.getElementById('modal-body');
    modalSetColor(cat.color);
    body.innerHTML = `
      <p class="quest-scenario">${quest.task}</p>
      <div class="starter-prompt">"${quest.starterPrompt}"</div>
      <textarea id="rewrite-input" class="rewrite-input" rows="4" placeholder="Type your improved version here..."></textarea>
      <div class="modal-actions">
        <button class="btn btn--primary" id="submit-rewrite">Submit</button>
      </div>
      <div class="feedback" id="feedback" hidden></div>
      <div class="modal-actions" id="modal-actions" hidden>
        <button class="btn btn--secondary" id="retry-btn">Try Again for Practice</button>
        <button class="btn btn--primary" id="continue-btn">Continue</button>
      </div>
    `;
    document.getElementById('submit-rewrite').addEventListener('click', () => {
      const text = document.getElementById('rewrite-input').value.trim();
      if (!text) return;
      submitRewrite(quest, text);
    });
  }

  function submitRewrite(quest, text) {
    const { matched, ratio, score } = scoreRewrite(text, quest.hints);
    const already = !!state.completed[quest.id];
    let xpEarned = 0;
    if (!already) {
      xpEarned = Math.max(8, Math.round(quest.xp * Math.max(ratio, 0.15)));
      state.completed[quest.id] = { xpEarned, score, attempts: 1 };
      state.xp += xpEarned;
    } else {
      state.completed[quest.id].attempts++;
    }
    if (ratio >= REWRITE_PASS_RATIO) { soundCorrect(); state.correctStreak++; state.bestCorrectStreak = Math.max(state.bestCorrectStreak, state.correctStreak); }
    else { soundWrong(); state.correctStreak = 0; }

    saveState();
    renderHeader();
    renderSkillMap();

    document.getElementById('submit-rewrite').disabled = true;
    document.getElementById('rewrite-input').disabled = true;

    const hintList = quest.hints.map((h) => {
      const hit = matched.includes(h);
      return `<li class="${hit ? 'hint--hit' : 'hint--miss'}">${hit ? '✓' : '○'} ${h}</li>`;
    }).join('');

    const feedback = document.getElementById('feedback');
    feedback.hidden = false;
    feedback.className = `feedback ${score >= 60 ? 'feedback--correct' : 'feedback--wrong'}`;
    feedback.innerHTML = `
      <div class="feedback__headline">Coverage score: ${score}%</div>
      <ul class="hint-list">${hintList}</ul>
      <p>${quest.explanation}</p>
      <details class="sample-answer">
        <summary>See a strong example rewrite</summary>
        <pre>${quest.sampleAnswer}</pre>
      </details>
      ${xpEarned ? `<div class="feedback__xp">+${xpEarned} XP</div>` : '<div class="feedback__xp">Practice round — no extra XP</div>'}
    `;
    document.getElementById('modal-actions').hidden = false;
    document.getElementById('retry-btn').addEventListener('click', () => renderRewriteQuest(quest, false));
    document.getElementById('continue-btn').addEventListener('click', () => {
      closeModal();
      handlePostAnswerEffects();
    });
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

  function handlePostAnswerEffects() {
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

  // ---------- level-up detection ----------

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
    const totalQuests = QUESTS.length;
    const done = Object.keys(state.completed).length;
    const prog = levelProgress(state.xp);
    document.getElementById('stats-body').innerHTML = `
      <div class="stat-grid">
        <div class="stat-tile"><div class="stat-tile__value">${prog.level}</div><div class="stat-tile__label">Level</div></div>
        <div class="stat-tile"><div class="stat-tile__value">${state.xp}</div><div class="stat-tile__label">Total XP</div></div>
        <div class="stat-tile"><div class="stat-tile__value">${done} / ${totalQuests}</div><div class="stat-tile__label">Quests Mastered</div></div>
        <div class="stat-tile"><div class="stat-tile__value">${state.dailyStreak}</div><div class="stat-tile__label">Daily Streak</div></div>
        <div class="stat-tile"><div class="stat-tile__value">${state.bestCorrectStreak}</div><div class="stat-tile__label">Best Correct Streak</div></div>
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
      if (confirm('This will erase all XP, badges, and completed quests. Are you sure?')) {
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
    a.href = url;
    a.download = 'claude-quest-progress.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
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

  function modalSetColor(color) {
    document.querySelector('.modal__panel').style.setProperty('--cat-color', color);
  }

  function openModal() {
    document.getElementById('modal').classList.add('modal--open');
  }

  function closeModal() {
    clearActiveTimer();
    document.getElementById('modal').classList.remove('modal--open');
  }

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
    document.getElementById('modal').addEventListener('click', (e) => {
      if (e.target.id === 'modal') closeModal();
    });
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
    document.getElementById('sound-toggle').addEventListener('click', () => {
      state.soundOn = !state.soundOn;
      saveState();
      renderHeader();
    });
    document.getElementById('daily-btn').addEventListener('click', () => {
      if (state.lastDailyDate === todayKey()) {
        showToast('Already completed today\'s challenge — come back tomorrow!', 'info');
        return;
      }
      openQuest(dailyChallengeQuest().id, true);
    });

    // XP changes are applied synchronously in lockAnswer/submitRewrite; check for a
    // level-up once the player dismisses the feedback panel via "Continue".
    document.addEventListener('click', (e) => {
      if (e.target && e.target.id === 'continue-btn') checkLevelUp();
    }, true);

    renderAll();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
