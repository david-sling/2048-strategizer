# 2048 Strategizer — CLAUDE.md

## Project Overview

A web app where users write JavaScript strategy functions that autonomously play 2048.
The user does **not** play directly — they write an algorithm, hit Run, and watch it go.

The output is a **single JSX file** (`App.jsx`) that runs as a React app.

---

## Tech Stack

- **React** (JSX, hooks) — all state management
- **CodeMirror 6** — syntax-highlighted, line-numbered code editor (via CDN or npm)
  - Use `@codemirror/lang-javascript` for JS highlighting
  - Theme: One Dark or similar dark theme
- **Tailwind CSS** — utility styling (CDN)
- No backend. Everything runs client-side.

---

## File Structure

```
2048-strategizer/
├── CLAUDE.md          ← this file
└── App.jsx            ← the entire app
```

---

## Strategy API

The user's function is executed each turn. It receives a context object:

```js
function myStrategy({ getValue, getLegalMoves, getBoard, getScore, getEmptyCells, getHighestTile }) {
  // getValue(x, y)    → number (tile value at col x, row y, 0-indexed). 0 = empty.
  // getLegalMoves()   → string[]  e.g. ["up", "left", "right"]
  // getBoard()        → number[][] — 4x4 grid, board[row][col]
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

## Game Engine

Standard 2048 rules:
- 4×4 grid
- Tiles slide and merge in the chosen direction
- After each valid move, a new tile spawns: 2 (90% chance) or 4 (10% chance), in a random empty cell
- Game over when no legal moves remain
- Merging two tiles of value N scores N×2 points

Coordinate system: `getValue(x, y)` where x = column (0=left), y = row (0=top).

---

## UI Layout

```
┌─────────────────────────────────────────────────────┐
│  Header: "2048 Strategizer"                         │
├──────────────────────────┬──────────────────────────┤
│  Code Editor (CodeMirror)│  Game Board (4×4 grid)   │
│                          │  Score | Moves | Max Tile │
│                          │                          │
│  [Run ▶] [Step →] [Stop] │  [Reset]                 │
│  Speed: [━━●━━━━] 10x    │                          │
└──────────────────────────┴──────────────────────────┘
```

- **Left panel:** CodeMirror editor with starter strategy pre-loaded
- **Right panel:** Animated 2048 board + stats
- **Controls:** Run (auto-play), Step (one move at a time), Stop, Reset
- **Speed slider:** Controls moves per second (1–50)

---

## Starter Strategies (pre-loaded examples)

Users can pick from a dropdown to load example strategies into the editor:

1. **Random** — picks a random legal move each turn
2. **Fixed Order** — always tries `up → right → down → left`
3. **Corner Seeker** — tries to keep the highest tile in a corner; prefers up and left
4. **Snake** — attempts a snake/zigzag traversal pattern

---

## Execution Model

- Strategy function is sandboxed via `new Function(...)` — never `eval` on the global scope
- The runner uses `setInterval` for auto-play (speed = moves/sec from slider)
- Step mode calls the strategy once and applies one move
- Error handling: if the strategy throws, show an error banner and stop execution; don't crash the app

---

## State Shape (React)

```js
{
  board: number[][],       // 4×4 grid, board[row][col]
  score: number,
  moveCount: number,
  gameOver: boolean,
  isRunning: boolean,
  speed: number,           // moves per second
  strategyCode: string,    // current code in editor
  error: string | null,    // runtime error message
}
```

---

## Key Implementation Notes

- Tile merges: each tile can only merge once per move (track with a `merged` flag during slide)
- New tile spawn: use `Math.random()` — 0.9 → value 2, else value 4
- Animating tiles: CSS transitions on `transform: translate(...)` using tile position keys
- CodeMirror setup: initialize once on mount using a `useRef`, update value via `EditorView.dispatch`
- Strategy is re-compiled on each "Run" click (not on every keystroke)
- Keep the game loop in a `useRef` (interval ID) so it doesn't trigger re-renders

---

## What NOT to Build Yet

- ~~Leaderboard~~ — deferred
- ~~Strategy sharing via URL~~ — deferred
- ~~Multi-run averaging~~ — deferred
- ~~Replay mode~~ — deferred
