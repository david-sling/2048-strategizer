/**
 * 2048 Strategizer — App.jsx
 *
 * Required dependencies (npm install):
 *   codemirror @codemirror/state @codemirror/view
 *   @codemirror/lang-javascript @codemirror/theme-one-dark
 *
 * Or with a package.json:
 *   "codemirror": "^6",
 *   "@codemirror/lang-javascript": "^6",
 *   "@codemirror/theme-one-dark": "^6"
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { basicSetup } from "codemirror";
import { EditorView } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { javascript } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";

// ═══════════════════════════════════════════════════════════════
// GAME ENGINE
// ═══════════════════════════════════════════════════════════════

function spawnTile(board) {
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

function initBoard() {
  let board = Array.from({ length: 4 }, () => Array(4).fill(0));
  board = spawnTile(board);
  board = spawnTile(board);
  return board;
}

/** Slide a single line toward index 0, merging equal adjacent tiles. */
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
      // changed check already done inside slide() against the reversed orig —
      // redo it against actual original order
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
  return ["up", "down", "left", "right"].filter(
    (d) => applyMove(board, d).changed
  );
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
  // If it's already there, hug the top-left edges.
  if (board[0][0] !== max) {
    return ["up", "left", "right", "down"];
  }
  return ["up", "left", "down", "right"];
}`,
  },
  snake: {
    label: "Snake",
    code: `function myStrategy({ getBoard, getHighestTile }) {
  // Snake traversal: keep tiles in a descending snake path
  //   row 0: left → right (largest values)
  //   row 1: right → left
  //   row 2: left → right ...
  // Drive tiles toward the top and keep the snake flowing.
  return ["up", "left", "right", "down"];
}`,
  },
};

// ═══════════════════════════════════════════════════════════════
// TILE COLORS  (warm amber palette, avoids generic AI neon)
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
const getTileColors = (v) =>
  TILE_PALETTE[v] || ["oklch(52% 0.275 62)", "oklch(97% 0.01 88)"];

const tileFontSize = (v) => (v >= 1024 ? 14 : v >= 128 ? 19 : 25);

// ═══════════════════════════════════════════════════════════════
// LOCAL STORAGE  helpers
// ═══════════════════════════════════════════════════════════════

const LS_KEY = "2048-strategizer-saved";

function lsLoad() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); }
  catch { return []; }
}
function lsSave(list) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(list)); }
  catch { /* quota exceeded – silently ignore */ }
}

// ═══════════════════════════════════════════════════════════════
// APP
// ═══════════════════════════════════════════════════════════════

export default function App() {
  // ── Game state (refs hold authoritative values for the tight loop)
  const boardRef     = useRef(initBoard());
  const scoreRef     = useRef(0);
  const moveCountRef = useRef(0);

  const [board,     setBoard]     = useState(boardRef.current);
  const [score,     setScore]     = useState(0);
  const [moveCount, setMoveCount] = useState(0);
  const [gameOver,  setGameOver]  = useState(false);

  // ── Runner state
  const [isRunning, setIsRunning] = useState(false);
  const [speed,     setSpeed]     = useState(5);
  const [error,     setError]     = useState(null);
  const intervalRef = useRef(null);

  // ── Strategy / editor state
  const [strategyCode,    setStrategyCode]    = useState(PRESETS.fixedOrder.code);
  const [selectedPreset,  setSelectedPreset]  = useState("fixedOrder");
  const [savedStrategies, setSavedStrategies] = useState(lsLoad);
  const [saveOpen,        setSaveOpen]        = useState(false);
  const [saveName,        setSaveName]        = useState("");

  // Keep a ref to latest code so the interval callback never goes stale
  const strategyCodeRef = useRef(PRESETS.fixedOrder.code);
  useEffect(() => { strategyCodeRef.current = strategyCode; }, [strategyCode]);

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
          "&":           { height: "100%", fontSize: "13px" },
          ".cm-editor":  { height: "100%" },
          ".cm-scroller":{ overflow: "auto", fontFamily: "'JetBrains Mono','Fira Code',monospace" },
        }),
      ],
    });
    editorViewRef.current = new EditorView({
      state,
      parent: editorContainerRef.current,
    });
    return () => {
      editorViewRef.current?.destroy();
      editorViewRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Replace editor contents programmatically (preset / load saved). */
  const setEditorCode = useCallback((code) => {
    if (editorViewRef.current) {
      editorViewRef.current.dispatch({
        changes: {
          from: 0,
          to: editorViewRef.current.state.doc.length,
          insert: code,
        },
      });
    }
    setStrategyCode(code);
    strategyCodeRef.current = code;
  }, []);

  // ── Core step: compile → run strategy → apply move
  const runStep = useCallback(() => {
    const currentBoard = boardRef.current;
    const currentScore = scoreRef.current;
    const legal        = getLegalMoves(currentBoard);

    if (!legal.length) {
      setGameOver(true);
      setIsRunning(false);
      clearInterval(intervalRef.current);
      return;
    }

    // Compile
    let strategyFn;
    try {
      const code = strategyCodeRef.current.trim().replace(/;\s*$/, "");
      // eslint-disable-next-line no-new-func
      strategyFn = new Function(`return (${code})`)();
      if (typeof strategyFn !== "function") throw new Error("strategy must be a function");
    } catch (e) {
      setError(`Compile error: ${e.message}`);
      setIsRunning(false);
      clearInterval(intervalRef.current);
      return;
    }

    // Execute
    let priorityMoves;
    try {
      const ctx = {
        getValue:      (x, y) => currentBoard[y]?.[x] ?? 0,
        getLegalMoves: ()      => getLegalMoves(currentBoard),
        getBoard:      ()      => currentBoard.map((r) => [...r]),
        getScore:      ()      => currentScore,
        getEmptyCells: ()      => {
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
      const DEFAULT_ORDER = ["up", "right", "down", "left"];
      const missing = DEFAULT_ORDER.filter((m) => !result.includes(m));
      priorityMoves = [...result, ...missing];
    } catch (e) {
      setError(`Runtime error: ${e.message}`);
      setIsRunning(false);
      clearInterval(intervalRef.current);
      return;
    }

    // Apply
    const chosen = priorityMoves.find((m) => legal.includes(m)) ?? legal[0];
    const { board: moved, score: gained } = applyMove(currentBoard, chosen);
    const spawned = spawnTile(moved);

    boardRef.current      = spawned;
    scoreRef.current      = currentScore + gained;
    moveCountRef.current += 1;

    setBoard(spawned);
    setScore((s) => s + gained);
    setMoveCount((m) => m + 1);
    setError(null);

    if (!getLegalMoves(spawned).length) {
      setGameOver(true);
      setIsRunning(false);
      clearInterval(intervalRef.current);
    }
  }, []);

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

  // ── Control handlers
  const doReset = useCallback(() => {
    clearInterval(intervalRef.current);
    const fresh = initBoard();
    boardRef.current      = fresh;
    scoreRef.current      = 0;
    moveCountRef.current  = 0;
    setBoard(fresh);
    setScore(0);
    setMoveCount(0);
    setGameOver(false);
    setError(null);
    setIsRunning(false);
  }, []);

  const handleRun = () => {
    if (gameOver) {
      // Reset refs inline (can't await doReset state batching)
      clearInterval(intervalRef.current);
      const fresh = initBoard();
      boardRef.current      = fresh;
      scoreRef.current      = 0;
      moveCountRef.current  = 0;
      setBoard(fresh);
      setScore(0);
      setMoveCount(0);
      setGameOver(false);
    }
    setError(null);
    setIsRunning(true);
  };
  const handleStop = () => setIsRunning(false);
  const handleStep = () => {
    setIsRunning(false);
    clearInterval(intervalRef.current);
    setError(null);
    // Wait one tick so isRunning=false state is flushed before step runs
    setTimeout(runStep, 0);
  };

  // ── Save / delete / load strategies
  const handleSave = () => {
    const name = saveName.trim();
    if (!name) return;
    const updated = [
      ...savedStrategies.filter((s) => s.name !== name),
      { name, code: strategyCode },
    ];
    setSavedStrategies(updated);
    lsSave(updated);
    setSaveOpen(false);
    setSaveName("");
  };

  const handleDelete = (name) => {
    const updated = savedStrategies.filter((s) => s.name !== name);
    setSavedStrategies(updated);
    lsSave(updated);
  };

  const handleLoadSaved = (code) => {
    setEditorCode(code);
    setSelectedPreset("");
  };

  const maxTile = Math.max(2, ...board.flat());

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { height: 100%; overflow: hidden; }
        body {
          background: oklch(14% 0.012 65);
          color: oklch(85% 0.04 75);
          font-family: 'Space Grotesk', sans-serif;
        }
        button  { cursor: pointer; border: none; font-family: inherit; transition: all 0.12s; }
        select  { font-family: inherit; outline: none; cursor: pointer; }
        input   { font-family: inherit; outline: none; }

        /* CodeMirror height fix */
        .cm-editor  { height: 100% !important; }
        .cm-scroller{ overflow: auto !important; }

        /* Scrollbar */
        ::-webkit-scrollbar       { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: oklch(28% 0.018 65); border-radius: 3px; }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.2; }
        }
        @keyframes popIn {
          0%   { transform: scale(0.55); opacity: 0; }
          65%  { transform: scale(1.08); opacity: 1; }
          100% { transform: scale(1);    opacity: 1; }
        }

        .tile-new { animation: popIn 0.18s ease-out both; }

        .chip-btn:hover  { background: oklch(24% 0.016 65) !important; color: oklch(85% 0.04 75) !important; }
        .del-btn:hover   { color: oklch(68% 0.18 22) !important; background: oklch(22% 0.05 22) !important; }
        .ctrl-btn:hover:not(:disabled) { filter: brightness(1.12); }
        .reset-btn:hover { background: oklch(23% 0.016 65) !important; color: oklch(80% 0.04 75) !important; }
      `}</style>

      <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>

        {/* ── Header ── */}
        <header style={{
          height: 50, flexShrink: 0,
          padding: "0 20px",
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
            2048{" "}
            <span style={{ color: "oklch(75% 0.18 75)" }}>Strategizer</span>
          </span>

          <span style={{
            marginLeft: "auto", fontSize: 11,
            color: "oklch(38% 0.020 65)", letterSpacing: "0.08em",
          }}>
            WRITE · RUN · CONQUER
          </span>
        </header>

        {/* ── Error banner ── */}
        {error && (
          <div style={{
            flexShrink: 0, padding: "8px 20px",
            background: "oklch(18% 0.04 22)",
            borderBottom: "1px solid oklch(30% 0.10 22)",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{ color: "oklch(68% 0.17 22)", fontSize: 13 }}>⚠</span>
            <code style={{ flex: 1, fontSize: 12, color: "oklch(74% 0.14 22)", fontFamily: "monospace" }}>
              {error}
            </code>
            <button
              onClick={() => setError(null)}
              style={{ background: "none", color: "oklch(48% 0.10 22)", fontSize: 15, lineHeight: 1 }}
            >✕</button>
          </div>
        )}

        {/* ── Main two-column layout ── */}
        <div style={{
          flex: 1, minHeight: 0,
          display: "grid", gridTemplateColumns: "1fr 312px", overflow: "hidden",
        }}>

          {/* ════════════════════════════════════════════
              LEFT: Editor Panel
          ════════════════════════════════════════════ */}
          <div style={{
            display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden",
            borderRight: "1px solid oklch(22% 0.016 65)",
          }}>

            {/* Toolbar row */}
            <div style={{
              flexShrink: 0, padding: "8px 12px",
              background: "oklch(16% 0.013 65)",
              borderBottom: "1px solid oklch(22% 0.016 65)",
              display: "flex", alignItems: "center", gap: 7,
            }}>
              {/* Preset selector */}
              <select
                value={selectedPreset}
                onChange={(e) => {
                  setSelectedPreset(e.target.value);
                  if (PRESETS[e.target.value]) setEditorCode(PRESETS[e.target.value].code);
                }}
                style={{
                  background: "oklch(21% 0.015 65)", color: "oklch(78% 0.04 75)",
                  border: "1px solid oklch(28% 0.018 65)", borderRadius: 5,
                  padding: "5px 9px", fontSize: 12,
                }}
              >
                <option value="">— Presets —</option>
                {Object.entries(PRESETS).map(([k, { label }]) => (
                  <option key={k} value={k}>{label}</option>
                ))}
              </select>

              {/* Load saved dropdown (only if there are saved strategies) */}
              {savedStrategies.length > 0 && (
                <select
                  defaultValue=""
                  onChange={(e) => {
                    const s = savedStrategies.find((s) => s.name === e.target.value);
                    if (s) { handleLoadSaved(s.code); e.target.value = ""; }
                  }}
                  style={{
                    background: "oklch(21% 0.015 65)", color: "oklch(78% 0.04 75)",
                    border: "1px solid oklch(28% 0.018 65)", borderRadius: 5,
                    padding: "5px 9px", fontSize: 12,
                  }}
                >
                  <option value="" disabled>Load saved…</option>
                  {savedStrategies.map((s) => (
                    <option key={s.name} value={s.name}>{s.name}</option>
                  ))}
                </select>
              )}

              <div style={{ flex: 1 }} />

              {/* Save button */}
              <button
                onClick={() => { setSaveOpen((o) => !o); setSaveName(""); }}
                style={{
                  background: saveOpen ? "oklch(75% 0.18 75)" : "oklch(21% 0.015 65)",
                  color: saveOpen ? "oklch(14% 0.012 65)" : "oklch(72% 0.04 75)",
                  border: "1px solid oklch(28% 0.018 65)",
                  borderRadius: 5, padding: "5px 13px",
                  fontSize: 12, fontWeight: 500,
                }}
              >
                Save
              </button>
            </div>

            {/* Save-name input (inline, no modal) */}
            {saveOpen && (
              <div style={{
                flexShrink: 0, padding: "8px 12px",
                background: "oklch(17% 0.013 65)",
                borderBottom: "1px solid oklch(22% 0.016 65)",
                display: "flex", alignItems: "center", gap: 8,
              }}>
                <span style={{ fontSize: 12, color: "oklch(46% 0.022 65)", whiteSpace: "nowrap" }}>
                  Save as
                </span>
                <input
                  type="text"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSave();
                    if (e.key === "Escape") setSaveOpen(false);
                  }}
                  placeholder="Strategy name…"
                  autoFocus
                  style={{
                    flex: 1,
                    background: "oklch(13% 0.010 65)", color: "oklch(85% 0.04 75)",
                    border: "1px solid oklch(28% 0.018 65)", borderRadius: 4,
                    padding: "5px 9px", fontSize: 12,
                  }}
                />
                <button
                  onClick={handleSave}
                  style={{
                    background: "oklch(75% 0.18 75)", color: "oklch(14% 0.012 65)",
                    borderRadius: 4, padding: "5px 13px", fontSize: 12, fontWeight: 600,
                  }}
                >↵ Save</button>
                <button
                  onClick={() => setSaveOpen(false)}
                  style={{
                    background: "oklch(21% 0.015 65)", color: "oklch(58% 0.030 65)",
                    border: "1px solid oklch(28% 0.018 65)",
                    borderRadius: 4, padding: "5px 10px", fontSize: 12,
                  }}
                >Cancel</button>
              </div>
            )}

            {/* Saved strategy chips */}
            {savedStrategies.length > 0 && (
              <div style={{
                flexShrink: 0,
                padding: "6px 12px",
                borderBottom: "1px solid oklch(22% 0.016 65)",
                background: "oklch(15% 0.012 65)",
                display: "flex", flexWrap: "wrap", gap: 5,
              }}>
                {savedStrategies.map((s) => (
                  <div
                    key={s.name}
                    style={{
                      display: "flex", alignItems: "center",
                      background: "oklch(20% 0.014 65)",
                      border: "1px solid oklch(26% 0.017 65)",
                      borderRadius: 4, overflow: "hidden",
                    }}
                  >
                    {/* Load chip */}
                    <button
                      className="chip-btn"
                      onClick={() => handleLoadSaved(s.code)}
                      style={{
                        background: "none", color: "oklch(72% 0.04 75)",
                        padding: "3px 9px", fontSize: 11, fontWeight: 500,
                      }}
                    >{s.name}</button>

                    {/* Delete button */}
                    <button
                      className="del-btn"
                      onClick={() => handleDelete(s.name)}
                      title={`Delete "${s.name}"`}
                      style={{
                        background: "none", color: "oklch(40% 0.07 22)",
                        padding: "3px 7px 3px 4px",
                        fontSize: 13, lineHeight: 1,
                      }}
                    >×</button>
                  </div>
                ))}
              </div>
            )}

            {/* CodeMirror editor */}
            <div
              ref={editorContainerRef}
              style={{ flex: 1, minHeight: 0, overflow: "hidden" }}
            />

            {/* Controls bar */}
            <div style={{
              flexShrink: 0, padding: "10px 12px",
              background: "oklch(16% 0.013 65)",
              borderTop: "1px solid oklch(22% 0.016 65)",
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <button
                className="ctrl-btn"
                onClick={handleRun}
                disabled={isRunning}
                style={{
                  background: isRunning ? "oklch(48% 0.11 75)" : "oklch(75% 0.18 75)",
                  color: "oklch(14% 0.012 65)",
                  padding: "7px 17px", borderRadius: 5,
                  fontSize: 13, fontWeight: 600,
                  opacity: isRunning ? 0.55 : 1,
                }}
              >▶ Run</button>

              <button
                className="ctrl-btn"
                onClick={handleStep}
                disabled={isRunning || gameOver}
                style={{
                  background: "oklch(21% 0.015 65)",
                  color: (isRunning || gameOver) ? "oklch(38% 0.020 65)" : "oklch(78% 0.04 75)",
                  border: "1px solid oklch(27% 0.017 65)",
                  padding: "7px 13px", borderRadius: 5,
                  fontSize: 13, fontWeight: 500,
                }}
              >→ Step</button>

              <button
                className="ctrl-btn"
                onClick={handleStop}
                disabled={!isRunning}
                style={{
                  background: "oklch(21% 0.015 65)",
                  color: !isRunning ? "oklch(38% 0.020 65)" : "oklch(68% 0.12 25)",
                  border: "1px solid oklch(27% 0.017 65)",
                  padding: "7px 13px", borderRadius: 5,
                  fontSize: 13, fontWeight: 500,
                }}
              >■ Stop</button>

              <div style={{ flex: 1 }} />

              <span style={{
                fontSize: 11, color: "oklch(46% 0.022 65)",
                minWidth: 36, textAlign: "right",
              }}>{speed}×/s</span>
              <input
                type="range" min={1} max={50} value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                style={{ width: 88, accentColor: "oklch(75% 0.18 75)" }}
              />
            </div>
          </div>

          {/* ════════════════════════════════════════════
              RIGHT: Game Panel
          ════════════════════════════════════════════ */}
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            padding: "16px 14px", gap: 12,
            overflowY: "auto",
            background: "oklch(14% 0.012 65)",
          }}>

            {/* Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 7, width: "100%" }}>
              {[["SCORE", score.toLocaleString()], ["MOVES", moveCount.toLocaleString()], ["BEST", maxTile.toLocaleString()]].map(
                ([label, val]) => (
                  <div key={label} style={{
                    background: "oklch(18% 0.014 65)",
                    border: "1px solid oklch(24% 0.016 65)",
                    borderRadius: 8, padding: "9px 6px", textAlign: "center",
                  }}>
                    <div style={{ fontSize: 9, letterSpacing: "0.10em", color: "oklch(40% 0.020 65)", marginBottom: 4 }}>
                      {label}
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "oklch(75% 0.18 75)" }}>
                      {val}
                    </div>
                  </div>
                )
              )}
            </div>

            {/* Game board */}
            <div style={{ position: "relative", width: "100%" }}>
              <div style={{
                display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 5,
                background: "oklch(20% 0.015 65)", padding: 5,
                borderRadius: 10, border: "1px solid oklch(25% 0.017 65)",
              }}>
                {board.flat().map((value, idx) => {
                  const [bg, fg] = getTileColors(value);
                  return (
                    <div
                      key={idx}
                      style={{
                        background: bg, borderRadius: 6,
                        aspectRatio: "1",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontWeight: 700, fontSize: tileFontSize(value),
                        color: fg,
                        transition: "background 0.08s ease",
                        userSelect: "none",
                      }}
                    >
                      {value > 0 ? value : ""}
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
                  display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center", gap: 10,
                }}>
                  <span style={{ fontSize: 20, fontWeight: 700 }}>Game Over</span>
                  <span style={{ fontSize: 12, color: "oklch(48% 0.022 65)" }}>
                    {score.toLocaleString()} pts · {moveCount} moves
                  </span>
                  <button
                    onClick={handleRun}
                    style={{
                      background: "oklch(75% 0.18 75)", color: "oklch(14% 0.012 65)",
                      padding: "7px 18px", borderRadius: 5,
                      fontSize: 13, fontWeight: 600, marginTop: 4,
                    }}
                  >▶ Run Again</button>
                </div>
              )}
            </div>

            {/* Reset */}
            <button
              className="reset-btn"
              onClick={doReset}
              style={{
                width: "100%",
                background: "oklch(18% 0.014 65)", color: "oklch(52% 0.030 65)",
                border: "1px solid oklch(24% 0.016 65)",
                borderRadius: 6, padding: "8px", fontSize: 12, fontWeight: 500,
              }}
            >↺ Reset</button>

            {/* Running indicator */}
            {isRunning && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "oklch(60% 0.10 75)" }}>
                <span style={{
                  width: 5, height: 5, borderRadius: "50%",
                  background: "oklch(75% 0.18 75)", display: "inline-block",
                  animation: "pulse 1.2s ease-in-out infinite",
                }} />
                {speed} move{speed !== 1 ? "s" : ""}/sec
              </div>
            )}

            {/* API quick-reference */}
            <div style={{
              marginTop: "auto", width: "100%",
              padding: "11px 12px",
              background: "oklch(17% 0.013 65)",
              border: "1px solid oklch(22% 0.016 65)",
              borderRadius: 8,
            }}>
              <div style={{
                fontSize: 9, letterSpacing: "0.10em",
                color: "oklch(38% 0.019 65)", marginBottom: 7,
              }}>STRATEGY API</div>
              <code style={{
                display: "block", lineHeight: 1.9, fontSize: 10,
                color: "oklch(52% 0.035 65)",
                fontFamily: "'JetBrains Mono','Fira Code',monospace",
              }}>
                {`getValue(x, y)\ngetLegalMoves()\ngetBoard()\ngetScore()\ngetEmptyCells()\ngetHighestTile()`}
              </code>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
