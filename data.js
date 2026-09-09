// Claude Quest — game content
//
// Two mini-games per category:
//  - MEMORY_DECKS[categoryId]: 6 {term, match} pairs for a flip-and-match game.
//  - RACE_SCENARIOS[categoryId]: a scenario + 8 technique cards (label, points, note)
//    for a turn-based race against the rival, BOLT.

const CATEGORIES = [
  {
    id: 'prompting',
    name: 'Prompting Fundamentals',
    icon: '🎯',
    color: '#a855f7',
    description: 'Say what you mean so Claude can act on it.',
  },
  {
    id: 'claude-code',
    name: 'Claude Code Mastery',
    icon: '🛠️',
    color: '#3b82f6',
    description: 'Get the most out of the CLI, plan mode, and project files.',
  },
  {
    id: 'agentic',
    name: 'Agentic Workflows',
    icon: '🤖',
    color: '#22c55e',
    description: 'Delegate real work and keep it on track.',
  },
  {
    id: 'context',
    name: 'Context & Memory',
    icon: '🧠',
    color: '#f59e0b',
    description: 'Feed the context window like it is scarce, because it is.',
  },
  {
    id: 'advanced',
    name: 'Advanced Techniques',
    icon: '⚡',
    color: '#ec4899',
    description: 'Reasoning, structured output, and self-review tricks.',
  },
];

const MEMORY_DECKS = {
  prompting: [
    { term: 'Give an example', match: 'Locks in the exact style or format you want' },
    { term: 'Name the function & inputs', match: 'Removes guesswork about what to build' },
    { term: 'State the audience', match: 'Shapes tone, vocabulary, and depth' },
    { term: 'Set a length or format', match: 'Stops rambling or wrong-shaped output' },
    { term: 'List edge cases', match: 'Catches bugs before they ship' },
    { term: "Say what 'better' means", match: 'Focuses the fix on what you actually want' },
  ],
  'claude-code': [
    { term: 'CLAUDE.md', match: 'Persistent project notes Claude reads every session' },
    { term: 'Plan Mode', match: 'Review the approach before any file changes' },
    { term: 'Subagent / Explore', match: 'Keeps bulky searches out of your main context' },
    { term: 'Hooks', match: 'Run a command automatically on an event, like linting' },
    { term: 'Slash command', match: 'A reusable prompt you can invoke by name' },
    { term: 'Permission prompt', match: 'Your checkpoint before a risky action runs' },
  ],
  agentic: [
    { term: 'Checkpoints', match: 'Small reviewable steps instead of one giant leap' },
    { term: 'Early course-correct', match: 'Cheaper than fixing a finished wrong turn' },
    { term: 'Specific feedback', match: 'Points at the exact line and the exact fix' },
    { term: 'Definition of done', match: 'Lets the agent check its own work' },
    { term: 'Self-verification', match: 'Running the tests before calling it finished' },
    { term: 'Clarifying question', match: 'Cheaper than guessing wrong and redoing it' },
  ],
  context: [
    { term: 'Fresh session', match: 'A clean context beats a clogged one' },
    { term: 'Line number reference', match: 'Skips the search-and-guess step' },
    { term: 'Trimmed logs', match: 'Keeps the one real error from getting buried' },
    { term: 'Durable preference', match: "Belongs in a file, not just last week's chat" },
    { term: 'Context window', match: 'A scarce resource, not an infinite scratchpad' },
    { term: 'Summarize & restart', match: 'Carries the important thread across sessions' },
  ],
  advanced: [
    { term: 'Think step by step', match: 'Catches flawed assumptions before the code does' },
    { term: 'Explicit schema', match: 'Makes JSON output parse reliably, every time' },
    { term: 'Self-review pass', match: 'Catches mistakes before you ever see them' },
    { term: 'Iterative feedback', match: 'Beats specifying everything perfectly upfront' },
    { term: 'Named edge cases', match: "Turns 'looks right' into 'checked and works'" },
    { term: 'Success criteria', match: 'Gives the agent something concrete to check against' },
  ],
};

// Each race: a scenario and 8 cards. Cards are drafted alternately (player first)
// until the pool is empty — 4 rounds each. Higher points = a better move.
const RACE_SCENARIOS = {
  prompting: {
    scenario: 'Get Claude to write a working parse_csv function on the first try.',
    cards: [
      { label: 'Name the function & its exact signature', points: 3, note: 'no guessing what to build' },
      { label: 'Give one example input → output', points: 3, note: 'locks the exact shape' },
      { label: 'List 2 edge cases (empty file, missing column)', points: 2, note: 'catches bugs early' },
      { label: 'Specify the return type', points: 2, note: 'removes ambiguity' },
      { label: "Ask for 'clean code'", points: 1, note: 'vague, but at least a direction' },
      { label: "Say 'make it good'", points: 0, note: 'means nothing to act on' },
      { label: "Add 'please' three times", points: 0, note: "politeness isn't a spec" },
      { label: 'Demand it in under 10 minutes', points: 0, note: 'adds pressure, not clarity' },
    ],
  },
  'claude-code': {
    scenario: 'Get a multi-file refactor done without breaking anything.',
    cards: [
      { label: 'Use Plan Mode first', points: 3, note: 'review the approach before touching files' },
      { label: 'Break it into module-by-module steps', points: 3, note: 'small, reviewable diffs' },
      { label: 'Point to CLAUDE.md for conventions', points: 2, note: "no need to re-explain the codebase" },
      { label: 'Delegate the search to a subagent', points: 2, note: 'keeps your main context clean' },
      { label: 'Add a lint hook', points: 1, note: "nice, but doesn't guide the refactor itself" },
      { label: "Just say 'refactor it all'", points: 0, note: 'no scope, no checkpoints' },
      { label: 'Turn off permission prompts', points: 0, note: 'removes your safety net' },
      { label: "Ask for it 'fast'", points: 0, note: "speed isn't a strategy" },
    ],
  },
  agentic: {
    scenario: 'Ship a feature end-to-end with an agent, and actually trust the result.',
    cards: [
      { label: 'Give a concrete definition of done', points: 3, note: 'the agent can check itself against it' },
      { label: 'Ask it to run the tests before calling it done', points: 3, note: 'verifies instead of assumes' },
      { label: 'Redirect the moment it drifts off-track', points: 2, note: 'cheap now, expensive later' },
      { label: 'Point at the exact wrong line and why', points: 2, note: 'actionable, not vague' },
      { label: 'Ask a clarifying question up front', points: 2, note: 'cheaper than a wrong guess' },
      { label: "Give feedback like 'try again'", points: 0, note: 'nothing to act on' },
      { label: 'Wait till the end to review anything', points: 0, note: 'mistakes compound the whole way' },
      { label: 'Hope it reads your mind', points: 0, note: "it can't" },
    ],
  },
  context: {
    scenario: 'Keep a long, complex session useful instead of degrading.',
    cards: [
      { label: 'Trim the log to the one real error', points: 3, note: 'signal over noise' },
      { label: 'Summarize state before a fresh session', points: 3, note: 'carries the thread forward' },
      { label: 'Point to the exact file and line', points: 2, note: 'skips the search-and-guess' },
      { label: 'Write durable preferences into a file', points: 2, note: 'survives past the chat' },
      { label: "Re-paste the whole codebase to 'refresh'", points: 1, note: 'wasteful, marginally works' },
      { label: 'Paste the whole 2,000-line log', points: 0, note: 'buries the actual problem' },
      { label: 'Assume it remembers last week', points: 0, note: "conversation memory isn't durable" },
      { label: 'Keep going forever in one session', points: 0, note: 'context is finite' },
    ],
  },
  advanced: {
    scenario: 'Get a hard problem right without a wall of back-and-forth.',
    cards: [
      { label: 'Ask it to think step by step first', points: 3, note: 'catches bad assumptions early' },
      { label: 'Give the exact schema + one example', points: 3, note: 'output parses reliably' },
      { label: 'Add a self-review pass against requirements', points: 2, note: 'catches mistakes before you do' },
      { label: 'Iterate: draft, feedback, refine', points: 2, note: 'beats specifying everything upfront' },
      { label: 'Name concrete edge cases to check', points: 2, note: "turns 'looks right' into 'checked'" },
      { label: 'Demand the final answer immediately', points: 0, note: 'skips the reasoning that helps' },
      { label: 'Ask twice and hope one works', points: 0, note: 'not a strategy' },
      { label: 'Request the shortest possible answer', points: 0, note: 'optimizes the wrong thing' },
    ],
  },
};

// BOLT is the rival: fast, overconfident, never reads the fine print.
const BOLT = {
  name: 'BOLT',
  icon: '🐇',
  memoryBestMoves: 9, // BOLT's benchmark on any 6-pair deck — beatable, not trivial
  raceIntro: [
    "BOLT strolls up, prompt already half-typed and definitely not proofread.",
    "BOLT: 'Description? I'll just wing it.'",
    'BOLT is already three words into a prompt with no punctuation.',
    "BOLT cracks their knuckles like this is going to be close. It won't be.",
  ],
  racePickGood: [
    'Even a reckless bot gets one right sometimes.',
    'BOLT stumbles into a decent pick.',
    'Beginner\'s luck for BOLT.',
  ],
  racePickBad: [
    'BOLT grabs the shiniest-looking card without reading it.',
    'BOLT panic-picks.',
    "Classic BOLT — didn't even glance at the options.",
    'BOLT picks based on vibes alone.',
  ],
  raceWinPlayer: [
    'BOLT stares at your prompt, visibly outclassed.',
    "BOLT mutters 'skill issue' and wanders off.",
    "BOLT's prompt returns three errors and a shrug emoji.",
  ],
  raceWinBolt: [
    'Somehow BOLT\'s chaos worked this time. Even BOLT looks surprised.',
    'BOLT wins by pure accident and will never learn why.',
  ],
  raceDraw: [
    'A dead heat! BOLT insists this counts as a win for BOLT.',
  ],
  memoryWinPlayer: [
    'You cleared it faster than BOLT ever has.',
    'BOLT is still flipping cards from three decks ago.',
  ],
  memoryWinBolt: [
    'So close — BOLT edges it out this time.',
    "BOLT somehow remembers this deck by heart (he definitely doesn't, usually).",
  ],
};

// Badge definitions. `check(state, helpers)` returns true when the badge should unlock.
const BADGES = [
  {
    id: 'first-steps', icon: '🎉', name: 'First Steps',
    description: 'Finish your first mini-game.',
    check: (s) => s.gamesCompleted >= 1,
  },
  {
    id: 'memory-master', icon: '🧠', name: 'Memory Master',
    description: 'Clear every memory deck.',
    check: (s) => CATEGORIES.every((c) => s.memoryCleared[c.id]),
  },
  {
    id: 'race-champion', icon: '🏁', name: 'Race Champion',
    description: 'Beat BOLT in every prompt race.',
    check: (s) => CATEGORIES.every((c) => s.raceWon[c.id]),
  },
  {
    id: 'perfect-recall', icon: '💎', name: 'Perfect Recall',
    description: 'Clear a memory deck in the minimum possible moves.',
    check: (s) => s.perfectRecallAchieved,
  },
  {
    id: 'photo-finish', icon: '📸', name: 'Photo Finish',
    description: 'Win a prompt race by exactly 1 point.',
    check: (s) => s.photoFinishAchieved,
  },
  {
    id: 'undefeated', icon: '🔥', name: 'Undefeated',
    description: 'Win 3 prompt races in a row.',
    check: (s) => s.bestRaceWinStreak >= 3,
  },
  {
    id: 'grandmaster', icon: '👑', name: 'Grandmaster of Claude',
    description: 'Clear every memory deck and win every race.',
    check: (s) => CATEGORIES.every((c) => s.memoryCleared[c.id]) && CATEGORIES.every((c) => s.raceWon[c.id]),
  },
  {
    id: 'week-streak', icon: '📅', name: 'Daily Devotee',
    description: 'Hit a 7-day daily challenge streak.',
    check: (s) => s.dailyStreak >= 7,
  },
  {
    id: 'level-5', icon: '🥉', name: 'Rising Star',
    description: 'Reach level 5.',
    check: (s, h) => h.level(s.xp) >= 5,
  },
  {
    id: 'level-10', icon: '🥇', name: 'Claude Legend',
    description: 'Reach level 10.',
    check: (s, h) => h.level(s.xp) >= 10,
  },
];
