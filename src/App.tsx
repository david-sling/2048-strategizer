/**
 * App.tsx — Root component.  Wires hooks together, owns UI state only.
 *
 * All game logic  → engine.ts
 * All constants   → constants.ts
 * Storage hook    → useStorage.ts
 * Editor hook     → useEditor.ts
 * Game-loop hook  → useGameLoop.ts
 */

import { useState, useRef, useLayoutEffect, useEffect } from "react";
import type { CSSProperties } from "react";
import {
  PRESETS,
  getTileColors,
  tileFontSize,
  BOARD_PAD,
  TILE_GAP,
} from "./constants.ts";
import { useStoredStrategies } from "./useStorage.ts";
import { useEditor } from "./useEditor.ts";
import { useGameLoop } from "./useGameLoop.ts";
import { seedToHex, hexToSeed, randomSeed } from "./prng.ts";
import { useLeaderboard, type LeaderboardEntry } from "./useLeaderboard.ts";

export default function App() {
  // ── Strategy code  (shared between editor hook and game-loop hook via ref)
  const [strategyCode, setStrategyCode] = useState(PRESETS.cornerSeeker.code);
  const [selectedPreset, setSelectedPreset] = useState("cornerSeeker");
  const strategyCodeRef = useRef(PRESETS.cornerSeeker.code);

  const handleCodeChange = (code: string) => {
    setStrategyCode(code);
    strategyCodeRef.current = code;
  };

  // ── Hooks
  const { containerRef: editorContainerRef, setCode: setEditorCode } =
    useEditor(strategyCode, handleCodeChange);

  // ── Grid size
  const [gridSize, setGridSize] = useState(4);

  const {
    tiles,
    score,
    moveCount,
    gameOver,
    isRunning,
    speed,
    error,
    seed,
    setSpeed,
    run,
    step,
    stop,
    reset,
  } = useGameLoop(strategyCodeRef, gridSize);

  // ── Seed input (editable hex string; applied on Reset / Run-after-gameover)
  const [seedInput, setSeedInput] = useState(() => seedToHex(seed));
  // Keep the display in sync whenever the hook assigns a new seed (grid change, etc.)
  useEffect(() => { setSeedInput(seedToHex(seed)); }, [seed]);
  const seedInputValid = seedInput === "" || hexToSeed(seedInput) !== null;
  const handleRandomizeSeed = () => setSeedInput(seedToHex(randomSeed()));
  // Parse current input → pass to hook, or undefined to let it pick a random seed.
  const parseSeedInput = () => hexToSeed(seedInput) ?? undefined;

  const { savedStrategies, saveStrategy, deleteStrategy } =
    useStoredStrategies();

  // ── Leaderboard hook + UI state (declared before any effects that reference them)
  const {
    entries: lbEntries,
    isLoading: lbLoading,
    isSubmitting,
    submitError,
    fetchEntries,
    submitEntry,
  } = useLeaderboard();
  const [lbOpen,            setLbOpen]            = useState(false);
  const [lbGridFilter,      setLbGridFilter]      = useState(4);
  const [submitOpen,        setSubmitOpen]        = useState(false);
  const [playerName,        setPlayerName]        = useState(
    () => localStorage.getItem("2048-player-name") ?? "",
  );
  const [strategyNameInput, setStrategyNameInput] = useState("");
  const [submitted,         setSubmitted]         = useState(false);

  // ── Save-dialog UI state
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");

  // ── Strategy API reference panel
  const [apiOpen, setApiOpen] = useState(false);

  // ── Responsive: mobile detection via matchMedia
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 768,
  );
  // "game" | "code"
  const [activeTab, setActiveTab] = useState<"game" | "code">("code");

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Fetch leaderboard whenever the modal opens or the grid filter changes
  useEffect(() => {
    if (lbOpen) fetchEntries(lbGridFilter);
  }, [lbOpen, lbGridFilter, fetchEntries]);

  // Reset submit state each time a new game ends
  useEffect(() => {
    if (gameOver) {
      setSubmitted(false);
      setSubmitOpen(false);
      const label = selectedPreset ? (PRESETS[selectedPreset]?.label ?? "Custom") : "Custom";
      setStrategyNameInput(label);
    }
  }, [gameOver, selectedPreset]);

  const handleSave = () => {
    const name = saveName.trim();
    if (!name) return;
    saveStrategy(name, strategyCode);
    setSaveOpen(false);
    setSaveName("");
  };

  const handleLoadSaved = (code: string) => {
    setEditorCode(code);
    handleCodeChange(code);
    setSelectedPreset("");
  };

  const handlePresetChange = (key: string) => {
    setSelectedPreset(key);
    if (PRESETS[key]) {
      setEditorCode(PRESETS[key].code);
      handleCodeChange(PRESETS[key].code);
    }
  };

  // ── Board sizing  (responsive: measure the wrapper, derive cell size)
  const boardWrapRef = useRef<HTMLDivElement | null>(null);
  const [cellSize, setCellSize] = useState(63.5);
  useLayoutEffect(() => {
    if (!boardWrapRef.current) return;
    const el = boardWrapRef.current;
    const update = () => {
      setCellSize(
        (el.offsetWidth - 2 * BOARD_PAD - (gridSize - 1) * TILE_GAP) / gridSize,
      );
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [gridSize]);

  const tileX = (col: number) => BOARD_PAD + col * (cellSize + TILE_GAP);
  const tileY = (row: number) => BOARD_PAD + row * (cellSize + TILE_GAP);

  const maxTile = Math.max(2, ...tiles.map((t) => t.value));

  // ── On mobile, switch to the game tab whenever Run is triggered
  const handleRun = () => {
    if (isMobile) setActiveTab("game");
    run(parseSeedInput());
  };
  const handleReset = () => reset(parseSeedInput());

  const handleSubmitScore = async () => {
    localStorage.setItem("2048-player-name", playerName.trim());
    const ok = await submitEntry({
      playerName:   playerName.trim() || "Anonymous",
      strategyName: strategyNameInput.trim() || "Unnamed",
      strategyCode,
      seed,
      gridSize,
      score,
      maxTile,
      moveCount,
    });
    if (ok) setSubmitted(true);
  };

  const handleLoadEntry = (entry: LeaderboardEntry) => {
    setEditorCode(entry.strategyCode);
    handleCodeChange(entry.strategyCode);
    setSeedInput(entry.seedHex);
    setSelectedPreset("");
    setLbOpen(false);
    if (isMobile) setActiveTab("code");
  };

  // ── Strategy API reference — shared between code panel (mobile) and game panel (desktop)
  const apiRef = (
    <div
      style={{
        width: "100%",
        background: "oklch(17% 0.013 65)",
        border: "1px solid oklch(22% 0.016 65)",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <button
        onClick={() => setApiOpen((o) => !o)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "10px 12px",
          background: "none",
          fontFamily: "inherit",
          cursor: "pointer",
          borderBottom: apiOpen ? "1px solid oklch(22% 0.016 65)" : "none",
        }}
      >
        <span style={{ fontSize: 9, letterSpacing: "0.10em", color: "oklch(38% 0.019 65)" }}>
          STRATEGY API
        </span>
        <span style={{ marginLeft: "auto", fontSize: 10, color: "oklch(34% 0.018 65)", transition: "transform 0.15s", display: "inline-block", transform: apiOpen ? "rotate(180deg)" : "rotate(0deg)" }}>
          ▾
        </span>
      </button>
      {apiOpen && (
        <div style={{ padding: "10px 12px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <div style={{ fontSize: 9, letterSpacing: "0.08em", color: "oklch(34% 0.018 65)", marginBottom: 6 }}>
              AVAILABLE IN YOUR FUNCTION
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {([
                ["getValue(x, y)",   "→ number",     "tile at col x, row y (0 = empty)"],
                ["getLegalMoves()",  "→ string[]",   "e.g. [\"up\", \"left\"]"],
                ["getBoard()",       "→ number[][]", "board[row][col]"],
                ["getScore()",       "→ number",     "current score"],
                ["getEmptyCells()",  "→ {x,y}[]",    "all empty positions"],
                ["getHighestTile()", "→ number",     "current max tile value"],
              ] as [string, string, string][]).map(([fn, ret, desc]) => (
                <div key={fn} style={{ display: "grid", gridTemplateColumns: "1fr auto", columnGap: 8, rowGap: 1 }}>
                  <code style={{ fontSize: 10, color: "oklch(68% 0.10 75)", fontFamily: "'JetBrains Mono','Fira Code',monospace" }}>
                    {fn}
                  </code>
                  <code style={{ fontSize: 10, color: "oklch(44% 0.024 65)", fontFamily: "'JetBrains Mono','Fira Code',monospace", textAlign: "right" }}>
                    {ret}
                  </code>
                  <span style={{ fontSize: 10, color: "oklch(40% 0.020 65)", gridColumn: "1 / -1", paddingLeft: 2 }}>
                    {desc}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ height: 1, background: "oklch(22% 0.016 65)" }} />
          <div>
            <div style={{ fontSize: 9, letterSpacing: "0.08em", color: "oklch(34% 0.018 65)", marginBottom: 6 }}>
              RETURN VALUE
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <div style={{ fontSize: 10, color: "oklch(48% 0.024 65)", lineHeight: 1.5 }}>
                Return a <code style={{ color: "oklch(68% 0.10 75)", fontFamily: "'JetBrains Mono','Fira Code',monospace" }}>string[]</code> of moves in priority order. The engine tries each in turn until it finds a legal one.
              </div>
              <code style={{ fontSize: 10, color: "oklch(62% 0.10 75)", fontFamily: "'JetBrains Mono','Fira Code',monospace", background: "oklch(14% 0.011 65)", padding: "6px 8px", borderRadius: 5, display: "block", lineHeight: 1.7 }}>
                {"return [\"up\", \"right\", \"down\", \"left\"]"}
              </code>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {([
                  ["Valid moves",     "\"up\"  \"down\"  \"left\"  \"right\""],
                  ["Partial list ok", "missing moves are appended in default order"],
                  ["Single string ok","\"up\"  →  treated as  [\"up\"]"],
                  ["Fallback",        "if none are legal, any legal move is used"],
                ] as [string, string][]).map(([label, note]) => (
                  <div key={label} style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
                    <span style={{ fontSize: 9, color: "oklch(34% 0.018 65)", whiteSpace: "nowrap", minWidth: 70 }}>{label}</span>
                    <span style={{ fontSize: 10, color: "oklch(42% 0.020 65)", lineHeight: 1.4 }}>{note}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // ── Shared button styles to reduce repetition
  const ctrlBtnBase: CSSProperties = {
    borderRadius: 5,
    fontSize: 13,
    fontWeight: 600,
  };

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
        /* dvh adjusts as the browser address bar shows/hides on mobile,
           preventing the bottom controls from being clipped behind it. */
        .app-root { height: 100vh; height: 100dvh; }
        button { cursor: pointer; border: none; font-family: inherit; transition: all 0.12s; }
        select { font-family: inherit; outline: none; cursor: pointer; }
        input  { font-family: inherit; outline: none; }

        .cm-editor   { height: 100% !important; }
        .cm-scroller { overflow: auto !important; }

        ::-webkit-scrollbar       { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: oklch(28% 0.018 65); border-radius: 3px; }

        @keyframes tileSpawn {
          0%   { transform: scale(0.4); opacity: 0.6; }
          60%  { transform: scale(1.08); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes tileMerge {
          0%   { transform: scale(1); }
          40%  { transform: scale(1.16); }
          100% { transform: scale(1); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.2; }
        }

        @media (prefers-reduced-motion: reduce) {
          .tile-outer, .tile-face { transition: none !important; animation: none !important; }
          .panel-slide { transition: none !important; }
        }

        .chip-btn:hover  { background: oklch(24% 0.016 65) !important; color: oklch(85% 0.04 75) !important; }
        .del-btn:hover   { color: oklch(68% 0.18 22) !important; background: oklch(22% 0.05 22) !important; }
        .ctrl-btn:hover:not(:disabled) { filter: brightness(1.12); }
        .reset-btn:hover { background: oklch(23% 0.016 65) !important; color: oklch(80% 0.04 75) !important; }
        .tab-btn:active  { background: oklch(20% 0.015 65) !important; }
        .lb-btn:hover    { background: oklch(24% 0.016 65) !important; color: oklch(75% 0.18 75) !important; }
        .lb-row:hover td { background: oklch(20% 0.014 65 / 0.6); }
        .lb-load:hover   { background: oklch(26% 0.017 65) !important; color: oklch(75% 0.18 75) !important; }

        /* ── Mobile: larger touch targets & layout tweaks */
        @media (max-width: 767px) {
          .ctrl-btn  { min-height: 44px; }
          .reset-btn { min-height: 44px !important; font-size: 14px !important; }
          .tab-btn   { min-height: 44px; }
          .header-tagline { display: none; }
        }
      `}</style>

      <div
        className="app-root"
        style={{ display: "flex", flexDirection: "column" }}
      >
        {/* ── Header */}
        <header
          style={{
            height: 50,
            flexShrink: 0,
            padding: "0 20px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "oklch(16% 0.013 65)",
            borderBottom: "1px solid oklch(22% 0.016 65)",
          }}
        >
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: 5,
              background: "oklch(75% 0.18 75)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              fontWeight: 700,
              color: "oklch(14% 0.012 65)",
              letterSpacing: "-0.04em",
              userSelect: "none",
            }}
          >
            2k
          </div>
          <span
            style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-0.025em" }}
          >
            2048{" "}
            <span style={{ color: "oklch(75% 0.18 75)" }}>Strategizer</span>
          </span>
          <div
            style={{
              marginLeft: "auto",
              display: "flex",
              alignItems: "center",
              gap: 14,
            }}
          >
            <span
              className="header-tagline"
              style={{
                fontSize: 11,
                color: "oklch(38% 0.020 65)",
                letterSpacing: "0.08em",
              }}
            >
              WRITE · RUN · CONQUER
            </span>
            <button
              className="lb-btn"
              onClick={() => setLbOpen(true)}
              style={{
                background: "oklch(20% 0.014 65)",
                color: "oklch(58% 0.030 65)",
                border: "1px solid oklch(26% 0.017 65)",
                borderRadius: 6,
                padding: "4px 11px",
                fontSize: 12,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              🏆 <span style={{ letterSpacing: "0.03em" }}>Leaderboard</span>
            </button>
            <span style={{ fontSize: 11, color: "oklch(38% 0.020 65)" }}>
              by{" "}
              <a
                href="https://davidsling.in"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "oklch(65% 0.14 75)", textDecoration: "none" }}
                onMouseEnter={(e) =>
                  ((e.target as HTMLAnchorElement).style.color =
                    "oklch(75% 0.18 75)")
                }
                onMouseLeave={(e) =>
                  ((e.target as HTMLAnchorElement).style.color =
                    "oklch(65% 0.14 75)")
                }
              >
                David Sling
              </a>
              {" · "}
              <a
                href="https://github.com/david-sling/2048-strategizer"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "oklch(65% 0.14 75)", textDecoration: "none" }}
                onMouseEnter={(e) =>
                  ((e.target as HTMLAnchorElement).style.color =
                    "oklch(75% 0.18 75)")
                }
                onMouseLeave={(e) =>
                  ((e.target as HTMLAnchorElement).style.color =
                    "oklch(65% 0.14 75)")
                }
              >
                GitHub
              </a>
            </span>
          </div>
        </header>

        {/* ── Error banner */}
        {error && (
          <div
            style={{
              flexShrink: 0,
              padding: "8px 20px",
              background: "oklch(18% 0.04 22)",
              borderBottom: "1px solid oklch(30% 0.10 22)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span style={{ color: "oklch(68% 0.17 22)", fontSize: 13 }}>⚠</span>
            <code
              style={{
                flex: 1,
                fontSize: 12,
                color: "oklch(74% 0.14 22)",
                fontFamily: "monospace",
              }}
            >
              {error}
            </code>
            <button
              onClick={() => {}}
              style={{
                background: "none",
                color: "oklch(48% 0.10 22)",
                fontSize: 15,
              }}
            >
              ✕
            </button>
          </div>
        )}

        {/* ── Mobile tab bar — sits between header and content */}
        {isMobile && (
          <div
            style={{
              flexShrink: 0,
              display: "flex",
              background: "oklch(15% 0.012 65)",
              borderBottom: "1px solid oklch(22% 0.016 65)",
            }}
          >
            {(
              [
                ["game", "⊞ Board"],
                ["code", "</> Code"],
              ] as [typeof activeTab, string][]
            ).map(([tab, label]) => (
              <button
                key={tab}
                className="tab-btn"
                onClick={() => setActiveTab(tab)}
                style={{
                  flex: 1,
                  border: "none",
                  padding: "11px 8px",
                  background: "transparent",
                  fontFamily: "inherit",
                  cursor: "pointer",
                  color:
                    activeTab === tab
                      ? "oklch(75% 0.18 75)"
                      : "oklch(46% 0.022 65)",
                  fontSize: 13,
                  fontWeight: activeTab === tab ? 600 : 400,
                  borderBottom: `2px solid ${activeTab === tab ? "oklch(75% 0.18 75)" : "transparent"}`,
                  transition: "color 0.15s, border-color 0.15s",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* ── Main content area
              Desktop: CSS grid side-by-side  (editor | board)
              Mobile:  absolute-positioned panels that slide left/right.
                       Both panels are always mounted so CodeMirror initialises
                       with real dimensions regardless of which tab is active. */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            position: "relative",
            overflow: "hidden",
            ...(isMobile
              ? {}
              : { display: "grid", gridTemplateColumns: "1fr 312px" }),
          }}
        >
          {/* ════ LEFT / CODE panel ════ */}
          <div
            className="panel-slide"
            style={{
              // Mobile: fill the whole area, slide off-screen when game tab is active
              ...(isMobile
                ? {
                    position: "absolute",
                    inset: 0,
                    transform:
                      activeTab === "code"
                        ? "translateX(0)"
                        : "translateX(-100%)",
                    transition: "transform 220ms cubic-bezier(0.25, 1, 0.5, 1)",
                  }
                : {}),
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
              overflow: "hidden",
              borderRight: isMobile ? "none" : "1px solid oklch(22% 0.016 65)",
            }}
          >
            {/* Toolbar */}
            <div
              style={{
                flexShrink: 0,
                padding: "8px 12px",
                background: "oklch(16% 0.013 65)",
                borderBottom: "1px solid oklch(22% 0.016 65)",
                display: "flex",
                alignItems: "center",
                gap: 7,
                flexWrap: "wrap",
              }}
            >
              <select
                value={selectedPreset}
                onChange={(e) => handlePresetChange(e.target.value)}
                style={{
                  background: "oklch(21% 0.015 65)",
                  color: "oklch(78% 0.04 75)",
                  border: "1px solid oklch(28% 0.018 65)",
                  borderRadius: 5,
                  padding: "5px 9px",
                  fontSize: 12,
                }}
              >
                <option value="">— Presets —</option>
                {Object.entries(PRESETS).map(([k, { label }]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>

              {savedStrategies.length > 0 && (
                <select
                  defaultValue=""
                  onChange={(e) => {
                    const s = savedStrategies.find(
                      (s) => s.name === e.target.value,
                    );
                    if (s) {
                      handleLoadSaved(s.code);
                      e.target.value = "";
                    }
                  }}
                  style={{
                    background: "oklch(21% 0.015 65)",
                    color: "oklch(78% 0.04 75)",
                    border: "1px solid oklch(28% 0.018 65)",
                    borderRadius: 5,
                    padding: "5px 9px",
                    fontSize: 12,
                  }}
                >
                  <option value="" disabled>
                    Load saved…
                  </option>
                  {savedStrategies.map((s) => (
                    <option key={s.name} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
              )}

              <div style={{ flex: 1 }} />
              <button
                onClick={() => {
                  setSaveOpen((o) => !o);
                  setSaveName("");
                }}
                style={{
                  background: saveOpen
                    ? "oklch(75% 0.18 75)"
                    : "oklch(21% 0.015 65)",
                  color: saveOpen
                    ? "oklch(14% 0.012 65)"
                    : "oklch(72% 0.04 75)",
                  border: "1px solid oklch(28% 0.018 65)",
                  borderRadius: 5,
                  padding: "5px 13px",
                  fontSize: 12,
                  fontWeight: 500,
                }}
              >
                Save
              </button>
            </div>

            {/* Save-name input (inline, no modal) */}
            {saveOpen && (
              <div
                style={{
                  flexShrink: 0,
                  padding: "8px 12px",
                  background: "oklch(17% 0.013 65)",
                  borderBottom: "1px solid oklch(22% 0.016 65)",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    color: "oklch(46% 0.022 65)",
                    whiteSpace: "nowrap",
                  }}
                >
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
                    background: "oklch(13% 0.010 65)",
                    color: "oklch(85% 0.04 75)",
                    border: "1px solid oklch(28% 0.018 65)",
                    borderRadius: 4,
                    padding: "5px 9px",
                    fontSize: 12,
                  }}
                />
                <button
                  onClick={handleSave}
                  style={{
                    background: "oklch(75% 0.18 75)",
                    color: "oklch(14% 0.012 65)",
                    borderRadius: 4,
                    padding: "5px 13px",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  ↵ Save
                </button>
                <button
                  onClick={() => setSaveOpen(false)}
                  style={{
                    background: "oklch(21% 0.015 65)",
                    color: "oklch(58% 0.030 65)",
                    border: "1px solid oklch(28% 0.018 65)",
                    borderRadius: 4,
                    padding: "5px 10px",
                    fontSize: 12,
                  }}
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Saved strategy chips */}
            {savedStrategies.length > 0 && (
              <div
                style={{
                  flexShrink: 0,
                  padding: "6px 12px",
                  borderBottom: "1px solid oklch(22% 0.016 65)",
                  background: "oklch(15% 0.012 65)",
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 5,
                }}
              >
                {savedStrategies.map((s) => (
                  <div
                    key={s.name}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      background: "oklch(20% 0.014 65)",
                      border: "1px solid oklch(26% 0.017 65)",
                      borderRadius: 4,
                      overflow: "hidden",
                    }}
                  >
                    <button
                      className="chip-btn"
                      onClick={() => handleLoadSaved(s.code)}
                      style={{
                        background: "none",
                        color: "oklch(72% 0.04 75)",
                        padding: "3px 9px",
                        fontSize: 11,
                        fontWeight: 500,
                      }}
                    >
                      {s.name}
                    </button>
                    <button
                      className="del-btn"
                      onClick={() => deleteStrategy(s.name)}
                      title={`Delete "${s.name}"`}
                      style={{
                        background: "none",
                        color: "oklch(40% 0.07 22)",
                        padding: "3px 7px 3px 4px",
                        fontSize: 13,
                        lineHeight: 1,
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* CodeMirror mount point */}
            <div
              ref={editorContainerRef}
              style={{ flex: 1, minHeight: 0, overflow: "hidden" }}
            />

            {/* Controls bar — stacks vertically on mobile for thumb-friendliness */}
            <div
              style={{
                flexShrink: 0,
                padding: "10px 12px",
                background: "oklch(16% 0.013 65)",
                borderTop: "1px solid oklch(22% 0.016 65)",
                display: "flex",
                flexDirection: isMobile ? "column" : "row",
                alignItems: isMobile ? "stretch" : "center",
                gap: 8,
              }}
            >
              {/* Run / Step / Stop row */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  className="ctrl-btn"
                  onClick={handleRun}
                  disabled={isRunning}
                  style={{
                    ...ctrlBtnBase,
                    flex: isMobile ? 1 : "unset",
                    background: isRunning
                      ? "oklch(48% 0.11 75)"
                      : "oklch(75% 0.18 75)",
                    color: "oklch(14% 0.012 65)",
                    padding: "7px 17px",
                    opacity: isRunning ? 0.55 : 1,
                  }}
                >
                  ▶ Run
                </button>
                <button
                  className="ctrl-btn"
                  onClick={step}
                  disabled={isRunning || gameOver}
                  style={{
                    ...ctrlBtnBase,
                    flex: isMobile ? 1 : "unset",
                    background: "oklch(21% 0.015 65)",
                    color:
                      isRunning || gameOver
                        ? "oklch(38% 0.020 65)"
                        : "oklch(78% 0.04 75)",
                    border: "1px solid oklch(27% 0.017 65)",
                    padding: "7px 13px",
                  }}
                >
                  → Step
                </button>
                <button
                  className="ctrl-btn"
                  onClick={stop}
                  disabled={!isRunning}
                  style={{
                    ...ctrlBtnBase,
                    flex: isMobile ? 1 : "unset",
                    background: "oklch(21% 0.015 65)",
                    color: !isRunning
                      ? "oklch(38% 0.020 65)"
                      : "oklch(68% 0.12 25)",
                    border: "1px solid oklch(27% 0.017 65)",
                    padding: "7px 13px",
                  }}
                >
                  ■ Stop
                </button>
                {/* Speed controls inline on desktop */}
                {!isMobile && (
                  <>
                    <div style={{ flex: 1 }} />
                    <span
                      style={{
                        fontSize: 11,
                        color: "oklch(46% 0.022 65)",
                        minWidth: 36,
                        textAlign: "right",
                      }}
                    >
                      {speed}×/s
                    </span>
                    <input
                      type="range"
                      min={1}
                      max={50}
                      value={speed}
                      onChange={(e) => setSpeed(Number(e.target.value))}
                      style={{ width: 88, accentColor: "oklch(75% 0.18 75)" }}
                    />
                  </>
                )}
              </div>

              {/* Speed row — separate line on mobile */}
              {isMobile && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      fontSize: 11,
                      color: "oklch(46% 0.022 65)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Speed
                  </span>
                  <input
                    type="range"
                    min={1}
                    max={50}
                    value={speed}
                    onChange={(e) => setSpeed(Number(e.target.value))}
                    style={{ flex: 1, accentColor: "oklch(75% 0.18 75)" }}
                  />
                  <span
                    style={{
                      fontSize: 11,
                      color: "oklch(46% 0.022 65)",
                      minWidth: 34,
                      textAlign: "right",
                    }}
                  >
                    {speed}×/s
                  </span>
                </div>
              )}

              {/* API reference — shown in code panel on mobile only */}
              {isMobile && apiRef}
            </div>
          </div>

          {/* ════ RIGHT / GAME panel ════ */}
          <div
            className="panel-slide"
            style={{
              // Mobile: fill the whole area, slide off-screen when code tab is active
              ...(isMobile
                ? {
                    position: "absolute",
                    inset: 0,
                    transform:
                      activeTab === "game"
                        ? "translateX(0)"
                        : "translateX(100%)",
                    transition: "transform 220ms cubic-bezier(0.25, 1, 0.5, 1)",
                  }
                : {}),
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              padding: isMobile ? "12px 16px" : "16px 14px",
              gap: 12,
              overflowY: "auto",
              background: "oklch(14% 0.012 65)",
            }}
          >
            {/* Stats */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3,1fr)",
                gap: 7,
                width: "100%",
              }}
            >
              {(
                [
                  ["SCORE", score.toLocaleString()],
                  ["MOVES", moveCount.toLocaleString()],
                  ["BEST", maxTile.toLocaleString()],
                ] as [string, string][]
              ).map(([label, val]) => (
                <div
                  key={label}
                  style={{
                    background: "oklch(18% 0.014 65)",
                    border: "1px solid oklch(24% 0.016 65)",
                    borderRadius: 8,
                    padding: "9px 6px",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      fontSize: 9,
                      letterSpacing: "0.10em",
                      color: "oklch(40% 0.020 65)",
                      marginBottom: 4,
                    }}
                  >
                    {label}
                  </div>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: "oklch(75% 0.18 75)",
                    }}
                  >
                    {val}
                  </div>
                </div>
              ))}
            </div>

            {/* Grid size selector */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                width: "100%",
                maxWidth: isMobile ? 420 : "none",
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  color: "oklch(40% 0.020 65)",
                  whiteSpace: "nowrap",
                }}
              >
                GRID
              </span>
              <div style={{ display: "flex", gap: 4 }}>
                {[3, 4, 5, 6, 8].map((n) => (
                  <button
                    key={n}
                    onClick={() => setGridSize(n)}
                    style={{
                      borderRadius: 4,
                      padding: "3px 9px",
                      fontSize: 12,
                      fontWeight: 600,
                      border: "1px solid",
                      borderColor:
                        gridSize === n
                          ? "oklch(75% 0.18 75)"
                          : "oklch(26% 0.017 65)",
                      background:
                        gridSize === n
                          ? "oklch(75% 0.18 75)"
                          : "oklch(20% 0.014 65)",
                      color:
                        gridSize === n
                          ? "oklch(14% 0.012 65)"
                          : "oklch(52% 0.030 65)",
                      transition: "all 0.12s",
                    }}
                  >
                    {n}×{n}
                  </button>
                ))}
              </div>
            </div>

            {/* Animated board — capped width on mobile so it doesn't span edge-to-edge */}
            <div
              style={{
                position: "relative",
                width: "100%",
                maxWidth: isMobile ? 420 : "none",
              }}
            >
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
                {/* Empty cell backdrop */}
                {Array.from({ length: gridSize * gridSize }, (_, i) => {
                  const r = Math.floor(i / gridSize),
                    c = i % gridSize;
                  return (
                    <div
                      key={i}
                      style={{
                        position: "absolute",
                        left: tileX(c),
                        top: tileY(r),
                        width: cellSize,
                        height: cellSize,
                        background: "oklch(17% 0.013 65)",
                        borderRadius: 6,
                      }}
                    />
                  );
                })}

                {/* Tiles — outer div handles GPU-accelerated position; inner div handles colour + animations */}
                {tiles.map((tile) => {
                  const [bg, fg] = getTileColors(tile.value);
                  return (
                    <div
                      key={tile.id}
                      className="tile-outer"
                      style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        width: cellSize,
                        height: cellSize,
                        transform: `translate(${tileX(tile.col)}px, ${tileY(tile.row)}px)`,
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
                          width: "100%",
                          height: "100%",
                          background: bg,
                          color: fg,
                          borderRadius: 6,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 700,
                          fontSize: tileFontSize(tile.value),
                          userSelect: "none",
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

                {/* Game-over overlay — lives inside the board wrapper so overflow:hidden
                    clips it correctly, and zIndex:100 ensures it paints above all tiles
                    regardless of their willChange / zIndex values. */}
                {gameOver && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      zIndex: 100,
                      background: "oklch(10% 0.010 65 / 0.88)",
                      backdropFilter: "blur(6px)",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 10,
                      padding: "0 16px",
                    }}
                  >
                    <span style={{ fontSize: 20, fontWeight: 700 }}>
                      Game Over
                    </span>
                    <span style={{ fontSize: 12, color: "oklch(48% 0.022 65)" }}>
                      {score.toLocaleString()} pts · {moveCount} moves · best {maxTile.toLocaleString()}
                    </span>

                    {/* ── Submit section */}
                    {submitted ? (
                      <div style={{ fontSize: 12, color: "oklch(65% 0.14 75)", display: "flex", alignItems: "center", gap: 5 }}>
                        ✓ Score submitted!
                      </div>
                    ) : !submitOpen ? (
                      <button
                        onClick={() => setSubmitOpen(true)}
                        style={{
                          background: "none",
                          border: "1px solid oklch(34% 0.06 75)",
                          color: "oklch(62% 0.12 75)",
                          borderRadius: 5,
                          padding: "5px 14px",
                          fontSize: 12,
                          fontWeight: 500,
                          fontFamily: "inherit",
                        }}
                      >
                        🏆 Submit Score
                      </button>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%", maxWidth: 210 }}>
                        <input
                          type="text"
                          value={playerName}
                          onChange={(e) => setPlayerName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") handleSubmitScore(); }}
                          placeholder="Your name"
                          autoFocus
                          style={{
                            background: "oklch(19% 0.014 65)",
                            color: "oklch(82% 0.04 75)",
                            border: "1px solid oklch(30% 0.018 65)",
                            borderRadius: 4,
                            padding: "5px 9px",
                            fontSize: 12,
                            outline: "none",
                            fontFamily: "inherit",
                          }}
                        />
                        <input
                          type="text"
                          value={strategyNameInput}
                          onChange={(e) => setStrategyNameInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") handleSubmitScore(); }}
                          placeholder="Strategy name"
                          style={{
                            background: "oklch(19% 0.014 65)",
                            color: "oklch(82% 0.04 75)",
                            border: "1px solid oklch(30% 0.018 65)",
                            borderRadius: 4,
                            padding: "5px 9px",
                            fontSize: 12,
                            outline: "none",
                            fontFamily: "inherit",
                          }}
                        />
                        {submitError && (
                          <span style={{ fontSize: 11, color: "oklch(62% 0.15 22)" }}>
                            {submitError}
                          </span>
                        )}
                        <div style={{ display: "flex", gap: 5 }}>
                          <button
                            onClick={handleSubmitScore}
                            disabled={isSubmitting}
                            style={{
                              flex: 1,
                              background: "oklch(75% 0.18 75)",
                              color: "oklch(14% 0.012 65)",
                              borderRadius: 4,
                              padding: "6px 0",
                              fontSize: 12,
                              fontWeight: 600,
                              fontFamily: "inherit",
                              opacity: isSubmitting ? 0.65 : 1,
                            }}
                          >
                            {isSubmitting ? "…" : "Submit"}
                          </button>
                          <button
                            onClick={() => setSubmitOpen(false)}
                            style={{
                              background: "oklch(20% 0.014 65)",
                              color: "oklch(50% 0.025 65)",
                              border: "1px solid oklch(28% 0.018 65)",
                              borderRadius: 4,
                              padding: "6px 10px",
                              fontSize: 12,
                              fontFamily: "inherit",
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    )}

                    <button
                      onClick={handleRun}
                      style={{
                        background: "oklch(75% 0.18 75)",
                        color: "oklch(14% 0.012 65)",
                        padding: "7px 18px",
                        borderRadius: 5,
                        fontSize: 13,
                        fontWeight: 600,
                        marginTop: 4,
                        fontFamily: "inherit",
                      }}
                    >
                      ▶ Run Again
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Mobile-only quick controls — so users don't have to switch tabs to run */}
            {isMobile && (
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  width: "100%",
                  maxWidth: 420,
                }}
              >
                <button
                  className="ctrl-btn"
                  onClick={handleRun}
                  disabled={isRunning}
                  style={{
                    flex: 1,
                    background: isRunning
                      ? "oklch(48% 0.11 75)"
                      : "oklch(75% 0.18 75)",
                    color: "oklch(14% 0.012 65)",
                    padding: "10px 8px",
                    borderRadius: 5,
                    fontSize: 13,
                    fontWeight: 600,
                    opacity: isRunning ? 0.55 : 1,
                  }}
                >
                  ▶ Run
                </button>
                <button
                  className="ctrl-btn"
                  onClick={stop}
                  disabled={!isRunning}
                  style={{
                    flex: 1,
                    background: "oklch(21% 0.015 65)",
                    color: !isRunning
                      ? "oklch(38% 0.020 65)"
                      : "oklch(68% 0.12 25)",
                    border: "1px solid oklch(27% 0.017 65)",
                    padding: "10px 8px",
                    borderRadius: 5,
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  ■ Stop
                </button>
                <button
                  className="ctrl-btn"
                  onClick={step}
                  disabled={isRunning || gameOver}
                  style={{
                    flex: 1,
                    background: "oklch(21% 0.015 65)",
                    color:
                      isRunning || gameOver
                        ? "oklch(38% 0.020 65)"
                        : "oklch(78% 0.04 75)",
                    border: "1px solid oklch(27% 0.017 65)",
                    padding: "10px 8px",
                    borderRadius: 5,
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  ↠ Step
                </button>
              </div>
            )}

            {/* Seed control */}
            <div
              style={{
                width: "100%",
                maxWidth: isMobile ? 420 : "none",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span
                style={{
                  fontSize: 9,
                  letterSpacing: "0.10em",
                  color: "oklch(40% 0.020 65)",
                  whiteSpace: "nowrap",
                  minWidth: 30,
                }}
              >
                SEED
              </span>
              <input
                type="text"
                value={seedInput}
                onChange={(e) => setSeedInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleReset(); }}
                placeholder="0x00000000"
                spellCheck={false}
                style={{
                  flex: 1,
                  minWidth: 0,
                  background: "oklch(18% 0.014 65)",
                  color: seedInputValid
                    ? "oklch(75% 0.18 75)"
                    : "oklch(65% 0.17 22)",
                  border: `1px solid ${seedInputValid ? "oklch(26% 0.017 65)" : "oklch(32% 0.10 22)"}`,
                  borderRadius: 5,
                  padding: "5px 9px",
                  fontSize: 11,
                  fontFamily: "'JetBrains Mono','Fira Code',monospace",
                  letterSpacing: "0.06em",
                  outline: "none",
                }}
              />
              <button
                onClick={handleRandomizeSeed}
                title="Generate random seed"
                style={{
                  flexShrink: 0,
                  background: "oklch(21% 0.015 65)",
                  color: "oklch(52% 0.030 65)",
                  border: "1px solid oklch(27% 0.017 65)",
                  borderRadius: 5,
                  padding: "5px 9px",
                  fontSize: 13,
                  lineHeight: 1,
                  transition: "all 0.12s",
                }}
              >
                ⟳
              </button>
            </div>

            {/* Reset */}
            <button
              className="reset-btn"
              onClick={handleReset}
              style={{
                width: "100%",
                maxWidth: isMobile ? 420 : "none",
                background: "oklch(18% 0.014 65)",
                color: "oklch(52% 0.030 65)",
                border: "1px solid oklch(24% 0.016 65)",
                borderRadius: 6,
                padding: "8px",
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              ↺ Reset
            </button>

            {/* Running indicator */}
            {isRunning && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 11,
                  color: "oklch(60% 0.10 75)",
                }}
              >
                <span
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: "50%",
                    background: "oklch(75% 0.18 75)",
                    display: "inline-block",
                    animation: "pulse 1.2s ease-in-out infinite",
                  }}
                />
                {speed} move{speed !== 1 ? "s" : ""}/sec
              </div>
            )}

            {/* API reference — shown in game panel on desktop only */}
            {!isMobile && (
              <div style={{ marginTop: "auto", width: "100%" }}>
                {apiRef}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          LEADERBOARD MODAL
          Click backdrop to close; click inside to keep open.
      ══════════════════════════════════════════════════════════ */}
      {lbOpen && (
        <div
          onClick={() => setLbOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 300,
            background: "oklch(10% 0.010 65 / 0.82)",
            backdropFilter: "blur(5px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "oklch(17% 0.013 65)",
              border: "1px solid oklch(26% 0.017 65)",
              borderRadius: 12,
              width: "100%",
              maxWidth: 700,
              maxHeight: "85vh",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              boxShadow: "0 24px 64px oklch(5% 0.01 65 / 0.7)",
            }}
          >
            {/* Modal header */}
            <div
              style={{
                flexShrink: 0,
                padding: "14px 18px",
                borderBottom: "1px solid oklch(22% 0.016 65)",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <span style={{ fontSize: 17 }}>🏆</span>
              <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.02em" }}>
                Leaderboard
              </span>
              <span style={{ fontSize: 11, color: "oklch(38% 0.019 65)", marginLeft: 2 }}>
                top 20 per grid size
              </span>
              <div style={{ flex: 1 }} />
              <button
                onClick={() => setLbOpen(false)}
                style={{
                  background: "none",
                  color: "oklch(44% 0.020 65)",
                  fontSize: 18,
                  lineHeight: 1,
                  padding: "2px 4px",
                  borderRadius: 4,
                }}
              >
                ✕
              </button>
            </div>

            {/* Grid size filter */}
            <div
              style={{
                flexShrink: 0,
                padding: "10px 18px",
                borderBottom: "1px solid oklch(22% 0.016 65)",
                display: "flex",
                alignItems: "center",
                gap: 6,
                flexWrap: "wrap",
              }}
            >
              <span style={{ fontSize: 10, letterSpacing: "0.10em", color: "oklch(40% 0.020 65)", marginRight: 2 }}>
                GRID
              </span>
              {[3, 4, 5, 6, 8].map((n) => (
                <button
                  key={n}
                  onClick={() => setLbGridFilter(n)}
                  style={{
                    borderRadius: 4,
                    padding: "3px 11px",
                    fontSize: 12,
                    fontWeight: 600,
                    border: "1px solid",
                    fontFamily: "inherit",
                    borderColor: lbGridFilter === n ? "oklch(75% 0.18 75)" : "oklch(26% 0.017 65)",
                    background:  lbGridFilter === n ? "oklch(75% 0.18 75)" : "oklch(20% 0.014 65)",
                    color:       lbGridFilter === n ? "oklch(14% 0.012 65)" : "oklch(52% 0.030 65)",
                    transition: "all 0.12s",
                  }}
                >
                  {n}×{n}
                </button>
              ))}
            </div>

            {/* Table / empty / loading */}
            <div style={{ flex: 1, overflowY: "auto" }}>
              {lbLoading ? (
                <div style={{ padding: 48, textAlign: "center", color: "oklch(42% 0.020 65)", fontSize: 13 }}>
                  Loading…
                </div>
              ) : lbEntries.length === 0 ? (
                <div style={{ padding: 48, textAlign: "center", color: "oklch(42% 0.020 65)", fontSize: 13 }}>
                  No entries yet for {lbGridFilter}×{lbGridFilter} — be the first!
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: "oklch(15% 0.012 65)", position: "sticky", top: 0 }}>
                        {(["#", "Player", "Strategy", "Score", "Best", "Moves", "Seed", ""] as string[]).map((h) => (
                          <th
                            key={h}
                            style={{
                              padding: "9px 12px",
                              textAlign: h === "Score" || h === "Best" || h === "Moves" ? "right" : "left",
                              fontWeight: 600,
                              fontSize: 10,
                              letterSpacing: "0.08em",
                              color: "oklch(40% 0.020 65)",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {lbEntries.map((entry, i) => (
                        <tr
                          key={entry.id}
                          className="lb-row"
                          style={{ borderTop: "1px solid oklch(21% 0.015 65)" }}
                        >
                          <td style={{ padding: "10px 12px", color: i < 3 ? "oklch(75% 0.18 75)" : "oklch(40% 0.020 65)", fontWeight: 700, width: 32, whiteSpace: "nowrap" }}>
                            {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`}
                          </td>
                          <td style={{ padding: "10px 12px", color: "oklch(82% 0.04 75)", maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {entry.playerName}
                          </td>
                          <td style={{ padding: "10px 12px", color: "oklch(58% 0.030 65)", maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {entry.strategyName}
                          </td>
                          <td style={{ padding: "10px 12px", color: "oklch(75% 0.18 75)", fontWeight: 700, textAlign: "right", whiteSpace: "nowrap" }}>
                            {entry.score.toLocaleString()}
                          </td>
                          <td style={{ padding: "10px 12px", color: "oklch(68% 0.04 75)", textAlign: "right", whiteSpace: "nowrap" }}>
                            {entry.maxTile.toLocaleString()}
                          </td>
                          <td style={{ padding: "10px 12px", color: "oklch(46% 0.022 65)", textAlign: "right", whiteSpace: "nowrap" }}>
                            {entry.moveCount.toLocaleString()}
                          </td>
                          <td style={{ padding: "10px 12px", color: "oklch(38% 0.018 65)", fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: 10, whiteSpace: "nowrap" }}>
                            {entry.seedHex}
                          </td>
                          <td style={{ padding: "10px 12px" }}>
                            <button
                              className="lb-load"
                              onClick={() => handleLoadEntry(entry)}
                              title="Load this seed + strategy into the editor"
                              style={{
                                background: "oklch(21% 0.015 65)",
                                color: "oklch(60% 0.10 75)",
                                border: "1px solid oklch(27% 0.017 65)",
                                borderRadius: 4,
                                padding: "3px 10px",
                                fontSize: 11,
                                fontWeight: 500,
                                fontFamily: "inherit",
                                whiteSpace: "nowrap",
                                cursor: "pointer",
                              }}
                            >
                              ▶ Load
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div
              style={{
                flexShrink: 0,
                padding: "10px 18px",
                borderTop: "1px solid oklch(22% 0.016 65)",
                fontSize: 11,
                color: "oklch(36% 0.018 65)",
              }}
            >
              Scores are verifiable — ▶ Load copies any entry's seed + code into the editor so you can replay it exactly.
            </div>
          </div>
        </div>
      )}
    </>
  );
}
