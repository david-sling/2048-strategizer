/**
 * constants.ts — Design tokens, tile visuals, preset strategies, layout values.
 */

// ─────────────────────────────────────────────
// Board layout
// ─────────────────────────────────────────────

export const BOARD_PAD = 6; // px — padding inside the board wrapper
export const TILE_GAP  = 6; // px — gap between tiles

// ─────────────────────────────────────────────
// Tile colours  (warm amber palette)
// ─────────────────────────────────────────────

const TILE_PALETTE: Record<number, [string, string]> = {
  0:    ["oklch(20% 0.014 65)",  "transparent"],
  2:    ["oklch(91% 0.030 88)",  "oklch(32% 0.06 65)"],
  4:    ["oklch(87% 0.065 78)",  "oklch(32% 0.06 65)"],
  8:    ["oklch(75% 0.190 55)",  "oklch(97% 0.01 88)"],
  16:   ["oklch(70% 0.210 40)",  "oklch(97% 0.01 88)"],
  32:   ["oklch(64% 0.230 30)",  "oklch(97% 0.01 88)"],
  64:   ["oklch(58% 0.245 22)",  "oklch(97% 0.01 88)"],
  128:  ["oklch(82% 0.165 88)",  "oklch(28% 0.08 70)"],
  256:  ["oklch(79% 0.185 83)",  "oklch(28% 0.08 70)"],
  512:  ["oklch(76% 0.205 78)",  "oklch(28% 0.08 70)"],
  1024: ["oklch(73% 0.225 73)",  "oklch(22% 0.08 70)"],
  2048: ["oklch(70% 0.255 65)",  "oklch(22% 0.08 70)"],
};

/** Returns [bgColor, textColor] for a tile value. */
export const getTileColors = (v: number): [string, string] =>
  TILE_PALETTE[v] ?? ["oklch(52% 0.275 62)", "oklch(97% 0.01 88)"];

/** Font size (px) for a tile label. */
export const tileFontSize = (v: number): number =>
  v >= 1024 ? 13 : v >= 128 ? 18 : 24;

// ─────────────────────────────────────────────
// Local-storage key
// ─────────────────────────────────────────────

export const LS_KEY = "2048-strategizer-saved";

// ─────────────────────────────────────────────
// Starter strategies
// ─────────────────────────────────────────────

export interface Preset {
  label: string;
  code: string;
}

export const PRESETS: Record<string, Preset> = {
  random: {
    label: "Random",
    code: `function myStrategy({ getLegalMoves }) {
  const moves = getLegalMoves();
  return moves[Math.floor(Math.random() * moves.length)];
}`,
  },
  fixedOrder: {
    label: "Fixed Order",
    code: `function myStrategy() {
  // Always tries up → right → down → left
  return ["up", "right", "down", "left"];
}`,
  },
  cornerSeeker: {
    label: "Corner Seeker",
    code: `function myStrategy({ getBoard, getHighestTile }) {
  const board = getBoard();
  const max = getHighestTile();

  // Keep the largest tile anchored in the top-left corner.
  if (board[0][0] !== max) {
    return ["up", "left", "right", "down"];
  }
  return ["up", "left", "down", "right"];
}`,
  },
  snake: {
    label: "Snake",
    code: `function myStrategy() {
  // Snake traversal: keep tiles in a descending snake path.
  return ["up", "left", "right", "down"];
}`,
  },
};
