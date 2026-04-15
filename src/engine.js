/**
 * engine.js — Pure 2048 game logic. No React, no side-effects.
 *
 * Two representations are used:
 *   board  — number[][]  (4×4 grid, board[row][col])
 *   tiles  — Tile[]      (objects with id, value, row, col, animation flags)
 *
 * The board representation is used for legal-move detection (cheap).
 * The tile representation is used for rendering (carries identity / animation state).
 */

// ─────────────────────────────────────────────
// Board helpers
// ─────────────────────────────────────────────

function spawnOnBoard(board) {
  const empties = [];
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++)
      if (board[r][c] === 0) empties.push([r, c]);
  if (!empties.length) return board;
  const [r, c] = empties[Math.floor(Math.random() * empties.length)];
  const next = board.map((row) => [...row]);
  next[r][c] = Math.random() < 0.9 ? 2 : 4;
  return next;
}

export function initBoard() {
  let b = Array.from({ length: 4 }, () => Array(4).fill(0));
  b = spawnOnBoard(b);
  b = spawnOnBoard(b);
  return b;
}

/** Slide a line toward index 0, merging equal adjacent tiles once. */
function slideLeft(line) {
  const tiles = line.filter(Boolean);
  const result = [];
  let score = 0;
  let i = 0;
  while (i < tiles.length) {
    if (i + 1 < tiles.length && tiles[i] === tiles[i + 1]) {
      const val = tiles[i] * 2;
      result.push(val);
      score += val;
      i += 2;
    } else {
      result.push(tiles[i]);
      i++;
    }
  }
  while (result.length < 4) result.push(0);
  return { line: result, score };
}

/** Apply a move to a number[][] board. Returns { board, score, changed }. */
export function applyMove(board, dir) {
  const next = board.map((r) => [...r]);
  let totalScore = 0;
  let changed = false;

  const slide = (orig) => {
    const { line, score } = slideLeft(orig);
    if (!changed && orig.some((v, i) => v !== line[i])) changed = true;
    totalScore += score;
    return line;
  };

  if (dir === "left") {
    for (let r = 0; r < 4; r++) next[r] = slide(next[r]);
  } else if (dir === "right") {
    for (let r = 0; r < 4; r++) {
      const orig = [...next[r]];
      const slid = slide([...orig].reverse()).reverse();
      if (!changed && orig.some((v, i) => v !== slid[i])) changed = true;
      next[r] = slid;
    }
  } else if (dir === "up") {
    for (let c = 0; c < 4; c++) {
      const col = [next[0][c], next[1][c], next[2][c], next[3][c]];
      const slid = slide(col);
      for (let r = 0; r < 4; r++) next[r][c] = slid[r];
    }
  } else if (dir === "down") {
    for (let c = 0; c < 4; c++) {
      const col = [next[3][c], next[2][c], next[1][c], next[0][c]];
      const slid = slide(col);
      for (let i = 0; i < 4; i++) next[3 - i][c] = slid[i];
    }
  }

  return { board: next, score: totalScore, changed };
}

export function getLegalMoves(board) {
  return ["up", "down", "left", "right"].filter((d) => applyMove(board, d).changed);
}

// ─────────────────────────────────────────────
// Tile ↔ board conversions
// ─────────────────────────────────────────────

export function tilesToBoard(tiles) {
  const board = Array.from({ length: 4 }, () => Array(4).fill(0));
  for (const t of tiles) board[t.row][t.col] = t.value;
  return board;
}

export function boardToTiles(board, getId) {
  const tiles = [];
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++)
      if (board[r][c] !== 0)
        tiles.push({ id: getId(), value: board[r][c], row: r, col: c,
                     isNew: true, isMerged: false, animKey: 0 });
  return tiles;
}

// ─────────────────────────────────────────────
// Tile-level operations
// ─────────────────────────────────────────────

/** Spawn a new tile in a random empty cell; returns a new tiles array. */
export function spawnTile(tiles, getId) {
  const occ = new Set(tiles.map((t) => `${t.row},${t.col}`));
  const empties = [];
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++)
      if (!occ.has(`${r},${c}`)) empties.push([r, c]);
  if (!empties.length) return tiles;
  const [r, c] = empties[Math.floor(Math.random() * empties.length)];
  return [
    ...tiles,
    { id: getId(), value: Math.random() < 0.9 ? 2 : 4,
      row: r, col: c, isNew: true, isMerged: false, animKey: 0 },
  ];
}

/**
 * Apply a directional move to a tile array, preserving tile identity.
 *
 * - Tiles that slide keep their id.
 * - When two tiles merge the first tile's id survives; its animKey increments
 *   so React remounts the inner face div and the merge animation replays.
 * - The second (eaten) tile simply disappears from the array.
 *
 * Returns { tiles, score, changed }.
 */
export function applyMoveTracked(prevTiles, dir, getId) {
  const vGrid = Array.from({ length: 4 }, () => Array(4).fill(0));
  const iGrid = Array.from({ length: 4 }, () => Array(4).fill(null));
  for (const t of prevTiles) { vGrid[t.row][t.col] = t.value; iGrid[t.row][t.col] = t.id; }
  const byId = new Map(prevTiles.map((t) => [t.id, t]));

  let totalScore = 0;
  let changed = false;

  const nvGrid = Array.from({ length: 4 }, () => Array(4).fill(0));
  const niGrid = Array.from({ length: 4 }, () => Array(4).fill(null));
  const nmGrid = Array.from({ length: 4 }, () => Array(4).fill(false));

  function slideLine(vals, ids) {
    const pairs = [];
    for (let i = 0; i < 4; i++) if (vals[i]) pairs.push({ v: vals[i], id: ids[i] });

    const ov = Array(4).fill(0), oi = Array(4).fill(null), om = Array(4).fill(false);
    let score = 0, out = 0, i = 0;

    while (i < pairs.length) {
      if (i + 1 < pairs.length && pairs[i].v === pairs[i + 1].v) {
        ov[out] = pairs[i].v * 2;
        oi[out] = pairs[i].id;
        om[out] = true;
        score += pairs[i].v * 2;
        out++; i += 2;
      } else {
        ov[out] = pairs[i].v;
        oi[out] = pairs[i].id;
        out++; i++;
      }
    }

    if (vals.some((v, k) => v !== ov[k])) changed = true;
    totalScore += score;
    return { ov, oi, om };
  }

  if (dir === "left") {
    for (let r = 0; r < 4; r++) {
      const { ov, oi, om } = slideLine(vGrid[r], iGrid[r]);
      nvGrid[r] = ov; niGrid[r] = oi; nmGrid[r] = om;
    }
  } else if (dir === "right") {
    for (let r = 0; r < 4; r++) {
      const { ov, oi, om } = slideLine([...vGrid[r]].reverse(), [...iGrid[r]].reverse());
      nvGrid[r] = [...ov].reverse(); niGrid[r] = [...oi].reverse(); nmGrid[r] = [...om].reverse();
    }
  } else if (dir === "up") {
    for (let c = 0; c < 4; c++) {
      const cv = [vGrid[0][c], vGrid[1][c], vGrid[2][c], vGrid[3][c]];
      const ci = [iGrid[0][c], iGrid[1][c], iGrid[2][c], iGrid[3][c]];
      const { ov, oi, om } = slideLine(cv, ci);
      for (let r = 0; r < 4; r++) { nvGrid[r][c] = ov[r]; niGrid[r][c] = oi[r]; nmGrid[r][c] = om[r]; }
    }
  } else {
    for (let c = 0; c < 4; c++) {
      const cv = [vGrid[3][c], vGrid[2][c], vGrid[1][c], vGrid[0][c]];
      const ci = [iGrid[3][c], iGrid[2][c], iGrid[1][c], iGrid[0][c]];
      const { ov, oi, om } = slideLine(cv, ci);
      for (let i = 0; i < 4; i++) { nvGrid[3-i][c] = ov[i]; niGrid[3-i][c] = oi[i]; nmGrid[3-i][c] = om[i]; }
    }
  }

  const newTiles = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      if (!nvGrid[r][c]) continue;
      const id = niGrid[r][c];
      const isMerged = nmGrid[r][c];
      const prev = byId.get(id);
      newTiles.push({
        id, value: nvGrid[r][c], row: r, col: c,
        isNew: false, isMerged,
        animKey: isMerged ? (prev?.animKey ?? 0) + 1 : (prev?.animKey ?? 0),
      });
    }
  }

  return { tiles: newTiles, score: totalScore, changed };
}

/** Build a fresh tile array for a new game. */
export function freshTiles(getId) {
  return boardToTiles(initBoard(), getId);
}
