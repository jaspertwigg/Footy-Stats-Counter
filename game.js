// ---------------------------------------------------------------------------
// Corner Box — a 2-player grid piece placement game (Blokus-style rules).
//
// Board: 14x14 grid, each player has a starting dot in the middle of their
// own half. Pieces are every free polyomino of size 1-5 (21 shapes, 44 cells
// worth... 21 pieces total, matching the classic set). A newly placed piece
// must touch at least one corner of the player's own existing pieces and
// must not share a full edge with them; opponent pieces impose no such
// restriction.
// ---------------------------------------------------------------------------

const BOARD_SIZE = 14;
const P1_START = { r: 4, c: 4 };
const P2_START = { r: 9, c: 9 };

// --- Piece definitions ------------------------------------------------------
// Each base shape is a list of [row, col] cells, normalized so the minimum
// row and column are 0. This is the full set of free polyominoes of size
// 1 through 5 (1 monomino, 1 domino, 2 trominoes, 5 tetrominoes, 12
// pentominoes = 21 pieces), matching the standard Blokus piece set.
const BASE_SHAPES = [
  // size 1
  { name: "monomino", cells: [[0,0]] },
  // size 2
  { name: "domino", cells: [[0,0],[0,1]] },
  // size 3
  { name: "I3", cells: [[0,0],[0,1],[0,2]] },
  { name: "L3", cells: [[0,0],[0,1],[1,0]] },
  // size 4
  { name: "I4", cells: [[0,0],[0,1],[0,2],[0,3]] },
  { name: "O4", cells: [[0,0],[0,1],[1,0],[1,1]] },
  { name: "T4", cells: [[0,0],[0,1],[0,2],[1,1]] },
  { name: "S4", cells: [[0,1],[0,2],[1,0],[1,1]] },
  { name: "L4", cells: [[0,0],[1,0],[2,0],[2,1]] },
  // size 5 (pentominoes)
  { name: "F5", cells: [[0,1],[0,2],[1,0],[1,1],[2,1]] },
  { name: "I5", cells: [[0,0],[0,1],[0,2],[0,3],[0,4]] },
  { name: "L5", cells: [[0,0],[1,0],[2,0],[3,0],[3,1]] },
  { name: "N5", cells: [[0,1],[1,1],[2,0],[2,1],[3,0]] },
  { name: "P5", cells: [[0,0],[0,1],[1,0],[1,1],[2,0]] },
  { name: "T5", cells: [[0,0],[0,1],[0,2],[1,1],[2,1]] },
  { name: "U5", cells: [[0,0],[0,2],[1,0],[1,1],[1,2]] },
  { name: "V5", cells: [[0,0],[1,0],[2,0],[2,1],[2,2]] },
  { name: "W5", cells: [[0,0],[1,0],[1,1],[2,1],[2,2]] },
  { name: "X5", cells: [[0,1],[1,0],[1,1],[1,2],[2,1]] },
  { name: "Y5", cells: [[0,1],[1,0],[1,1],[2,1],[3,1]] },
  { name: "Z5", cells: [[0,0],[0,1],[1,1],[2,1],[2,2]] },
];

function normalize(cells) {
  const minR = Math.min(...cells.map(c => c[0]));
  const minC = Math.min(...cells.map(c => c[1]));
  return cells
    .map(([r, c]) => [r - minR, c - minC])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

function rotateCW(cells) {
  // (r,c) -> (c,-r)
  return normalize(cells.map(([r, c]) => [c, -r]));
}

function flipH(cells) {
  return normalize(cells.map(([r, c]) => [r, -c]));
}

function shapeKey(cells) {
  return cells.map(c => c.join(",")).join("|");
}

function allOrientations(baseCells) {
  const seen = new Map();
  let cur = normalize(baseCells);
  for (let flip = 0; flip < 2; flip++) {
    for (let rot = 0; rot < 4; rot++) {
      const key = shapeKey(cur);
      if (!seen.has(key)) seen.set(key, cur);
      cur = rotateCW(cur);
    }
    cur = flipH(cur);
  }
  return Array.from(seen.values());
}

// Build the full piece catalog once. Each piece has: id, size, base shape,
// and a precomputed list of unique orientations for legal-move scanning.
const PIECE_CATALOG = BASE_SHAPES.map((shape, id) => ({
  id,
  name: shape.name,
  size: shape.cells.length,
  base: normalize(shape.cells),
  orientations: allOrientations(shape.cells),
}));

// --- Game state ---------------------------------------------------------
function makeInitialPlayerState() {
  return {
    remaining: PIECE_CATALOG.map(p => p.id), // ids not yet placed
    hasPlaced: false,
  };
}

const state = {
  board: null, // 2D array of 0 (empty), 1, 2
  players: { 1: null, 2: null },
  current: 1,
  passStreak: 0,
  gameOver: false,
  selectedPieceId: null,
  rotation: 0, // 0-3
  flipped: false,
  hoverCell: null,
};

function newGame() {
  state.board = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0));
  state.players = { 1: makeInitialPlayerState(), 2: makeInitialPlayerState() };
  state.current = 1;
  state.passStreak = 0;
  state.gameOver = false;
  state.selectedPieceId = null;
  state.rotation = 0;
  state.flipped = false;
  state.hoverCell = null;
  setMessage("");
  render();
}

// --- Geometry helpers -----------------------------------------------------
function getPieceById(id) {
  return PIECE_CATALOG[id];
}

function transformCells(baseCells, rotation, flipped) {
  let cells = baseCells;
  if (flipped) cells = flipH(cells);
  for (let i = 0; i < rotation; i++) cells = rotateCW(cells);
  return normalize(cells);
}

function currentSelectedShape() {
  if (state.selectedPieceId === null) return null;
  const piece = getPieceById(state.selectedPieceId);
  return transformCells(piece.base, state.rotation, state.flipped);
}

function inBounds(r, c) {
  return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;
}

function startDotFor(player) {
  return player === 1 ? P1_START : P2_START;
}

// Checks whether placing `cells` (already offset to absolute board coords)
// is legal for `player`. Returns { ok, reason }.
function validatePlacement(cells, player) {
  const board = state.board;
  for (const [r, c] of cells) {
    if (!inBounds(r, c)) return { ok: false, reason: "Piece would go off the board." };
    if (board[r][c] !== 0) return { ok: false, reason: "Piece overlaps another piece." };
  }

  const pstate = state.players[player];
  if (!pstate.hasPlaced) {
    const dot = startDotFor(player);
    const coversDot = cells.some(([r, c]) => r === dot.r && c === dot.c);
    if (!coversDot) return { ok: false, reason: "Your first piece must cover your starting dot." };
    return { ok: true };
  }

  let touchesCorner = false;
  for (const [r, c] of cells) {
    // Orthogonal (edge) neighbors must not belong to the same player.
    const edgeNeighbors = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
    for (const [nr, nc] of edgeNeighbors) {
      if (inBounds(nr, nc) && board[nr][nc] === player) {
        return { ok: false, reason: "Piece touches an edge of one of your own pieces." };
      }
    }
    // Diagonal neighbors: if any belongs to the same player, corner rule satisfied.
    const cornerNeighbors = [[r - 1, c - 1], [r - 1, c + 1], [r + 1, c - 1], [r + 1, c + 1]];
    for (const [nr, nc] of cornerNeighbors) {
      if (inBounds(nr, nc) && board[nr][nc] === player) {
        touchesCorner = true;
      }
    }
  }

  if (!touchesCorner) {
    return { ok: false, reason: "Piece must touch at least one corner of one of your own pieces." };
  }
  return { ok: true };
}

function placePiece(pieceId, rotation, flipped, anchorR, anchorC, player) {
  const piece = getPieceById(pieceId);
  const shape = transformCells(piece.base, rotation, flipped);
  const cells = shape.map(([r, c]) => [r + anchorR, c + anchorC]);
  const result = validatePlacement(cells, player);
  if (!result.ok) return result;

  for (const [r, c] of cells) state.board[r][c] = player;
  state.players[player].remaining = state.players[player].remaining.filter(id => id !== pieceId);
  state.players[player].hasPlaced = true;
  state.passStreak = 0;
  return { ok: true };
}

// Determine if `player` has ANY legal move among their remaining pieces.
function hasAnyLegalMove(player) {
  const pstate = state.players[player];
  for (const pieceId of pstate.remaining) {
    const piece = getPieceById(pieceId);
    for (const orientation of piece.orientations) {
      const height = Math.max(...orientation.map(c => c[0])) + 1;
      const width = Math.max(...orientation.map(c => c[1])) + 1;
      for (let ar = 0; ar <= BOARD_SIZE - height; ar++) {
        for (let ac = 0; ac <= BOARD_SIZE - width; ac++) {
          const cells = orientation.map(([r, c]) => [r + ar, c + ac]);
          if (validatePlacement(cells, player).ok) return true;
        }
      }
    }
  }
  return false;
}

// --- Rendering --------------------------------------------------------------
const boardEl = document.getElementById("board");
const trayEls = { 1: document.getElementById("pieces-p1"), 2: document.getElementById("pieces-p2") };
const statsEls = { 1: document.getElementById("stats-p1"), 2: document.getElementById("stats-p2") };
const turnIndicatorEl = document.getElementById("turn-indicator");
const messageEl = document.getElementById("message");
const passBtn = document.getElementById("pass-btn");

boardEl.style.gridTemplateColumns = `repeat(${BOARD_SIZE}, 28px)`;
boardEl.style.gridTemplateRows = `repeat(${BOARD_SIZE}, 28px)`;

function setMessage(text, isError = true) {
  messageEl.textContent = text;
  messageEl.style.color = isError ? "#a33" : "#2a7a2a";
}

function buildBoardDom() {
  boardEl.innerHTML = "";
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.r = r;
      cell.dataset.c = c;
      if ((r === P1_START.r && c === P1_START.c) || (r === P2_START.r && c === P2_START.c)) {
        cell.classList.add("start-dot");
      }
      cell.addEventListener("mouseenter", () => onCellHover(r, c));
      cell.addEventListener("click", () => onCellClick(r, c));
      boardEl.appendChild(cell);
    }
  }
}

function renderBoard() {
  const cells = boardEl.children;
  const shape = currentSelectedShape();
  let previewCells = [];
  let previewValid = false;
  if (shape && state.hoverCell && !state.gameOver) {
    const { r: ar, c: ac } = state.hoverCell;
    const abs = shape.map(([r, c]) => [r + ar, c + ac]);
    const result = validatePlacement(abs, state.current);
    previewCells = abs;
    previewValid = result.ok;
  }

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const idx = r * BOARD_SIZE + c;
      const cellEl = cells[idx];
      cellEl.classList.remove("p1", "p2", "preview-ok", "preview-bad", "p1preview", "p2preview");
      const occ = state.board[r][c];
      if (occ === 1) cellEl.classList.add("p1");
      else if (occ === 2) cellEl.classList.add("p2");
    }
  }

  for (const [r, c] of previewCells) {
    if (!inBounds(r, c)) continue;
    const idx = r * BOARD_SIZE + c;
    const cellEl = cells[idx];
    if (previewValid) {
      cellEl.classList.add("preview-ok", state.current === 1 ? "p1preview" : "p2preview");
    } else {
      cellEl.classList.add("preview-bad");
    }
  }
}

function renderThumb(cells, player, size = 9) {
  const wrap = document.createElement("div");
  const maxR = Math.max(...cells.map(c => c[0])) + 1;
  const maxC = Math.max(...cells.map(c => c[1])) + 1;
  wrap.className = "piece-thumb-grid";
  wrap.style.gridTemplateColumns = `repeat(${maxC}, ${size}px)`;
  wrap.style.gridTemplateRows = `repeat(${maxR}, ${size}px)`;
  const filled = new Set(cells.map(c => c.join(",")));
  for (let r = 0; r < maxR; r++) {
    for (let c = 0; c < maxC; c++) {
      const d = document.createElement("div");
      const isFilled = filled.has(`${r},${c}`);
      d.className = "thumb-cell " + (isFilled ? `filled p${player}` : "empty");
      wrap.appendChild(d);
    }
  }
  return wrap;
}

function renderTray(player) {
  const el = trayEls[player];
  el.innerHTML = "";
  const pstate = state.players[player];
  const sorted = [...pstate.remaining].sort((a, b) => getPieceById(a).size - getPieceById(b).size || a - b);
  for (const pieceId of sorted) {
    const piece = getPieceById(pieceId);
    const thumb = document.createElement("div");
    thumb.className = "piece-thumb";
    if (state.selectedPieceId === pieceId && state.current === player) {
      thumb.classList.add("selected");
    }
    if (state.current !== player || state.gameOver) {
      thumb.classList.add("disabled-tray");
    }
    thumb.appendChild(renderThumb(piece.base, player));
    thumb.title = `${piece.name} (${piece.size} squares)`;
    thumb.addEventListener("click", () => selectPiece(pieceId, player));
    el.appendChild(thumb);
  }

  const totalSquares = pstate.remaining.reduce((sum, id) => sum + getPieceById(id).size, 0);
  statsEls[player].textContent = `${pstate.remaining.length} pieces left (${totalSquares} squares)`;
}

function renderTurnIndicator() {
  if (state.gameOver) {
    turnIndicatorEl.className = "turn-indicator over";
    const p1Left = state.players[1].remaining.length;
    const p2Left = state.players[2].remaining.length;
    let text;
    if (p1Left < p2Left) text = `Game over — Player 1 wins! (${p1Left} vs ${p2Left} pieces left)`;
    else if (p2Left < p1Left) text = `Game over — Player 2 wins! (${p2Left} vs ${p1Left} pieces left)`;
    else {
      const p1Sq = state.players[1].remaining.reduce((s, id) => s + getPieceById(id).size, 0);
      const p2Sq = state.players[2].remaining.reduce((s, id) => s + getPieceById(id).size, 0);
      if (p1Sq === p2Sq) text = "Game over — it's a draw!";
      else text = `Game over — ${p1Sq < p2Sq ? "Player 1" : "Player 2"} wins on fewer remaining squares!`;
    }
    turnIndicatorEl.textContent = text;
    turnIndicatorEl.classList.add("game-over-banner");
    return;
  }
  turnIndicatorEl.className = `turn-indicator p${state.current}`;
  turnIndicatorEl.textContent = `Player ${state.current}'s turn`;
}

function render() {
  renderBoard();
  renderTray(1);
  renderTray(2);
  renderTurnIndicator();

  const canMove = !state.gameOver && hasAnyLegalMove(state.current);
  passBtn.disabled = state.gameOver || canMove;
}

// --- Interaction --------------------------------------------------------
function selectPiece(pieceId, player) {
  if (state.gameOver || player !== state.current) return;
  if (state.selectedPieceId === pieceId) {
    state.selectedPieceId = null;
  } else {
    state.selectedPieceId = pieceId;
    state.rotation = 0;
    state.flipped = false;
  }
  setMessage("");
  render();
}

function onCellHover(r, c) {
  state.hoverCell = { r, c };
  renderBoard();
}

function onCellClick(r, c) {
  if (state.gameOver || state.selectedPieceId === null) return;
  const result = placePiece(state.selectedPieceId, state.rotation, state.flipped, r, c, state.current);
  if (!result.ok) {
    setMessage(result.reason);
    return;
  }
  setMessage("");
  state.selectedPieceId = null;

  advanceTurnAfterMove();
  render();
}

function advanceTurnAfterMove() {
  const other = state.current === 1 ? 2 : 1;
  state.current = other;
  if (state.players[1].remaining.length === 0 && state.players[2].remaining.length === 0) {
    state.gameOver = true;
    return;
  }
  if (!hasAnyLegalMove(state.current)) {
    // Auto-notify; player must explicitly press Pass to continue (keeps flow visible).
  }
}

function handlePass() {
  if (state.gameOver) return;
  if (hasAnyLegalMove(state.current)) {
    setMessage("You still have a legal move available — you can't pass yet.");
    return;
  }
  state.passStreak += 1;
  state.selectedPieceId = null;
  setMessage(`Player ${state.current} passes.`, false);
  if (state.passStreak >= 2) {
    state.gameOver = true;
    render();
    return;
  }
  state.current = state.current === 1 ? 2 : 1;
  render();
}

function rotate(dir) {
  if (state.selectedPieceId === null) return;
  state.rotation = (state.rotation + (dir > 0 ? 1 : 3)) % 4;
  render();
}

function flip() {
  if (state.selectedPieceId === null) return;
  state.flipped = !state.flipped;
  render();
}

function deselect() {
  state.selectedPieceId = null;
  render();
}

document.getElementById("rotate-cw-btn").addEventListener("click", () => rotate(1));
document.getElementById("rotate-ccw-btn").addEventListener("click", () => rotate(-1));
document.getElementById("flip-btn").addEventListener("click", flip);
document.getElementById("pass-btn").addEventListener("click", handlePass);
document.getElementById("deselect-btn").addEventListener("click", deselect);
document.getElementById("new-game-btn").addEventListener("click", () => {
  if (confirm("Start a new game? Current progress will be lost.")) newGame();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") deselect();
  else if (e.key.toLowerCase() === "r") rotate(e.shiftKey ? -1 : 1);
  else if (e.key.toLowerCase() === "f") flip();
});

// --- Boot ---------------------------------------------------------------
buildBoardDom();
newGame();
