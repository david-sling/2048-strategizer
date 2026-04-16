# 2048 Strategizer — CLAUDE.md

## Project Overview

A web app where users write JavaScript strategy functions that autonomously play 2048.
The user does **not** play directly — they write an algorithm, hit Run, and watch it go.

---

## Tech Stack

- **React 19 + TypeScript** — all state management
- **Vite** — build tool and dev server
- **CodeMirror 6** — syntax-highlighted, line-numbered code editor
  - `@codemirror/lang-javascript` for JS highlighting
  - `@codemirror/theme-one-dark` for dark theme
- **Space Grotesk** (Google Fonts) — UI font; JetBrains Mono for code
- **OKLCH colour palette** — warm amber tile colours, dark background
- No backend. Everything runs client-side.

---

## File Structure

```
2048-strategizer/
├── CLAUDE.md
├── src/
│   ├── main.tsx          ← React entry point
│   ├── App.tsx           ← Root component; wires hooks together, owns UI only
│   ├── engine.ts         ← Pure 2048 game logic (no React, no side-effects)
│   ├── prng.ts           ← Seeded PRNG (mulberry32) + seed utilities
│   ├── constants.ts      ← Design tokens, tile colours, preset strategies
│   ├── useGameLoop.ts    ← Game state + run/step/stop/reset loop
│   ├── useEditor.ts      ← CodeMirror 6 editor hook
│   └── useStorage.ts     ← localStorage persistence for saved strategies
├── index.html
├── vite.config.ts
└── package.json
```

---

## Strategy API

The user's function is executed each turn. It receives a context object:

```js
function myStrategy({ getValue, getLegalMoves, getBoard, getScore, getEmptyCells, getHighestTile }) {
  // getValue(x, y)    → number (tile value at col x, row y, 0-indexed). 0 = empty.
  // getLegalMoves()   → string[]  e.g. ["up", "left", "right"]
  // getBoard()        → number[][] — board[row][col]
  // getScore()        → number
  // getEmptyCells()   → {x, y}[] — all empty cell positions
  // getHighestTile()  → number — current max tile

  return ["up", "right", "down", "left"]; // priority order
}
```

**Return value rules:**
- Return a string array of moves in priority order: `["up", "right", "down", "left"]`
- Can be partial: `["up", "right"]` — missing moves are appended in default order
- Can be a single string: `"up"` — treated as `["up"]` then padded
- The engine tries moves in order until a legal one is found, then applies it
- If no move in the list is legal, it falls back to any available legal move

**Valid move strings:** `"up"`, `"down"`, `"left"`, `"right"`

---

## Game Engine (`engine.ts`)

Standard 2048 rules:
- N×N grid (configurable; default 4, options: 3/4/5/6/8)
- Tiles slide and merge in the chosen direction
- After each valid move, a new tile spawns: 2 (90% chance) or 4 (10% chance), in a random empty cell
- Game over when no legal moves remain
- Merging two tiles of value N scores N×2 points

Coordinate system: `getValue(x, y)` where x = column (0=left), y = row (0=top).

All spawn functions (`spawnOnBoard`, `spawnTile`, `initBoard`, `freshTiles`) accept
an `rng: () => number` parameter — **never call `Math.random()` directly in engine.ts**.

---

## Seeded PRNG (`prng.ts`)

All randomness goes through a seeded PRNG so every game is fully reproducible.

```ts
mulberry32(seed: number): () => number   // create a seeded RNG instance
randomSeed(): number                     // generate a random 32-bit seed
seedToHex(seed: number): string          // e.g. 3735928559 → "0xDEADBEEF"
hexToSeed(hex: string): number | null    // parse hex input; null if invalid
```

**Algorithm:** Mulberry32 — fast, deterministic, 32-bit.

**Reproducibility contract:** given the same `seed + strategy code + grid size`,
the full game sequence (every spawn location, every tile value, every move) is
identical. This is the foundation for leaderboard verification.

**RNG call sequence per game:**
- Game init: 4 calls (2 tiles × 2 calls each — one for position, one for value)
- Each subsequent spawn: 2 calls (position index, then 2-vs-4)

---

## UI Layout

```
┌─────────────────────────────────────────────────────┐
│  Header: "2048 Strategizer"                         │
├──────────────────────────┬──────────────────────────┤
│  Presets dropdown        │  Score | Moves | Best    │
│  Saved strategy chips    │  Grid size selector      │
│  CodeMirror editor       │  Animated board          │
│                          │                          │
│  [Run ▶] [Step →] [Stop] │  SEED [0xDEADBEEF] [⟳]  │
│  Speed: [━━●━━━━] 10×/s  │  [↺ Reset]               │
└──────────────────────────┴──────────────────────────┘
```

- **Left panel:** CodeMirror editor with starter strategy pre-loaded
- **Right panel:** Animated board + stats + seed control
- **Controls:** Run (auto-play), Step (one move), Stop, Reset
- **Speed slider:** Controls moves per second (1–50)
- **Seed input:** Editable hex string; `⟳` randomises; applied on Reset or Run
- **Responsive:** Mobile uses sliding tab panels (Code / Board)

---

## Seed UI Behaviour

- On app load: a random seed is generated and shown in the input as `0xXXXXXXXX`
- User can edit the hex input freely; invalid input turns red but doesn't break anything
- Clicking **Reset** or **Run** (when game over): parses the input and applies it
  - Valid hex → use that seed (reproducible game)
  - Empty or invalid → generate a fresh random seed
- `⟳` button: populates the input with a new random seed (does not reset immediately)
- When the hook assigns a new seed (e.g. grid size change), the input syncs automatically

---

## Starter Strategies (`constants.ts`)

Users can pick from a dropdown:

1. **Random** — picks a random legal move each turn
2. **Fixed Order** — always tries `up → right → down → left`
3. **Corner Seeker** — keeps highest tile in top-left; prefers up and left
4. **Snake** — snake/zigzag traversal pattern

---

## Execution Model

- Strategy function is sandboxed via `new Function(...)` — never `eval` on the global scope
- The runner uses `setInterval` for auto-play (speed = moves/sec from slider)
- Step mode calls the strategy once and applies one move
- Error handling: if the strategy throws, show an error banner and stop execution; don't crash the app
- Strategy is re-compiled on each "Run" click (not on every keystroke)

---

## State Shape

```ts
// useGameLoop exposes:
{
  tiles: Tile[],           // positioned tile objects with animation flags
  score: number,
  moveCount: number,
  gameOver: boolean,
  isRunning: boolean,
  speed: number,           // moves per second
  error: string | null,    // runtime error message
  seed: number,            // active seed for current game (32-bit integer)
  // controls:
  run: (newSeed?: number) => void,
  step: () => void,
  stop: () => void,
  reset: (newSeed?: number) => void,
  setSpeed: Dispatch<SetStateAction<number>>,
}
```

---

## Key Implementation Notes

- **Tile identity:** tiles have stable numeric IDs across moves, enabling smooth CSS
  `transform: translate(...)` slide animations. Merged tiles bump `animKey` to replay the
  merge keyframe without remounting the outer element.
- **Seeded spawns:** `rngRef` (a `useRef`) holds the live PRNG instance. It is recreated
  from the seed on every `reset()` call. `step()` passes `rngRef.current` to `spawnTile`.
- **Grid size:** configurable (3/4/5/6/8). Changing it generates a new random seed and
  resets the game immediately.
- **CodeMirror:** initialised once on mount via `useRef`; content updates use
  `EditorView.dispatch` with a full-document replacement.
- **Game loop interval:** stored in a `useRef` so it never triggers re-renders.
- **Tile colours:** OKLCH warm amber palette defined in `constants.ts → TILE_PALETTE`.

---

## Leaderboard (planned)

The seed-based system is designed to support a verifiable leaderboard. Planned columns:

| seed | algorithm (code) | score | maxTile | moveCount | gridSize |
|------|-----------------|-------|---------|-----------|----------|

Given `seed + algorithm + gridSize`, any client can replay the run and confirm
`score` and `maxTile` match — no trust required.

**Not yet built:**
- ~~Leaderboard UI~~ — pending
- ~~Strategy sharing via URL~~ — deferred
- ~~Multi-run averaging~~ — deferred
- ~~Replay mode~~ — deferred
