/**
 * api/leaderboard/submit.ts  — Vercel Edge Function
 *
 * POST /api/leaderboard/submit
 * Body: JSON matching SubmitPayload
 *
 * Validates the payload, stamps it with an id/seedHex/createdAt, writes it
 * to the appropriate sorted set, then prunes to the top 100 entries.
 *
 * The Upstash credentials live ONLY in Vercel's environment variables
 * (without the VITE_ prefix) and are never shipped to the browser.
 */

import { Redis } from "@upstash/redis";
import type { LeaderboardEntry, SubmitPayload } from "../../src/leaderboard.types.ts";

export const config = { runtime: "edge" };

const KEEP_TOP       = 100;
const VALID_GRID_SIZES = new Set([3, 4, 5, 6, 8]);
const lbKey = (gridSize: number) => `lb:${gridSize}`;

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  let payload: SubmitPayload;
  try {
    payload = (await request.json()) as SubmitPayload;
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  // Basic server-side validation — never trust the client.
  const validationError = validate(payload);
  if (validationError) return json({ error: validationError }, 400);

  const redis = makeRedis();

  try {
    const entry: LeaderboardEntry = {
      ...payload,
      id:        `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      seedHex:   seedToHex(payload.seed),
      createdAt: new Date().toISOString(),
    };

    const key    = lbKey(payload.gridSize);
    const member = JSON.stringify(entry);

    // ZADD score member, then prune to top KEEP_TOP
    await redis.zadd(key, { score: payload.score, member });
    await redis.zremrangebyrank(key, 0, -(KEEP_TOP + 1));

    return json({ success: true, id: entry.id });
  } catch (err) {
    console.error("[leaderboard] submit failed:", err);
    return json({ error: "Submit failed" }, 500);
  }
}

// ─── helpers ────────────────────────────────────────────────────────────────

function validate(p: SubmitPayload): string | null {
  if (!p || typeof p !== "object")          return "Missing payload";
  if (typeof p.playerName   !== "string" ||
      p.playerName.trim() === "")           return "playerName is required";
  if (p.playerName.length > 32)             return "playerName too long";
  if (typeof p.strategyCode !== "string" ||
      p.strategyCode.trim() === "")         return "strategyCode is required";
  if (p.strategyCode.length > 50_000)       return "strategyCode too long";
  if (typeof p.seed !== "number")           return "seed must be a number";
  if (!VALID_GRID_SIZES.has(p.gridSize))    return "Invalid gridSize";
  if (typeof p.score !== "number" ||
      p.score < 0)                          return "score must be a non-negative number";
  if (typeof p.maxTile !== "number" ||
      p.maxTile < 2)                        return "maxTile is invalid";
  if (typeof p.moveCount !== "number" ||
      p.moveCount < 1)                      return "moveCount is invalid";
  return null;
}

function makeRedis(): Redis {
  const url   = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error("Redis env vars not configured");
  return new Redis({ url, token });
}

function seedToHex(seed: number): string {
  return "0x" + (seed >>> 0).toString(16).toUpperCase().padStart(8, "0");
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
