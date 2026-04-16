/**
 * engine.ts — Pure 2048 game logic. No React, no side-effects.
 *
 * Two representations are used:
 *   board  — number[][]  (N×N grid, board[row][col])
 *   tiles  — Tile[]      (objects with id, value, row, col, animation flags)
 *
 * All functions accept an explicit `size` parameter so the grid dimensions
 * are fully configurable (always square: size × size).
 */

export type Direction = "up" | "down" | "left" | "right";

export interface Tile {
  id: number;
  value: number;
  row: number;
  col: number;
  isNew: boolean;
  isMerged: boolean;
  animKey: number;
}

// ─────────────────────────────────────────────
// Board helpers
// ─────────────────────────────────────────────

function spawnOnBoard(board: number[][], size: number): number[][] {
  const empties: [number, number][] = [];
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++)
      if (board[r][c] === 0) empties.push([r, c]);
  if (!empties.length) return board;
  const [r, c] = empties[Math.floor(Math.random() * empties.length)];
  const next = board.map((row) => [...row]);
  next[r][c] = Math.random() < 0.9 ? 2 : 4;
  return next;
}

export function initBoard(size: number): number[][] {
  let b: number[][] = Array.from({ length: size }, () => Array(size).fill(0));
  b = spawnOnBoard(b, size);
  b = spawnOnBoard(b, size);
  return b;
}

/** Slide a line toward index 0, merging equal adjacent tiles once. */
function slideLeft(line: number[], size: number): { line: number[]; score: number } {
  const tiles = line.filter(Boolean);
  const result: number[] = [];
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
  while (result.length < size) result.push(0);
  return { line: result, score };
}

/** Apply a move to a number[][] board. Returns { board, score, changed }. */
export function applyMove(
  board: number[][],
  dir: Direction,
  size: number,
): { board: number[][]; score: number; changed: boolean } {
  const next = board.map((r) => [...r]);
  let totalScore = 0;
  let changed = false;

  const slide = (orig: number[]): number[] => {
    const { line, score } = slideLeft(orig, size);
    if (!changed && orig.some((v, i) => v !== line[i])) changed = true;
    totalScore += score;
    return line;
  };

  if (dir === "left") {
    for (let r = 0; r < size; r++) next[r] = slide(next[r]);
  } else if (dir === "right") {
    for (let r = 0; r < size; r++) {
      const orig = [...next[r]];
      const slid = slide([...orig].reverse()).reverse();
      if (!changed && orig.some((v, i) => v !== slid[i])) changed = true;
      next[r] = slid;
    }
  } else if (dir === "up") {
    for (let c = 0; c < size; c++) {
      const col = Array.from({ length: size }, (_, r) => next[r][c]);
      const slid = slide(col);
      for (let r = 0; r < size; r++) next[r][c] = slid[r];
    }
  } else if (dir === "down") {
    for (let c = 0; c < size; c++) {
      const col = Array.from({ length: size }, (_, i) => next[size - 1 - i][c]);
      const slid = slide(col);
      for (let i = 0; i < size; i++) next[size - 1 - i][c] = slid[i];
    }
  }

  return { board: next, score: totalScore, changed };
}

export function getLegalMoves(board: number[][], size: number): Direction[] {
  return (["up", "down", "left", "right"] as Direction[]).filter(
    (d) => applyMove(board, d, size).changed,
  );
}

// ─────────────────────────────────────────────
// Tile ↔ board conversions
// ─────────────────────────────────────────────

export function tilesToBoard(tiles: Tile[], size: number): number[][] {
  const board: number[][] = Array.from({ length: size }, () => Array(size).fill(0));
  for (const t of tiles) board[t.row][t.col] = t.value;
  return board;
}

export function boardToTiles(board: number[][], size: number, getId: () => number): Tile[] {
  const tiles: Tile[] = [];
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++)
      if (board[r][c] !== 0)
        tiles.push({
          id: getId(),
          value: board[r][c],
          row: r,
          col: c,
          isNew: true,
          isMerged: false,
          animKey: 0,
        });
  return tiles;
}

// ─────────────────────────────────────────────
// Tile-level operations
// ─────────────────────────────────────────────

/** Spawn a new tile in a random empty cell; returns a new tiles array. */
export function spawnTile(tiles: Tile[], size: number, getId: () => number): Tile[] {
  const occ = new Set(tiles.map((t) => `${t.row},${t.col}`));
  const empties: [number, number][] = [];
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++)
      if (!occ.has(`${r},${c}`)) empties.push([r, c]);
  if (!empties.length) return tiles;
  const [r, c] = empties[Math.floor(Math.random() * empties.length)];
  return [
    ...tiles,
    {
      id: getId(),
      value: Math.random() < 0.9 ? 2 : 4,
      row: r,
      col: c,
      isNew: true,
      isMerged: false,
      animKey: 0,
    },
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
export function applyMoveTracked(
  prevTiles: Tile[],
  dir: Direction,
  size: number,
  getId: () => number,
): { tiles: Tile[]; score: number; changed: boolean } {
  const vGrid: number[][] = Array.from({ length: size }, () => Array(size).fill(0));
  const iGrid: (number | null)[][] = Array.from({ length: size }, () =>
    Array(size).fill(null),
  );
  for (const t of prevTiles) {
    vGrid[t.row][t.col] = t.value;
    iGrid[t.row][t.col] = t.id;
  }
  const byId = new Map(prevTiles.map((t) => [t.id, t]));

  let totalScore = 0;
  let changed = false;

  const nvGrid: number[][] = Array.from({ length: size }, () => Array(size).fill(0));
  const niGrid: (number | null)[][] = Array.from({ length: size }, () =>
    Array(size).fill(null),
  );
  const nmGrid: boolean[][] = Array.from({ length: size }, () =>
    Array(size).fill(false),
  );

  function slideLine(
    vals: number[],
    ids: (number | null)[],
  ): {
    ov: number[];
    oi: (number | null)[];
    om: boolean[];
  } {
    const pairs: { v: number; id: number | null }[] = [];
    for (let i = 0; i < size; i++) if (vals[i]) pairs.push({ v: vals[i], id: ids[i] });

    const ov = Array(size).fill(0) as number[];
    const oi = Array(size).fill(null) as (number | null)[];
    const om = Array(size).fill(false) as boolean[];
    let score = 0;
    let out = 0;
    let i = 0;

    while (i < pairs.length) {
      if (i + 1 < pairs.length && pairs[i].v === pairs[i + 1].v) {
        ov[out] = pairs[i].v * 2;
        oi[out] = pairs[i].id;
        om[out] = true;
        score += pairs[i].v * 2;
        out++;
        i += 2;
      } else {
        ov[out] = pairs[i].v;
        oi[out] = pairs[i].id;
        out++;
        i++;
      }
    }

    if (vals.some((v, k) => v !== ov[k])) changed = true;
    totalScore += score;
    return { ov, oi, om };
  }

  if (dir === "left") {
    for (let r = 0; r < size; r++) {
      const { ov, oi, om } = slideLine(vGrid[r], iGrid[r]);
      nvGrid[r] = ov;
      niGrid[r] = oi;
      nmGrid[r] = om;
    }
  } else if (dir === "right") {
    for (let r = 0; r < size; r++) {
      const { ov, oi, om } = slideLine(
        [...vGrid[r]].reverse(),
        [...iGrid[r]].reverse(),
      );
      nvGrid[r] = [...ov].reverse();
      niGrid[r] = [...oi].reverse();
      nmGrid[r] = [...om].reverse();
    }
  } else if (dir === "up") {
    for (let c = 0; c < size; c++) {
      const cv = Array.from({ length: size }, (_, r) => vGrid[r][c]);
      const ci = Array.from({ length: size }, (_, r) => iGrid[r][c]);
      const { ov, oi, om } = slideLine(cv, ci);
      for (let r = 0; r < size; r++) {
        nvGrid[r][c] = ov[r];
        niGrid[r][c] = oi[r];
        nmGrid[r][c] = om[r];
      }
    }
  } else {
    for (let c = 0; c < size; c++) {
      const cv = Array.from({ length: size }, (_, i) => vGrid[size - 1 - i][c]);
      const ci = Array.from({ length: size }, (_, i) => iGrid[size - 1 - i][c]);
      const { ov, oi, om } = slideLine(cv, ci);
      for (let i = 0; i < size; i++) {
        nvGrid[size - 1 - i][c] = ov[i];
        niGrid[size - 1 - i][c] = oi[i];
        nmGrid[size - 1 - i][c] = om[i];
      }
    }
  }

  // Suppress unused getId warning — kept for API symmetry with spawnTile
  void getId;

  const newTiles: Tile[] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!nvGrid[r][c]) continue;
      const id = niGrid[r][c]!;
      const isMerged = nmGrid[r][c];
      const prev = byId.get(id);
      newTiles.push({
        id,
        value: nvGrid[r][c],
        row: r,
        col: c,
        isNew: false,
        isMerged,
        animKey: isMerged ? (prev?.animKey ?? 0) + 1 : (prev?.animKey ?? 0),
      });
    }
  }

  return { tiles: newTiles, score: totalScore, changed };
}

/** Build a fresh tile array for a new game. */
export function freshTiles(size: number, getId: () => number): Tile[] {
  return boardToTiles(initBoard(size), size, getId);
}
