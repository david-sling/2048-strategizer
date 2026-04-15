import { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { basicSetup } from "codemirror";
import { EditorView } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { javascript } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";

// ═══════════════════════════════════════════════════════════════
// GAME ENGINE  (number[][] board — used for legal-move checks)
// ═══════════════════════════════════════════════════════════════

function initBoard() {
  let b = Array.from({ length: 4 }, () => Array(4).fill(0));
  b = spawnOnBoard(b);
  b = spawnOnBoard(b);
  return b;
}

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

/** Apply a move to a number[][] board; returns { board, score, changed }. */
function applyMove(board, dir) {
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

function getLegalMoves(board) {
  return ["up", "down", "left", "right"].filter((d) => applyMove(board, d).changed);
}

// ═══════════════════════════════════════════════════════════════
// TILE OBJECTS  { id, value, row, col, isNew, isMerged, animKey }
//
// animKey increments each merge so React remounts the inner <div>,
// forcing the merge-pop CSS animation to replay.
// ═══════════════════════════════════════════════════════════════

function tilesToBoard(tiles) {
  const board = Array.from({ length: 4 }, () => Array(4).fill(0));
  for (const t of tiles) board[t.row][t.col] = t.value;
  return board;
}

function boardToTiles(board, getId) {
  const tiles = [];
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++)
      if (board[r][c] !== 0)
        tiles.push({ id: getId(), value: board[r][c], row: r, col: c,
                     isNew: true, isMerged: false, animKey: 0 });
  return tiles;
}

function spawnTile(tiles, getId) {
  const occ = new Set(tiles.map((t) => `${t.row},${t.col}`));
  const empties = [];
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++)
      if (!occ.has(`${r},${c}`)) empties.push([r, c]);
  if (!empties.length) return tiles;
  const [r, c] = empties[Math.floor(Math.random() * empties.length)];
  return [...tiles, { id: getId(), value: Math.random() < 0.9 ? 2 : 4,
                      row: r, col: c, isNew: true, isMerged: false, animKey: 0 }];
}

/**
 * Apply a move to a tile array.
 * Tracks which tile IDs survive, which merge, and where everyone ends up.
 * Returns { tiles, score, changed }.
 */
function applyMoveTracked(prevTiles, dir, getId) {
  // Build 2-D grids from current tile objects
  const vGrid = Array.from({ length: 4 }, () => Array(4).fill(0));
  const iGrid = Array.from({ length: 4 }, () => Array(4).fill(null));
  for (const t of prevTiles) { vGrid[t.row][t.col] = t.value; iGrid[t.row][t.col] = t.id; }
  const byId = new Map(prevTiles.map((t) => [t.id, t]));

  let totalScore = 0;
  let changed = false;

  const nvGrid = Array.from({ length: 4 }, () => Array(4).fill(0));
  const niGrid = Array.from({ length: 4 }, () => Array(4).fill(null));
  const nmGrid = Array.from({ length: 4 }, () => Array(4).fill(false)); // isMerged

  /** Slide a line of (value, id) pairs toward index 0. */
  function slideLine(vals, ids) {
    const tiles = [];
    for (let i = 0; i < 4; i++) if (vals[i]) tiles.push({ v: vals[i], id: ids[i] });

    const ov = Array(4).fill(0), oi = Array(4).fill(null), om = Array(4).fill(false);
    let score = 0, out = 0, i = 0;

    while (i < tiles.length) {
      if (i + 1 < tiles.length && tiles[i].v === tiles[i + 1].v) {
        ov[out] = tiles[i].v * 2;
        oi[out] = tiles[i].id; // first tile survives, second disappears
        om[out] = true;
        score += tiles[i].v * 2;
        out++; i += 2;
      } else {
        ov[out] = tiles[i].v;
        oi[out] = tiles[i].id;
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
  } else {  // down
    for (let c = 0; c < 4; c++) {
      const cv = [vGrid[3][c], vGrid[2][c], vGrid[1][c], vGrid[0][c]];
      const ci = [iGrid[3][c], iGrid[2][c], iGrid[1][c], iGrid[0][c]];
      const { ov, oi, om } = slideLine(cv, ci);
      for (let i = 0; i < 4; i++) { nvGrid[3-i][c] = ov[i]; niGrid[3-i][c] = oi[i]; nmGrid[3-i][c] = om[i]; }
    }
  }

  // Assemble new tile objects
  const newTiles = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      if (!nvGrid[r][c]) continue;
      const id       = niGrid[r][c];
      const isMerged = nmGrid[r][c];
      const prev     = byId.get(id);
      newTiles.push({
        id,
        value:    nvGrid[r][c],
        row: r, col: c,
        isNew:    false,
        isMerged,
        animKey:  isMerged ? (prev?.animKey ?? 0) + 1 : (prev?.animKey ?? 0),
      });
    }
  }

  return { tiles: newTiles, score: totalScore, changed };
}

// ═══════════════════════════════════════════════════════════════
// STARTER STRATEGIES
// ═══════════════════════════════════════════════════════════════

const PRESETS = {
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

// ═══════════════════════════════════════════════════════════════
// TILE COLORS
// ═══════════════════════════════════════════════════════════════

const TILE_PALETTE = {
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
const getTileColors = (v) => TILE_PALETTE[v] || ["oklch(52% 0.275 62)", "oklch(97% 0.01 88)"];
const tileFontSize  = (v) => (v >= 1024 ? 13 : v >= 128 ? 18 : 24);

// ═══════════════════════════════════════════════════════════════
// LOCAL STORAGE
// ═══════════════════════════════════════════════════════════════

const LS_KEY = "2048-strategizer-saved";
function lsLoad() { try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch { return []; } }
function lsSave(list) { try { localStorage.setItem(LS_KEY, JSON.stringify(list)); } catch {} }

// ═══════════════════════════════════════════════════════════════
// BOARD LAYOUT CONSTANTS
// ═══════════════════════════════════════════════════════════════

const BOARD_PAD = 6;   // px padding inside board wrapper
const TILE_GAP  = 6;   // px gap between tiles

// ═══════════════════════════════════════════════════════════════
// APP
// ═══════════════════════════════════════════════════════════════

export default function App() {
  // ── Tile ID generator (stable ref, never triggers re-render)
  const tileIdRef = useRef(0);
  const getId = useCallback(() => tileIdRef.current++, []);

  // ── Game state
  const tilesRef     = useRef(null);
  const scoreRef     = useRef(0);
  const moveCountRef = useRef(0);

  if (!tilesRef.current) tilesRef.current = boardToTiles(initBoard(), getId);

  const [tiles,     setTiles]     = useState(() => tilesRef.current);
  const [score,     setScore]     = useState(0);
  const [moveCount, setMoveCount] = useState(0);
  const [gameOver,  setGameOver]  = useState(false);

  // ── Runner state
  const [isRunning, setIsRunning] = useState(false);
  const [speed,     setSpeed]     = useState(5);
  const [error,     setError]     = useState(null);
  const intervalRef = useRef(null);

  // ── Strategy state
  const [strategyCode,    setStrategyCode]    = useState(PRESETS.fixedOrder.code);
  const [selectedPreset,  setSelectedPreset]  = useState("fixedOrder");
  const [savedStrategies, setSavedStrategies] = useState(lsLoad);
  const [saveOpen,        setSaveOpen]        = useState(false);
  const [saveName,        setSaveName]        = useState("");
  const strategyCodeRef = useRef(PRESETS.fixedOrder.code);
  useEffect(() => { strategyCodeRef.current = strategyCode; }, [strategyCode]);

  // ── Board pixel width → cell size (responsive)
  const boardWrapRef = useRef(null);
  const [cellSize, setCellSize] = useState(63.5);
  useLayoutEffect(() => {
    if (!boardWrapRef.current) return;
    const update = () => {
      const w = boardWrapRef.current.offsetWidth;
      setCellSize((w - 2 * BOARD_PAD - 3 * TILE_GAP) / 4);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(boardWrapRef.current);
    return () => ro.disconnect();
  }, []);

  const tileX = (col) => BOARD_PAD + col * (cellSize + TILE_GAP);
  const tileY = (row) => BOARD_PAD + row * (cellSize + TILE_GAP);

  // ── CodeMirror
  const editorContainerRef = useRef(null);
  const editorViewRef      = useRef(null);

  useEffect(() => {
    if (!editorContainerRef.current || editorViewRef.current) return;
    const state = EditorState.create({
      doc: strategyCodeRef.current,
      extensions: [
        basicSetup,
        javascript(),
        oneDark,
        EditorView.updateListener.of((u) => {
          if (u.docChanged) {
            const code = u.state.doc.toString();
            setStrategyCode(code);
            strategyCodeRef.current = code;
          }
        }),
        EditorView.theme({
          "&":            { height: "100%", fontSize: "13px" },
          ".cm-editor":   { height: "100%" },
          ".cm-scroller": { overflow: "auto", fontFamily: "'JetBrains Mono','Fira Code',monospace" },
        }),
      ],
    });
    editorViewRef.current = new EditorView({ state, parent: editorContainerRef.current });
    return () => { editorViewRef.current?.destroy(); editorViewRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setEditorCode = useCallback((code) => {
    editorViewRef.current?.dispatch({
      changes: { from: 0, to: editorViewRef.current.state.doc.length, insert: code },
    });
    setStrategyCode(code);
    strategyCodeRef.current = code;
  }, []);

  // ── Core step
  const runStep = useCallback(() => {
    const currentTiles = tilesRef.current;
    const currentScore = scoreRef.current;
    const currentBoard = tilesToBoard(currentTiles);
    const legal        = getLegalMoves(currentBoard);

    if (!legal.length) {
      setGameOver(true); setIsRunning(false); clearInterval(intervalRef.current); return;
    }

    // Compile strategy
    let strategyFn;
    try {
      const code = strategyCodeRef.current.trim().replace(/;\s*$/, "");
      // eslint-disable-next-line no-new-func
      strategyFn = new Function(`return (${code})`)();
      if (typeof strategyFn !== "function") throw new Error("strategy must be a function");
    } catch (e) {
      setError(`Compile error: ${e.message}`); setIsRunning(false); clearInterval(intervalRef.current); return;
    }

    // Execute strategy
    let priorityMoves;
    try {
      const ctx = {
        getValue:       (x, y) => currentBoard[y]?.[x] ?? 0,
        getLegalMoves:  ()     => getLegalMoves(currentBoard),
        getBoard:       ()     => currentBoard.map((r) => [...r]),
        getScore:       ()     => currentScore,
        getEmptyCells:  ()     => {
          const cells = [];
          for (let r = 0; r < 4; r++)
            for (let c = 0; c < 4; c++)
              if (currentBoard[r][c] === 0) cells.push({ x: c, y: r });
          return cells;
        },
        getHighestTile: () => Math.max(0, ...currentBoard.flat()),
      };
      let result = strategyFn(ctx);
      if (typeof result === "string") result = [result];
      if (!Array.isArray(result)) result = ["up", "right", "down", "left"];
      const missing = ["up", "right", "down", "left"].filter((m) => !result.includes(m));
      priorityMoves = [...result, ...missing];
    } catch (e) {
      setError(`Runtime error: ${e.message}`); setIsRunning(false); clearInterval(intervalRef.current); return;
    }

    // Apply move with tile tracking
    const chosen = priorityMoves.find((m) => legal.includes(m)) ?? legal[0];
    const { tiles: moved, score: gained, changed } = applyMoveTracked(currentTiles, chosen, getId);
    if (!changed) return;

    const spawned = spawnTile(moved, getId);

    tilesRef.current   = spawned;
    scoreRef.current   = currentScore + gained;
    moveCountRef.current += 1;

    setTiles(spawned);
    setScore((s) => s + gained);
    setMoveCount((m) => m + 1);
    setError(null);

    if (!getLegalMoves(tilesToBoard(spawned)).length) {
      setGameOver(true); setIsRunning(false); clearInterval(intervalRef.current);
    }
  }, [getId]);

  // ── Auto-play interval
  useEffect(() => {
    if (isRunning) {
      clearInterval(intervalRef.current);
      intervalRef.current = setInterval(runStep, 1000 / speed);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [isRunning, speed, runStep]);

  // ── Reset helper
  const doReset = useCallback(() => {
    clearInterval(intervalRef.current);
    const freshTiles = boardToTiles(initBoard(), getId);
    tilesRef.current  = freshTiles;
    scoreRef.current  = 0;
    moveCountRef.current = 0;
    setTiles(freshTiles);
    setScore(0); setMoveCount(0); setGameOver(false); setError(null); setIsRunning(false);
  }, [getId]);

  const handleRun = () => {
    if (gameOver) {
      clearInterval(intervalRef.current);
      const freshTiles = boardToTiles(initBoard(), getId);
      tilesRef.current = freshTiles; scoreRef.current = 0; moveCountRef.current = 0;
      setTiles(freshTiles); setScore(0); setMoveCount(0); setGameOver(false);
    }
    setError(null); setIsRunning(true);
  };
  const handleStop = () => setIsRunning(false);
  const handleStep = () => {
    setIsRunning(false); clearInterval(intervalRef.current); setError(null);
    setTimeout(runStep, 0);
  };

  // ── Save / delete / load
  const handleSave = () => {
    const name = saveName.trim(); if (!name) return;
    const updated = [...savedStrategies.filter((s) => s.name !== name), { name, code: strategyCode }];
    setSavedStrategies(updated); lsSave(updated); setSaveOpen(false); setSaveName("");
  };
  const handleDelete = (name) => {
    const updated = savedStrategies.filter((s) => s.name !== name);
    setSavedStrategies(updated); lsSave(updated);
  };
  const handleLoadSaved = (code) => { setEditorCode(code); setSelectedPreset(""); };

  const maxTile = Math.max(2, ...tiles.map((t) => t.value));

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { height: 100%; overflow: hidden; }
        body { background: oklch(14% 0.012 65); color: oklch(85% 0.04 75); font-family: 'Space Grotesk', sans-serif; }
        button { cursor: pointer; border: none; font-family: inherit; transition: all 0.12s; }
        select { font-family: inherit; outline: none; cursor: pointer; }
        input  { font-family: inherit; outline: none; }

        .cm-editor   { height: 100% !important; }
        .cm-scroller { overflow: auto !important; }

        ::-webkit-scrollbar       { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: oklch(28% 0.018 65); border-radius: 3px; }

        /* ── Tile animations ── */

        /* New tile: scale up from nothing */
        @keyframes tileSpawn {
          0%   { transform: scale(0.4); opacity: 0.6; }
          60%  { transform: scale(1.08); }
          100% { transform: scale(1); opacity: 1; }
        }

        /* Merge pop: inner face pulses after the slide lands (~80ms delay) */
        @keyframes tileMerge {
          0%   { transform: scale(1); }
          40%  { transform: scale(1.16); }
          100% { transform: scale(1); }
        }

        /* Running dot */
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.2; }
        }

        /* Reduced-motion: kill all tile motion */
        @media (prefers-reduced-motion: reduce) {
          .tile-outer, .tile-face { transition: none !important; animation: none !important; }
        }

        .chip-btn:hover  { background: oklch(24% 0.016 65) !important; color: oklch(85% 0.04 75) !important; }
        .del-btn:hover   { color: oklch(68% 0.18 22) !important; background: oklch(22% 0.05 22) !important; }
        .ctrl-btn:hover:not(:disabled) { filter: brightness(1.12); }
        .reset-btn:hover { background: oklch(23% 0.016 65) !important; color: oklch(80% 0.04 75) !important; }
      `}</style>

      <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>

        {/* ── Header */}
        <header style={{
          height: 50, flexShrink: 0, padding: "0 20px",
          display: "flex", alignItems: "center", gap: 10,
          background: "oklch(16% 0.013 65)",
          borderBottom: "1px solid oklch(22% 0.016 65)",
        }}>
          <div style={{
            width: 26, height: 26, borderRadius: 5,
            background: "oklch(75% 0.18 75)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 700, color: "oklch(14% 0.012 65)",
            letterSpacing: "-0.04em", userSelect: "none",
          }}>2k</div>
          <span style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-0.025em" }}>
            2048 <span style={{ color: "oklch(75% 0.18 75)" }}>Strategizer</span>
          </span>
          <span style={{ marginLeft: "auto", fontSize: 11, color: "oklch(38% 0.020 65)", letterSpacing: "0.08em" }}>
            WRITE · RUN · CONQUER
          </span>
        </header>

        {/* ── Error banner */}
        {error && (
          <div style={{
            flexShrink: 0, padding: "8px 20px",
            background: "oklch(18% 0.04 22)", borderBottom: "1px solid oklch(30% 0.10 22)",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{ color: "oklch(68% 0.17 22)", fontSize: 13 }}>⚠</span>
            <code style={{ flex: 1, fontSize: 12, color: "oklch(74% 0.14 22)", fontFamily: "monospace" }}>{error}</code>
            <button onClick={() => setError(null)} style={{ background: "none", color: "oklch(48% 0.10 22)", fontSize: 15 }}>✕</button>
          </div>
        )}

        {/* ── Two-column layout */}
        <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "1fr 312px", overflow: "hidden" }}>

          {/* ════ LEFT: Editor Panel ════ */}
          <div style={{
            display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden",
            borderRight: "1px solid oklch(22% 0.016 65)",
          }}>
            {/* Toolbar */}
            <div style={{
              flexShrink: 0, padding: "8px 12px",
              background: "oklch(16% 0.013 65)", borderBottom: "1px solid oklch(22% 0.016 65)",
              display: "flex", alignItems: "center", gap: 7,
            }}>
              <select value={selectedPreset} onChange={(e) => { setSelectedPreset(e.target.value); if (PRESETS[e.target.value]) setEditorCode(PRESETS[e.target.value].code); }}
                style={{ background: "oklch(21% 0.015 65)", color: "oklch(78% 0.04 75)", border: "1px solid oklch(28% 0.018 65)", borderRadius: 5, padding: "5px 9px", fontSize: 12 }}>
                <option value="">— Presets —</option>
                {Object.entries(PRESETS).map(([k, { label }]) => <option key={k} value={k}>{label}</option>)}
              </select>

              {savedStrategies.length > 0 && (
                <select defaultValue="" onChange={(e) => { const s = savedStrategies.find((s) => s.name === e.target.value); if (s) { handleLoadSaved(s.code); e.target.value = ""; } }}
                  style={{ background: "oklch(21% 0.015 65)", color: "oklch(78% 0.04 75)", border: "1px solid oklch(28% 0.018 65)", borderRadius: 5, padding: "5px 9px", fontSize: 12 }}>
                  <option value="" disabled>Load saved…</option>
                  {savedStrategies.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
                </select>
              )}

              <div style={{ flex: 1 }} />
              <button onClick={() => { setSaveOpen((o) => !o); setSaveName(""); }}
                style={{ background: saveOpen ? "oklch(75% 0.18 75)" : "oklch(21% 0.015 65)", color: saveOpen ? "oklch(14% 0.012 65)" : "oklch(72% 0.04 75)", border: "1px solid oklch(28% 0.018 65)", borderRadius: 5, padding: "5px 13px", fontSize: 12, fontWeight: 500 }}>
                Save
              </button>
            </div>

            {/* Save name input */}
            {saveOpen && (
              <div style={{ flexShrink: 0, padding: "8px 12px", background: "oklch(17% 0.013 65)", borderBottom: "1px solid oklch(22% 0.016 65)", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, color: "oklch(46% 0.022 65)", whiteSpace: "nowrap" }}>Save as</span>
                <input type="text" value={saveName} onChange={(e) => setSaveName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setSaveOpen(false); }} placeholder="Strategy name…" autoFocus
                  style={{ flex: 1, background: "oklch(13% 0.010 65)", color: "oklch(85% 0.04 75)", border: "1px solid oklch(28% 0.018 65)", borderRadius: 4, padding: "5px 9px", fontSize: 12 }} />
                <button onClick={handleSave} style={{ background: "oklch(75% 0.18 75)", color: "oklch(14% 0.012 65)", borderRadius: 4, padding: "5px 13px", fontSize: 12, fontWeight: 600 }}>↵ Save</button>
                <button onClick={() => setSaveOpen(false)} style={{ background: "oklch(21% 0.015 65)", color: "oklch(58% 0.030 65)", border: "1px solid oklch(28% 0.018 65)", borderRadius: 4, padding: "5px 10px", fontSize: 12 }}>Cancel</button>
              </div>
            )}

            {/* Saved strategy chips */}
            {savedStrategies.length > 0 && (
              <div style={{ flexShrink: 0, padding: "6px 12px", borderBottom: "1px solid oklch(22% 0.016 65)", background: "oklch(15% 0.012 65)", display: "flex", flexWrap: "wrap", gap: 5 }}>
                {savedStrategies.map((s) => (
                  <div key={s.name} style={{ display: "flex", alignItems: "center", background: "oklch(20% 0.014 65)", border: "1px solid oklch(26% 0.017 65)", borderRadius: 4, overflow: "hidden" }}>
                    <button className="chip-btn" onClick={() => handleLoadSaved(s.code)} style={{ background: "none", color: "oklch(72% 0.04 75)", padding: "3px 9px", fontSize: 11, fontWeight: 500 }}>{s.name}</button>
                    <button className="del-btn" onClick={() => handleDelete(s.name)} title={`Delete "${s.name}"`} style={{ background: "none", color: "oklch(40% 0.07 22)", padding: "3px 7px 3px 4px", fontSize: 13, lineHeight: 1 }}>×</button>
                  </div>
                ))}
              </div>
            )}

            {/* CodeMirror */}
            <div ref={editorContainerRef} style={{ flex: 1, minHeight: 0, overflow: "hidden" }} />

            {/* Controls bar */}
            <div style={{ flexShrink: 0, padding: "10px 12px", background: "oklch(16% 0.013 65)", borderTop: "1px solid oklch(22% 0.016 65)", display: "flex", alignItems: "center", gap: 8 }}>
              <button className="ctrl-btn" onClick={handleRun} disabled={isRunning}
                style={{ background: isRunning ? "oklch(48% 0.11 75)" : "oklch(75% 0.18 75)", color: "oklch(14% 0.012 65)", padding: "7px 17px", borderRadius: 5, fontSize: 13, fontWeight: 600, opacity: isRunning ? 0.55 : 1 }}>▶ Run</button>
              <button className="ctrl-btn" onClick={handleStep} disabled={isRunning || gameOver}
                style={{ background: "oklch(21% 0.015 65)", color: (isRunning || gameOver) ? "oklch(38% 0.020 65)" : "oklch(78% 0.04 75)", border: "1px solid oklch(27% 0.017 65)", padding: "7px 13px", borderRadius: 5, fontSize: 13, fontWeight: 500 }}>→ Step</button>
              <button className="ctrl-btn" onClick={handleStop} disabled={!isRunning}
                style={{ background: "oklch(21% 0.015 65)", color: !isRunning ? "oklch(38% 0.020 65)" : "oklch(68% 0.12 25)", border: "1px solid oklch(27% 0.017 65)", padding: "7px 13px", borderRadius: 5, fontSize: 13, fontWeight: 500 }}>■ Stop</button>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 11, color: "oklch(46% 0.022 65)", minWidth: 36, textAlign: "right" }}>{speed}×/s</span>
              <input type="range" min={1} max={50} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} style={{ width: 88, accentColor: "oklch(75% 0.18 75)" }} />
            </div>
          </div>

          {/* ════ RIGHT: Game Panel ════ */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "16px 14px", gap: 12, overflowY: "auto", background: "oklch(14% 0.012 65)" }}>

            {/* Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 7, width: "100%" }}>
              {[["SCORE", score.toLocaleString()], ["MOVES", moveCount.toLocaleString()], ["BEST", maxTile.toLocaleString()]].map(([label, val]) => (
                <div key={label} style={{ background: "oklch(18% 0.014 65)", border: "1px solid oklch(24% 0.016 65)", borderRadius: 8, padding: "9px 6px", textAlign: "center" }}>
                  <div style={{ fontSize: 9, letterSpacing: "0.10em", color: "oklch(40% 0.020 65)", marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "oklch(75% 0.18 75)" }}>{val}</div>
                </div>
              ))}
            </div>

            {/* ── Animated Board ── */}
            <div style={{ position: "relative", width: "100%" }}>
              {/*
                boardWrapRef gives us the pixel width for cell-size calculations.
                The outer div is the coloured backing; tiles are absolutely layered on top.
              */}
              <div
                ref={boardWrapRef}
                style={{
                  position: "relative",
                  width: "100%",
                  aspectRatio: "1 / 1",
                  background: "oklch(20% 0.015 65)",
                  borderRadius: 10,
                  border: "1px solid oklch(25% 0.017 65)",
                  overflow: "hidden",
                }}
              >
                {/* Empty cell backdrop grid */}
                {Array.from({ length: 16 }, (_, i) => {
                  const r = Math.floor(i / 4), c = i % 4;
                  return (
                    <div key={i} style={{
                      position: "absolute",
                      left: tileX(c), top: tileY(r),
                      width: cellSize, height: cellSize,
                      background: "oklch(17% 0.013 65)",
                      borderRadius: 6,
                    }} />
                  );
                })}

                {/*
                  Animated tiles.
                  Two-div pattern:
                    outer (.tile-outer) — carries position via CSS transform + transition
                    inner (.tile-face)  — carries background/color + spawn/merge animations

                  Key strategy:
                    outer keyed by tile.id → React reuses the DOM node across moves,
                      so the transform transition fires smoothly
                    inner keyed by `${id}-${animKey}` → React remounts it when animKey
                      increments (on merge), retriggering the CSS animation
                */}
                {tiles.map((tile) => {
                  const [bg, fg] = getTileColors(tile.value);
                  const x = tileX(tile.col);
                  const y = tileY(tile.row);
                  return (
                    <div
                      key={tile.id}
                      className="tile-outer"
                      style={{
                        position: "absolute",
                        left: 0, top: 0,
                        width: cellSize, height: cellSize,
                        // GPU-accelerated move: only transform transitions
                        transform: `translate(${x}px, ${y}px)`,
                        transition: tile.isNew
                          ? "none"
                          : "transform 110ms cubic-bezier(0.25, 1, 0.5, 1)",
                        zIndex: tile.isMerged || tile.isNew ? 2 : 1,
                        willChange: "transform",
                      }}
                    >
                      <div
                        key={`${tile.id}-${tile.animKey}`}
                        className="tile-face"
                        style={{
                          width: "100%", height: "100%",
                          background: bg,
                          color: fg,
                          borderRadius: 6,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontWeight: 700,
                          fontSize: tileFontSize(tile.value),
                          userSelect: "none",
                          // Spawn: pop in from nothing
                          // Merge: scale-pulse, delayed until after the slide lands
                          animation: tile.isNew
                            ? "tileSpawn 180ms cubic-bezier(0.25, 1, 0.5, 1) both"
                            : tile.isMerged
                              ? "tileMerge 200ms cubic-bezier(0.25, 1, 0.5, 1) 90ms both"
                              : "none",
                        }}
                      >
                        {tile.value}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Game-over overlay */}
              {gameOver && (
                <div style={{
                  position: "absolute", inset: 0,
                  background: "oklch(10% 0.010 65 / 0.88)",
                  backdropFilter: "blur(6px)", borderRadius: 10,
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10,
                }}>
                  <span style={{ fontSize: 20, fontWeight: 700 }}>Game Over</span>
                  <span style={{ fontSize: 12, color: "oklch(48% 0.022 65)" }}>{score.toLocaleString()} pts · {moveCount} moves</span>
                  <button onClick={handleRun} style={{ background: "oklch(75% 0.18 75)", color: "oklch(14% 0.012 65)", padding: "7px 18px", borderRadius: 5, fontSize: 13, fontWeight: 600, marginTop: 4 }}>▶ Run Again</button>
                </div>
              )}
            </div>

            {/* Reset */}
            <button className="reset-btn" onClick={doReset}
              style={{ width: "100%", background: "oklch(18% 0.014 65)", color: "oklch(52% 0.030 65)", border: "1px solid oklch(24% 0.016 65)", borderRadius: 6, padding: "8px", fontSize: 12, fontWeight: 500 }}>
              ↺ Reset
            </button>

            {/* Running indicator */}
            {isRunning && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "oklch(60% 0.10 75)" }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: "oklch(75% 0.18 75)", display: "inline-block", animation: "pulse 1.2s ease-in-out infinite" }} />
                {speed} move{speed !== 1 ? "s" : ""}/sec
              </div>
            )}

            {/* API reference */}
            <div style={{ marginTop: "auto", width: "100%", padding: "11px 12px", background: "oklch(17% 0.013 65)", border: "1px solid oklch(22% 0.016 65)", borderRadius: 8 }}>
              <div style={{ fontSize: 9, letterSpacing: "0.10em", color: "oklch(38% 0.019 65)", marginBottom: 7 }}>STRATEGY API</div>
              <code style={{ display: "block", lineHeight: 1.9, fontSize: 10, color: "oklch(52% 0.035 65)", fontFamily: "'JetBrains Mono','Fira Code',monospace" }}>
                {`getValue(x, y)\ngetLegalMoves()\ngetBoard()\ngetScore()\ngetEmptyCells()\ngetHighestTile()`}
              </code>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
