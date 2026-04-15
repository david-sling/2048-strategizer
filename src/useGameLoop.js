/**
 * useGameLoop.js — Game state and the run / step / stop / reset loop.
 *
 * Owns all mutable game state.  Exposes a clean interface to App.jsx:
 *   { tiles, score, moveCount, gameOver, isRunning, speed, error,
 *     setSpeed, run, step, stop, reset }
 */

import { useState, useEffect, useRef, useCallback } from "react";
import {
  getLegalMoves,
  tilesToBoard,
  applyMoveTracked,
  spawnTile,
  freshTiles,
} from "./engine.js";

/** Compile a strategy code string into a callable function, or throw. */
function compileStrategy(code) {
  const stripped = code.trim().replace(/;\s*$/, "");
  // eslint-disable-next-line no-new-func
  const fn = new Function(`return (${stripped})`)();
  if (typeof fn !== "function") throw new Error("strategy must be a function");
  return fn;
}

/** Build the context object passed to each strategy call. */
function makeContext(board, score) {
  return {
    getValue:       (x, y) => board[y]?.[x] ?? 0,
    getLegalMoves:  ()     => getLegalMoves(board),
    getBoard:       ()     => board.map((r) => [...r]),
    getScore:       ()     => score,
    getEmptyCells:  ()     => {
      const cells = [];
      for (let r = 0; r < 4; r++)
        for (let c = 0; c < 4; c++)
          if (board[r][c] === 0) cells.push({ x: c, y: r });
      return cells;
    },
    getHighestTile: () => Math.max(0, ...board.flat()),
  };
}

/** Normalise whatever the strategy returned into a full 4-move priority list. */
function normaliseMoves(result) {
  const DEFAULT = ["up", "right", "down", "left"];
  if (typeof result === "string") result = [result];
  if (!Array.isArray(result))    result = DEFAULT;
  const missing = DEFAULT.filter((m) => !result.includes(m));
  return [...result, ...missing];
}

export function useGameLoop(strategyCodeRef) {
  // ── Tile ID counter (never causes re-renders)
  const tileIdRef = useRef(0);
  const getId = useCallback(() => tileIdRef.current++, []);

  // ── Authoritative game state lives in refs for the tight loop
  const tilesRef     = useRef(null);
  const scoreRef     = useRef(0);
  const moveCountRef = useRef(0);

  if (!tilesRef.current) tilesRef.current = freshTiles(getId);

  // ── React state for rendering
  const [tiles,     setTiles]     = useState(() => tilesRef.current);
  const [score,     setScore]     = useState(0);
  const [moveCount, setMoveCount] = useState(0);
  const [gameOver,  setGameOver]  = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [speed,     setSpeed]     = useState(5);
  const [error,     setError]     = useState(null);

  const intervalRef = useRef(null);

  // ── Single step ──────────────────────────────────────────────
  const step = useCallback(() => {
    const currentTiles = tilesRef.current;
    const currentScore = scoreRef.current;
    const board        = tilesToBoard(currentTiles);
    const legal        = getLegalMoves(board);

    if (!legal.length) {
      setGameOver(true); setIsRunning(false); clearInterval(intervalRef.current); return;
    }

    let strategyFn;
    try {
      strategyFn = compileStrategy(strategyCodeRef.current);
    } catch (e) {
      setError(`Compile error: ${e.message}`);
      setIsRunning(false); clearInterval(intervalRef.current); return;
    }

    let priorityMoves;
    try {
      priorityMoves = normaliseMoves(strategyFn(makeContext(board, currentScore)));
    } catch (e) {
      setError(`Runtime error: ${e.message}`);
      setIsRunning(false); clearInterval(intervalRef.current); return;
    }

    const chosen = priorityMoves.find((m) => legal.includes(m)) ?? legal[0];
    const { tiles: moved, score: gained, changed } = applyMoveTracked(currentTiles, chosen, getId);
    if (!changed) return;

    const spawned = spawnTile(moved, getId);

    tilesRef.current    = spawned;
    scoreRef.current    = currentScore + gained;
    moveCountRef.current += 1;

    setTiles(spawned);
    setScore((s) => s + gained);
    setMoveCount((m) => m + 1);
    setError(null);

    if (!getLegalMoves(tilesToBoard(spawned)).length) {
      setGameOver(true); setIsRunning(false); clearInterval(intervalRef.current);
    }
  }, [getId, strategyCodeRef]);

  // ── Auto-play interval ───────────────────────────────────────
  useEffect(() => {
    if (isRunning) {
      clearInterval(intervalRef.current);
      intervalRef.current = setInterval(step, 1000 / speed);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [isRunning, speed, step]);

  // ── Exposed controls ─────────────────────────────────────────
  const reset = useCallback((andRun = false) => {
    clearInterval(intervalRef.current);
    const fresh = freshTiles(getId);
    tilesRef.current  = fresh;
    scoreRef.current  = 0;
    moveCountRef.current = 0;
    setTiles(fresh);
    setScore(0); setMoveCount(0); setGameOver(false); setError(null);
    setIsRunning(andRun);
  }, [getId]);

  const run  = useCallback(() => {
    if (gameOver) reset(true);
    else { setError(null); setIsRunning(true); }
  }, [gameOver, reset]);

  const stop = useCallback(() => setIsRunning(false), []);

  const stepOnce = useCallback(() => {
    setIsRunning(false);
    clearInterval(intervalRef.current);
    setError(null);
    setTimeout(step, 0);
  }, [step]);

  return {
    tiles, score, moveCount, gameOver,
    isRunning, speed, error,
    setSpeed,
    run, step: stepOnce, stop, reset: () => reset(false),
    getId,
  };
}
