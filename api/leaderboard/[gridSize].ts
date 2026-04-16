/**
 * api/leaderboard/[gridSize].ts  — Vercel Edge Function
 *
 * GET /api/leaderboard/:gridSize
 *
 * Returns the top 20 leaderboard entries for the requested grid size,
 * ordered highest-score first.
 *
 * The Upstash credentials live ONLY in Vercel's environment variables
 * (without the VITE_ prefix) and are never shipped to the browser.
 */

import { Redis } from "@upstash/redis";
import type { LeaderboardEntry } from "../../src/leaderboard.types.ts";

export const config = { runtime: "edge" };

const VALID_GRID_SIZES = new Set([3, 4, 5, 6, 8]);
const lbKey = (gridSize: number) => `lb:${gridSize}`;

export default async function handler(request: Request): Promise<Response> {
  // Dynamic segment: /api/leaderboard/4 → gridSize = "4"
  const segments = new URL(request.url).pathname.split("/");
  const gridSize = parseInt(segments[segments.length - 1] ?? "", 10);

  if (isNaN(gridSize) || !VALID_GRID_SIZES.has(gridSize)) {
    return json({ error: "Invalid grid size" }, 400);
  }

  const redis = makeRedis();

  try {
    const entries = await redis.zrange<LeaderboardEntry[]>(
      lbKey(gridSize),
      0,
      19,
      { rev: true },
    );
    return json({ entries });
  } catch (err) {
    console.error("[leaderboard] fetch failed:", err);
    return json({ error: "Failed to fetch leaderboard" }, 500);
  }
}

// ─── helpers ────────────────────────────────────────────────────────────────

function makeRedis(): Redis {
  const url   = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_READ_ONLY_TOKEN;
  if (!url || !token) throw new Error("Redis env vars not configured");
  return new Redis({ url, token });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      // Allow the Vite dev server (any origin) to call these during local dev.
      // Tighten this to your production domain once you go live.
      "Access-Control-Allow-Origin": "*",
    },
  });
}
