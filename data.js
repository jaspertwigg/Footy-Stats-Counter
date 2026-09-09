// Claude Quest — quest content
// Each multiple-choice quest: { id, category, type:'mc', scenario, question, options[], correct, explanation, xp }
// Each rewrite quest: { id, category, type:'rewrite', task, starterPrompt, hints[], sampleAnswer, explanation, xp }

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

const QUESTS = [
  // ---------- PROMPTING FUNDAMENTALS ----------
  {
    id: 'p1', category: 'prompting', type: 'mc',
    scenario: 'You need a Python function from Claude.',
    question: 'Which request is most likely to get you working code on the first try?',
    options: [
      '"Write me a function to process data."',
      '"Write a Python function `dedupe_orders(orders)` that removes duplicate order dicts by `order_id`, keeping the last occurrence. Example input/output included."',
      '"Can you code something for deduplication? Make it good."',
      '"I need Python help with a list."',
    ],
    correct: 1,
    explanation: 'Naming the function, its signature, the exact rule ("keep the last occurrence"), and an example removes every ambiguity Claude would otherwise have to guess at.',
    xp: 50,
  },
  {
    id: 'p2', category: 'prompting', type: 'rewrite',
    task: 'Rewrite this vague request into a prompt that would actually get you a usable blog post.',
    starterPrompt: 'write me a blog post',
    hints: ['audience', 'topic', 'length or word count', 'tone', 'key points or structure'],
    sampleAnswer: 'Write a 600-word blog post for junior developers explaining why code review matters. Friendly, practical tone. Cover: (1) catching bugs early, (2) knowledge sharing, (3) one anti-pattern to avoid. End with a short call to action.',
    explanation: 'A good creative-writing prompt still needs constraints: who it\'s for, how long, what tone, and what it must cover. Without them Claude has to guess, and guesses regress to the mean.',
    xp: 60,
  },
  {
    id: 'p3', category: 'prompting', type: 'mc',
    scenario: 'You want Claude to write in a very specific style for a legal newsletter.',
    question: 'What is the most reliable way to get the exact tone and structure you want?',
    options: [
      'Repeat "make it professional" several times',
      'Give it 1-2 short examples of the exact style you want, plus what to keep and vary',
      'Ask it to "sound like a lawyer"',
      'Increase the word count requested',
    ],
    correct: 1,
    explanation: 'Few-shot examples are the single strongest lever for style-matching — far stronger than adjectives like "professional," which Claude has to interpret without a reference point.',
    xp: 50,
  },
  {
    id: 'p4', category: 'prompting', type: 'mc',
    scenario: 'You are building a pipeline that parses Claude\'s response programmatically.',
    question: 'How do you most reliably prevent Claude\'s output from breaking your parser?',
    options: [
      'Ask nicely for "clean output"',
      'Specify the exact output format (e.g. a JSON schema) and show one example of valid output',
      'Tell it not to add explanations, and hope',
      'Increase the temperature so it varies less',
    ],
    correct: 1,
    explanation: 'An explicit schema plus a concrete example is what actually constrains the output shape. Vague instructions like "clean output" leave room for preambles, markdown fences, or extra commentary.',
    xp: 50,
  },
  {
    id: 'p5', category: 'prompting', type: 'mc',
    scenario: 'A bug report you\'re about to hand to Claude just says "the login is broken, please fix."',
    question: 'What is missing that would most help Claude fix it correctly on the first attempt?',
    options: [
      'Nothing — Claude can figure it out',
      'Reproduction steps, the exact error/behavior seen, expected behavior, and relevant file paths or logs',
      'A request to "try your best"',
      'Telling it to be careful',
    ],
    correct: 1,
    explanation: 'Debugging prompts are only as good as the evidence in them. Repro steps, actual vs. expected behavior, and pointers into the codebase turn a guessing game into a diagnosis.',
    xp: 50,
  },
  {
    id: 'p6', category: 'prompting', type: 'rewrite',
    task: 'Rewrite this bug report so Claude can actually debug it instead of guessing.',
    starterPrompt: 'the login is broken, please fix',
    hints: ['steps to reproduce', 'error message', 'expected vs actual', 'environment or file location'],
    sampleAnswer: 'Login fails with "Invalid token" (see console screenshot) after entering correct credentials on the /login page. Expected: redirect to /dashboard. Started after the auth.js refactor in src/auth/. Repro: 1) go to /login 2) enter valid test user 3) click Sign in.',
    explanation: 'Concrete symptoms + expected behavior + a pointer to likely-relevant code turns "broken" into something Claude can actually investigate instead of guessing blindly.',
    xp: 60,
  },
  {
    id: 'p7', category: 'prompting', type: 'mc',
    scenario: 'You ask Claude to "make this code better" with no other context.',
    question: 'Why does this often produce unhelpful or overreaching changes?',
    options: [
      'Claude doesn\'t know what "better" means for you — faster, more readable, safer, fewer dependencies — so it guesses at goals and scope',
      'Claude always adds unnecessary comments',
      'The code was probably fine already',
      'Claude cannot read existing code',
    ],
    correct: 0,
    explanation: '"Better" is undefined without a goal. Naming the actual concern (performance, readability, test coverage, security) keeps the change focused on what you actually need.',
    xp: 40,
  },

  // ---------- CLAUDE CODE MASTERY ----------
  {
    id: 'c1', category: 'claude-code', type: 'mc',
    scenario: 'You keep re-explaining your project\'s build commands and code style every session.',
    question: 'What Claude Code feature is built exactly for this?',
    options: [
      'Plan mode',
      'A CLAUDE.md file in the project that Claude reads for persistent project context',
      'Slash commands',
      'Increasing the context window',
    ],
    correct: 1,
    explanation: 'CLAUDE.md is project memory: build/test commands, conventions, and gotchas that would otherwise need repeating every session.',
    xp: 50,
  },
  {
    id: 'c2', category: 'claude-code', type: 'mc',
    scenario: 'You\'re about to ask Claude Code to do a large, multi-file refactor.',
    question: 'What is the benefit of using Plan Mode first?',
    options: [
      'It makes responses shorter',
      'It lets Claude propose an approach for your review and approval before touching any files',
      'It disables all tools',
      'It skips writing tests',
    ],
    correct: 1,
    explanation: 'Plan mode front-loads the "is this the right approach?" conversation, which is far cheaper than reviewing a large diff you disagree with after the fact.',
    xp: 50,
  },
  {
    id: 'c3', category: 'claude-code', type: 'mc',
    scenario: 'A task requires searching a huge codebase for every usage of an old API before refactoring.',
    question: 'Why might delegating this search to a subagent (like an Explore agent) be a good idea?',
    options: [
      'It searches slower on purpose',
      'It keeps the bulky search results out of your main conversation\'s context window, returning just a summary',
      'It automatically rewrites the code',
      'Subagents cannot use tools',
    ],
    correct: 1,
    explanation: 'Subagents run their own search in an isolated context and hand back a distilled answer, protecting your main session\'s context budget for the actual work.',
    xp: 50,
  },
  {
    id: 'c4', category: 'claude-code', type: 'mc',
    scenario: 'You want a shell command to run automatically every time Claude edits a file, e.g. a linter.',
    question: 'What feature is designed for this?',
    options: [
      'Hooks',
      'CLAUDE.md',
      'Slash commands',
      'Subagents',
    ],
    correct: 0,
    explanation: 'Hooks let you wire shell commands to lifecycle events (like after a file edit), which is exactly the automatic-linter use case.',
    xp: 40,
  },
  {
    id: 'c5', category: 'claude-code', type: 'mc',
    scenario: 'You run the same multi-step review checklist on every PR.',
    question: 'What should you turn this into so you don\'t retype it each time?',
    options: [
      'A longer CLAUDE.md file',
      'A custom slash command that packages the reusable prompt/workflow',
      'A hook',
      'A subagent',
    ],
    correct: 1,
    explanation: 'Slash commands are for exactly this: a reusable, named prompt or workflow you can invoke instead of retyping instructions.',
    xp: 40,
  },
  {
    id: 'c6', category: 'claude-code', type: 'rewrite',
    task: 'Write a short CLAUDE.md snippet for a Node.js project so future sessions don\'t need to be told this every time.',
    starterPrompt: '(blank CLAUDE.md)',
    hints: ['build command', 'test command', 'code style or lint rule', 'directory structure or key folders'],
    sampleAnswer: '## Commands\n- Build: `npm run build`\n- Test: `npm test` (Vitest, run a single file with `npm test -- path/to/file`)\n- Lint: `npm run lint` — fix before committing\n\n## Structure\n- `src/api/` — route handlers\n- `src/lib/` — shared utilities\n\n## Style\n- Prefer named exports; no default exports\n- 2-space indentation, no semicolons',
    explanation: 'A good CLAUDE.md is short and operational: the exact commands to run, where things live, and any style rule that isn\'t obvious from the code itself.',
    xp: 60,
  },
  {
    id: 'c7', category: 'claude-code', type: 'mc',
    scenario: 'Claude is about to run `rm -rf` on a directory as part of a cleanup task.',
    question: 'What is the right instinct here?',
    options: [
      'Let it run — it\'s just a cleanup task',
      'Treat destructive, hard-to-reverse commands as needing explicit confirmation before running, regardless of how routine the task seems',
      'Disable permission prompts so it goes faster',
      'Only worry about this in production systems',
    ],
    correct: 1,
    explanation: 'Reversibility, not task framing, is what should gate autonomy. "Cleanup" is exactly the kind of routine framing that makes destructive actions feel safe when they aren\'t.',
    xp: 50,
  },

  // ---------- AGENTIC WORKFLOWS ----------
  {
    id: 'a1', category: 'agentic', type: 'mc',
    scenario: 'You want Claude to migrate an entire app to a new framework.',
    question: 'What\'s the better approach?',
    options: [
      'One giant prompt: "migrate the whole app," then check the result at the very end',
      'Break it into checkpoints (e.g. one module at a time), reviewing and confirming after each before moving on',
      'Ask for the whole migration in a single file to save time',
      'Avoid giving any structure so Claude has full creative freedom',
    ],
    correct: 1,
    explanation: 'Large agentic tasks benefit from checkpoints: smaller diffs are easier to verify, mistakes are caught early, and course-correction is cheap instead of catastrophic.',
    xp: 50,
  },
  {
    id: 'a2', category: 'agentic', type: 'mc',
    scenario: 'Midway through a task, you notice Claude\'s approach is heading in the wrong direction.',
    question: 'What should you do?',
    options: [
      'Wait until it finishes, then ask for a full rewrite',
      'Interrupt and redirect immediately — course-correcting early is far cheaper than after the fact',
      'Say nothing and hope it self-corrects',
      'Start being vaguer so it has more freedom to fix itself',
    ],
    correct: 1,
    explanation: 'Agentic work compounds: a wrong turn early gets built on. Catching and redirecting it immediately is much cheaper than unwinding a finished, wrong implementation.',
    xp: 50,
  },
  {
    id: 'a3', category: 'agentic', type: 'mc',
    scenario: 'Claude\'s output has a specific bug. You want it fixed correctly this time.',
    question: 'Which feedback works best?',
    options: [
      '"That\'s wrong, try again"',
      '"The `total` on line 42 double-counts refunded orders — it should exclude rows where `status == \'refunded\'`"',
      '"Not quite right"',
      '"Do better"',
    ],
    correct: 1,
    explanation: 'Specific feedback pointing at what\'s wrong, where, and why gives Claude something to act on. Vague disapproval just triggers another guess.',
    xp: 40,
  },
  {
    id: 'a4', category: 'agentic', type: 'rewrite',
    task: 'Turn this vague task assignment into a spec an agent could actually execute and self-check against.',
    starterPrompt: 'add search to the app',
    hints: ['what should be searchable', 'where the feature lives (files/pages)', 'definition of done', 'constraints (e.g. performance, tech to use)'],
    sampleAnswer: 'Add a search bar to the product listing page (src/pages/Products.tsx) that filters the existing in-memory product list by name and category as the user types, case-insensitive, debounced by 200ms. Done when: typing filters the visible grid, tests in Products.test.tsx pass, and no new dependencies are added.',
    explanation: 'A spec an agent can self-check needs a target, a location, and a done condition — otherwise "done" is whatever it decides it is.',
    xp: 60,
  },
  {
    id: 'a5', category: 'agentic', type: 'mc',
    scenario: 'Claude just finished implementing a feature with tests.',
    question: 'What should happen before you consider the task complete?',
    options: [
      'Nothing further — trust the code compiles',
      'Claude should run the tests (and ideally try the feature) itself and report real results, not assumed ones',
      'Skip verification to save time',
      'Ask a different AI to check it',
    ],
    correct: 1,
    explanation: 'Verifying your own work — running tests, exercising the feature — is what turns "should work" into "does work." Agentic workflows are only as trustworthy as their verification step.',
    xp: 50,
  },
  {
    id: 'a6', category: 'agentic', type: 'mc',
    scenario: 'A task is ambiguous — there are two reasonable ways to interpret what you want.',
    question: 'What\'s the best agentic move?',
    options: [
      'Guess silently and hope it\'s the one you meant',
      'Ask a quick clarifying question before doing a lot of work in the wrong direction',
      'Do both interpretations fully',
      'Refuse the task',
    ],
    correct: 1,
    explanation: 'A short clarifying question up front is cheap. Discovering a wrong assumption after a large amount of work is expensive for everyone.',
    xp: 40,
  },

  // ---------- CONTEXT & MEMORY ----------
  {
    id: 'ctx1', category: 'context', type: 'mc',
    scenario: 'Your conversation with Claude has gone on for hours across a huge codebase.',
    question: 'What is a good practice as the context window fills up?',
    options: [
      'Keep going indefinitely and hope nothing gets lost',
      'Summarize key decisions/state and start a fresher session (or let auto-compression handle it) rather than let everything degrade silently',
      'Paste the entire codebase again to "refresh" it',
      'Never start a new session, ever',
    ],
    correct: 1,
    explanation: 'Context is a finite, valuable resource. Explicit summaries of what matters (decisions made, current state, next steps) preserve the important thread even across a session boundary.',
    xp: 50,
  },
  {
    id: 'ctx2', category: 'context', type: 'mc',
    scenario: 'You want Claude to fix a specific function.',
    question: 'Why is pointing to `utils/parser.py:142` better than saying "the parsing function"?',
    options: [
      'It isn\'t better, both are equal',
      'It removes ambiguity and search cost — Claude goes straight to the right code instead of guessing which function you mean',
      'Line numbers make Claude respond faster in general',
      'It\'s only useful for very large files',
    ],
    correct: 1,
    explanation: 'Precise references save a search-and-guess step and eliminate the risk of editing the wrong function entirely.',
    xp: 40,
  },
  {
    id: 'ctx3', category: 'context', type: 'mc',
    scenario: 'You\'re debugging and paste a 2,000-line log file into the conversation, most of it irrelevant noise.',
    question: 'What\'s the risk?',
    options: [
      'No risk — more information is always better',
      'The one relevant error gets buried, and context budget is spent on noise instead of the actual problem',
      'Claude can\'t read long text',
      'It will make Claude respond in more detail',
    ],
    correct: 1,
    explanation: 'Context is a scarce resource, and needle-in-a-haystack noise makes the important signal harder to act on. Trimming to the relevant excerpt (with a pointer to where it came from) is usually better than a full dump.',
    xp: 50,
  },
  {
    id: 'ctx4', category: 'context', type: 'rewrite',
    task: 'Trim this noisy context dump down to what Claude actually needs to help.',
    starterPrompt: '[pastes 500 lines of build output, deprecation warnings, and unrelated test passes, followed by] "so yeah it\'s not working, any ideas?"',
    hints: ['the actual error message', 'what command was run', 'what you expected', 'omit unrelated noise'],
    sampleAnswer: 'Running `npm run build` fails with:\n`TypeError: Cannot read properties of undefined (reading \'map\') at src/components/Cart.tsx:34`\nExpected the build to succeed — this started after adding the `items` prop to `<Cart>`. Relevant code: src/components/Cart.tsx.',
    explanation: 'The full log rarely matters — the specific error, the command, and what changed recently are almost always the entire signal.',
    xp: 60,
  },
  {
    id: 'ctx5', category: 'context', type: 'mc',
    scenario: 'You assume Claude "remembers" a preference you mentioned in a conversation last week.',
    question: 'What\'s the safer assumption?',
    options: [
      'Conversations are remembered forever automatically',
      'Unless it\'s written into a persistent place (like a project file or memory feature), a new session won\'t know it — so durable preferences belong in files, not just past chat',
      'Preferences never need to be repeated',
      'Claude only forgets unimportant things',
    ],
    correct: 1,
    explanation: 'Treat conversation memory as ephemeral unless a durable mechanism (project files, explicit memory features) is in place. Important standing preferences belong somewhere persistent.',
    xp: 40,
  },

  // ---------- ADVANCED TECHNIQUES ----------
  {
    id: 'adv1', category: 'advanced', type: 'mc',
    scenario: 'You give Claude a genuinely hard algorithmic problem.',
    question: 'What tends to improve the quality of the final answer?',
    options: [
      'Demanding the final answer immediately with no reasoning shown',
      'Asking it to think through the approach step by step (or plan) before jumping to the final implementation',
      'Asking for the shortest possible response',
      'Repeating the question twice',
    ],
    correct: 1,
    explanation: 'Working through the approach before committing to an implementation catches flawed assumptions early, the same way it would for a human.',
    xp: 50,
  },
  {
    id: 'adv2', category: 'advanced', type: 'mc',
    scenario: 'You need Claude\'s output to reliably parse as JSON matching a specific shape, every time.',
    question: 'What most reliably achieves this?',
    options: [
      'Asking politely for "valid JSON"',
      'Providing the exact schema/field names and a concrete example of correctly-shaped output',
      'Asking twice in case the first time fails',
      'Requesting XML instead, since it\'s stricter',
    ],
    correct: 1,
    explanation: 'An explicit schema plus an example is what actually anchors the output structure — far more reliable than an unqualified request for "valid JSON."',
    xp: 50,
  },
  {
    id: 'adv3', category: 'advanced', type: 'mc',
    scenario: 'You want higher-quality output on a task with clear success criteria (e.g. "all tests pass").',
    question: 'What technique helps Claude catch its own mistakes before you see them?',
    options: [
      'Asking it to review its own output against the stated requirements before finalizing, and fix anything that fails',
      'Submitting the first draft immediately',
      'Asking for a shorter answer',
      'Avoiding stating the success criteria so it isn\'t "cheating"',
    ],
    correct: 0,
    explanation: 'A self-review pass against explicit success criteria (run the tests, check the requirements list) catches errors before they ever reach you — cheap insurance for a small amount of extra time.',
    xp: 50,
  },
  {
    id: 'adv4', category: 'advanced', type: 'rewrite',
    task: 'Add a self-review step to this task prompt so Claude checks its own work before calling it done.',
    starterPrompt: 'Write a function that validates email addresses and return it.',
    hints: ['ask it to test/verify', 'list explicit requirements to check against', 'edge cases to consider', 'fix issues before finalizing'],
    sampleAnswer: 'Write a function that validates email addresses (must reject missing "@", missing domain, and spaces; must accept standard user@domain.tld forms). Before finalizing, test it against at least 5 valid and 5 invalid examples including edge cases, and fix anything that fails.',
    explanation: 'Naming concrete edge cases and asking for a verification pass turns "looks right" into "checked and works."',
    xp: 60,
  },
  {
    id: 'adv5', category: 'advanced', type: 'mc',
    scenario: 'You have a complex, subjective creative-writing task (e.g. a nuanced short story).',
    question: 'What tends to produce a better final result than one giant, all-requirements-at-once prompt?',
    options: [
      'An iterative back-and-forth: get a draft, give specific feedback, refine — rather than trying to specify everything perfectly up front',
      'A single 2,000-word prompt covering every possible requirement',
      'Refusing to give any feedback so as not to bias it',
      'Asking for five different versions at once and picking one blindly',
    ],
    correct: 0,
    explanation: 'For subjective, hard-to-fully-specify tasks, iteration usually beats exhaustive upfront specification — you often don\'t know exactly what you want until you see a draft.',
    xp: 40,
  },
];

// Quick lookup maps used by the app.
const QUESTS_BY_CATEGORY = CATEGORIES.reduce((acc, cat) => {
  acc[cat.id] = QUESTS.filter((q) => q.category === cat.id);
  return acc;
}, {});

const QUESTS_BY_ID = QUESTS.reduce((acc, q) => {
  acc[q.id] = q;
  return acc;
}, {});

// Badge definitions. `check(state, helpers)` returns true when the badge should be unlocked.
const BADGES = [
  {
    id: 'first-steps', icon: '🎉', name: 'First Steps',
    description: 'Complete your first quest.',
    check: (state) => Object.keys(state.completed).length >= 1,
  },
  {
    id: 'perfect-ten', icon: '🔥', name: 'On a Roll',
    description: 'Answer 10 questions correctly in a row.',
    check: (state) => state.bestCorrectStreak >= 10,
  },
  {
    id: 'prompting-master', icon: '🎯', name: 'Prompting Pro',
    description: 'Master every quest in Prompting Fundamentals.',
    check: (state, h) => h.categoryComplete('prompting'),
  },
  {
    id: 'claude-code-master', icon: '🛠️', name: 'Code Whisperer',
    description: 'Master every quest in Claude Code Mastery.',
    check: (state, h) => h.categoryComplete('claude-code'),
  },
  {
    id: 'agentic-master', icon: '🤖', name: 'Agent Handler',
    description: 'Master every quest in Agentic Workflows.',
    check: (state, h) => h.categoryComplete('agentic'),
  },
  {
    id: 'context-master', icon: '🧠', name: 'Context Curator',
    description: 'Master every quest in Context & Memory.',
    check: (state, h) => h.categoryComplete('context'),
  },
  {
    id: 'advanced-master', icon: '⚡', name: 'Power User',
    description: 'Master every quest in Advanced Techniques.',
    check: (state, h) => h.categoryComplete('advanced'),
  },
  {
    id: 'grandmaster', icon: '👑', name: 'Grandmaster of Claude',
    description: 'Complete every quest in the game.',
    check: (state) => Object.keys(state.completed).length >= QUESTS.length,
  },
  {
    id: 'week-streak', icon: '📅', name: 'Daily Devotee',
    description: 'Hit a 7-day daily challenge streak.',
    check: (state) => state.dailyStreak >= 7,
  },
  {
    id: 'level-5', icon: '🥉', name: 'Rising Star',
    description: 'Reach level 5.',
    check: (state, h) => h.level(state.xp) >= 5,
  },
  {
    id: 'level-10', icon: '🥇', name: 'Claude Legend',
    description: 'Reach level 10.',
    check: (state, h) => h.level(state.xp) >= 10,
  },
];
