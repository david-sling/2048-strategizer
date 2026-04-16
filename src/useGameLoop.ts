/**
 * useGameLoop.ts — Game state and the run / step / stop / reset loop.
 *
 * Owns all mutable game state.  Exposes a clean interface to App.tsx:
 *   { tiles, score, moveCount, gameOver, isRunning, speed, error, seed,
 *     setSpeed, run, step, stop, reset }
 *
 * Seeded RNG (mulberry32) replaces Math.random() so every game is fully
 * reproducible given the same seed + strategy + grid size.
 * run(newSeed?) / reset(newSeed?) apply a specific seed; omitting it
 * generates a fresh random seed automatically.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import {
  getLegalMoves,
  tilesToBoard,
  applyMoveTracked,
  spawnTile,
  freshTiles,
  type Tile,
  type Direction,
} from "./engine.ts";
import { mulberry32, randomSeed } from "./prng.ts";

export interface StrategyContext {
  getValue: (x: number, y: number) => number;
  getLegalMoves: () => Direction[];
  getBoard: () => number[][];
  getScore: () => number;
  getEmptyCells: () => { x: number; y: number }[];
  getHighestTile: () => number;
}

type StrategyFn = (ctx: StrategyContext) => string | string[];

export interface GameLoopResult {
  tiles: Tile[];
  score: number;
  moveCount: number;
  gameOver: boolean;
  isRunning: boolean;
  speed: number;
  error: string | null;
  /** The seed used for the current game. Changes on every reset. */
  seed: number;
  setSpeed: React.Dispatch<React.SetStateAction<number>>;
  /** Start auto-play. If game is over, resets first using newSeed (or random). */
  run: (newSeed?: number) => void;
  step: () => void;
  stop: () => void;
  /** Reset the board. Uses newSeed if provided, otherwise picks a fresh random seed. */
  reset: (newSeed?: number) => void;
  getId: () => number;
}

/** Compile a strategy code string into a callable function, or throw. */
function compileStrategy(code: string): StrategyFn {
  const stripped = code.trim().replace(/;\s*$/, "");
  // eslint-disable-next-line no-new-func
  const fn = new Function(`return (${stripped})`)() as unknown;
  if (typeof fn !== "function") throw new Error("strategy must be a function");
  return fn as StrategyFn;
}

/** Build the context object passed to each strategy call. */
function makeContext(board: number[][], score: number, size: number): StrategyContext {
  return {
    getValue:       (x, y) => board[y]?.[x] ?? 0,
    getLegalMoves:  ()     => getLegalMoves(board, size),
    getBoard:       ()     => board.map((r) => [...r]),
    getScore:       ()     => score,
    getEmptyCells:  ()     => {
      const cells: { x: number; y: number }[] = [];
      for (let r = 0; r < size; r++)
        for (let c = 0; c < size; c++)
          if (board[r][c] === 0) cells.push({ x: c, y: r });
      return cells;
    },
    getHighestTile: () => Math.max(0, ...board.flat()),
  };
}

/** Normalise whatever the strategy returned into a full 4-move priority list. */
function normaliseMoves(result: string | string[]): Direction[] {
  const DEFAULT: Direction[] = ["up", "right", "down", "left"];
  let moves: string[] = typeof result === "string" ? [result] : result;
  if (!Array.isArray(moves)) moves = DEFAULT;
  const missing = DEFAULT.filter((m) => !moves.includes(m));
  return [...moves, ...missing] as Direction[];
}

export function useGameLoop(
  strategyCodeRef: React.RefObject<string>,
  size: number,
): GameLoopResult {
  // ── Tile ID counter (never causes re-renders)
  const tileIdRef = useRef(0);
  const getId = useCallback(() => tileIdRef.current++, []);

  // ── Seeded RNG ────────────────────────────────────────────────
  // seed is exposed as React state so the UI can display it.
  // rngRef holds the live PRNG instance; it is recreated on every reset.
  const initialSeed = useRef<number>(randomSeed());
  const [seed, setSeed] = useState<number>(() => initialSeed.current);
  const rngRef = useRef<() => number>(mulberry32(initialSeed.current));

  // ── Authoritative game state lives in refs for the tight loop
  const tilesRef     = useRef<Tile[] | null>(null);
  const scoreRef     = useRef(0);
  const moveCountRef = useRef(0);

  if (!tilesRef.current) tilesRef.current = freshTiles(size, getId, rngRef.current);

  // ── React state for rendering
  const [tiles,     setTiles]     = useState<Tile[]>(() => tilesRef.current!);
  const [score,     setScore]     = useState(0);
  const [moveCount, setMoveCount] = useState(0);
  const [gameOver,  setGameOver]  = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [speed,     setSpeed]     = useState(5);
  const [error,     setError]     = useState<string | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Reset whenever grid size changes ────────────────────────
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    const s = randomSeed();
    setSeed(s);
    rngRef.current = mulberry32(s);
    const fresh = freshTiles(size, getId, rngRef.current);
    tilesRef.current     = fresh;
    scoreRef.current     = 0;
    moveCountRef.current = 0;
    setTiles(fresh);
    setScore(0);
    setMoveCount(0);
    setGameOver(false);
    setError(null);
    setIsRunning(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size]);

  // ── Single step ──────────────────────────────────────────────
  const step = useCallback(() => {
    const currentTiles = tilesRef.current!;
    const currentScore = scoreRef.current;
    const board        = tilesToBoard(currentTiles, size);
    const legal        = getLegalMoves(board, size);

    if (!legal.length) {
      setGameOver(true);
      setIsRunning(false);
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    let strategyFn: StrategyFn;
    try {
      strategyFn = compileStrategy(strategyCodeRef.current ?? "");
    } catch (e) {
      setError(`Compile error: ${(e as Error).message}`);
      setIsRunning(false);
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    let priorityMoves: Direction[];
    try {
      priorityMoves = normaliseMoves(strategyFn(makeContext(board, currentScore, size)));
    } catch (e) {
      setError(`Runtime error: ${(e as Error).message}`);
      setIsRunning(false);
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    const chosen = priorityMoves.find((m) => legal.includes(m)) ?? legal[0];
    const { tiles: moved, score: gained, changed } = applyMoveTracked(currentTiles, chosen, size, getId);
    if (!changed) return;

    const spawned = spawnTile(moved, size, getId, rngRef.current);

    tilesRef.current     = spawned;
    scoreRef.current     = currentScore + gained;
    moveCountRef.current += 1;

    setTiles(spawned);
    setScore((s) => s + gained);
    setMoveCount((m) => m + 1);
    setError(null);

    if (!getLegalMoves(tilesToBoard(spawned, size), size).length) {
      setGameOver(true);
      setIsRunning(false);
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
  }, [getId, size, strategyCodeRef]);

  // ── Auto-play interval ───────────────────────────────────────
  useEffect(() => {
    if (isRunning) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(step, 1000 / speed);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning, speed, step]);

  // ── Exposed controls ─────────────────────────────────────────
  const reset = useCallback((andRun = false, newSeed?: number) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    // Use the provided seed or generate a fresh random one.
    const s = newSeed !== undefined ? newSeed : randomSeed();
    setSeed(s);
    rngRef.current = mulberry32(s);
    const fresh = freshTiles(size, getId, rngRef.current);
    tilesRef.current     = fresh;
    scoreRef.current     = 0;
    moveCountRef.current = 0;
    setTiles(fresh);
    setScore(0);
    setMoveCount(0);
    setGameOver(false);
    setError(null);
    setIsRunning(andRun);
  }, [getId, size]);

  const run = useCallback((newSeed?: number) => {
    if (gameOver) reset(true, newSeed);
    else { setError(null); setIsRunning(true); }
  }, [gameOver, reset]);

  const stop = useCallback(() => setIsRunning(false), []);

  const stepOnce = useCallback(() => {
    setIsRunning(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
    setError(null);
    setTimeout(step, 0);
  }, [step]);

  return {
    tiles, score, moveCount, gameOver,
    isRunning, speed, error,
    seed,
    setSpeed,
    run:   (newSeed?: number) => run(newSeed),
    step:  stepOnce,
    stop,
    reset: (newSeed?: number) => reset(false, newSeed),
    getId,
  };
}
