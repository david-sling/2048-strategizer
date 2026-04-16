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

  const {
    tiles,
    score,
    moveCount,
    gameOver,
    isRunning,
    speed,
    error,
    setSpeed,
    run,
    step,
    stop,
    reset,
  } = useGameLoop(strategyCodeRef);

  const { savedStrategies, saveStrategy, deleteStrategy } =
    useStoredStrategies();

  // ── Save-dialog UI state
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");

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
      setCellSize((el.offsetWidth - 2 * BOARD_PAD - 3 * TILE_GAP) / 4);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const tileX = (col: number) => BOARD_PAD + col * (cellSize + TILE_GAP);
  const tileY = (row: number) => BOARD_PAD + row * (cellSize + TILE_GAP);

  const maxTile = Math.max(2, ...tiles.map((t) => t.value));

  // ── On mobile, switch to the game tab whenever Run is triggered
  const handleRun = () => {
    if (isMobile) setActiveTab("game");
    run();
  };

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
            <span style={{ fontSize: 11, color: "oklch(38% 0.020 65)" }}>
              by{" "}
              <a
                href="https://davidsling.in"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "oklch(65% 0.14 75)", textDecoration: "none" }}
                onMouseEnter={(e) =>
                  ((e.target as HTMLAnchorElement).style.color = "oklch(75% 0.18 75)")
                }
                onMouseLeave={(e) =>
                  ((e.target as HTMLAnchorElement).style.color = "oklch(65% 0.14 75)")
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
                  ((e.target as HTMLAnchorElement).style.color = "oklch(75% 0.18 75)")
                }
                onMouseLeave={(e) =>
                  ((e.target as HTMLAnchorElement).style.color = "oklch(65% 0.14 75)")
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
                {Array.from({ length: 16 }, (_, i) => {
                  const r = Math.floor(i / 4),
                    c = i % 4;
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
                    }}
                  >
                    <span style={{ fontSize: 20, fontWeight: 700 }}>
                      Game Over
                    </span>
                    <span
                      style={{ fontSize: 12, color: "oklch(48% 0.022 65)" }}
                    >
                      {score.toLocaleString()} pts · {moveCount} moves
                    </span>
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

            {/* Reset */}
            <button
              className="reset-btn"
              onClick={reset}
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

            {/* Strategy API quick-reference */}
            <div
              style={{
                marginTop: "auto",
                width: "100%",
                maxWidth: isMobile ? 420 : "none",
                padding: "11px 12px",
                background: "oklch(17% 0.013 65)",
                border: "1px solid oklch(22% 0.016 65)",
                borderRadius: 8,
              }}
            >
              <div
                style={{
                  fontSize: 9,
                  letterSpacing: "0.10em",
                  color: "oklch(38% 0.019 65)",
                  marginBottom: 7,
                }}
              >
                STRATEGY API
              </div>
              <code
                style={{
                  display: "block",
                  lineHeight: 1.9,
                  fontSize: 10,
                  color: "oklch(52% 0.035 65)",
                  fontFamily: "'JetBrains Mono','Fira Code',monospace",
                }}
              >
                {`getValue(x, y)\ngetLegalMoves()\ngetBoard()\ngetScore()\ngetEmptyCells()\ngetHighestTile()`}
              </code>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
