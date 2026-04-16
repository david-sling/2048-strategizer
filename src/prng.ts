/**
 * prng.ts — Seeded pseudo-random number generator + seed utilities.
 *
 * Algorithm: Mulberry32 — a fast, simple, deterministic 32-bit PRNG.
 * Given the same seed, the sequence of values is always identical,
 * which makes game runs fully reproducible and leaderboard entries verifiable.
 */

/**
 * Create a seeded RNG. Returns a function that produces a new float in [0, 1)
 * on every call, advancing the internal state by one step.
 *
 * Usage:
 *   const rng = mulberry32(0xDEADBEEF);
 *   rng(); // 0.xxxxxxxx  — deterministic for this seed
 */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0; // force unsigned 32-bit
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Generate a random 32-bit seed using Math.random (for game initialisation). */
export function randomSeed(): number {
  return (Math.random() * 0x100000000) >>> 0;
}

/**
 * Format a seed as an 8-digit uppercase hex string with 0x prefix.
 * e.g.  3735928559  →  "0xDEADBEEF"
 */
export function seedToHex(seed: number): string {
  return "0x" + (seed >>> 0).toString(16).toUpperCase().padStart(8, "0");
}

/**
 * Parse a hex string (with or without "0x" prefix) into a 32-bit seed.
 * Returns null if the string is empty or not valid hex.
 *
 * Valid inputs: "0xDEADBEEF", "DEADBEEF", "1a2b", "0"
 * Invalid:      "xyz", "0x1234567890" (> 8 hex digits)
 */
export function hexToSeed(hex: string): number | null {
  const trimmed = hex.trim().replace(/^0x/i, "");
  if (trimmed === "") return null;
  if (!/^[0-9a-fA-F]{1,8}$/.test(trimmed)) return null;
  return parseInt(trimmed, 16) >>> 0;
}
