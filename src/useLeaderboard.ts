/**
 * useLeaderboard.ts — Upstash Redis leaderboard integration.
 *
 * One sorted set per grid size:  lb:{gridSize}
 * ZADD score = game score  (so ZREVRANGE gives highest-first)
 * Members are JSON-stringified LeaderboardEntry objects; each has a
 * unique id (timestamp + random suffix) so duplicate scores don't collide.
 *
 * Top-100 entries are kept per grid size; older low-scorers are pruned
 * automatically after each submit via ZREMRANGEBYRANK.
 */

import { Redis } from "@upstash/redis";
import { useState, useCallback } from "react";
import { seedToHex } from "./prng.ts";

const redis = new Redis({
  url:   import.meta.env.VITE_UPSTASH_REDIS_REST_URL  as string,
  token: import.meta.env.VITE_UPSTASH_REDIS_REST_TOKEN as string,
});

const KEEP_TOP = 100;
const lbKey = (gridSize: number) => `lb:${gridSize}`;

// ─────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────

export interface LeaderboardEntry {
  id:           string;   // `${timestamp}_${randomSuffix}` — ensures uniqueness
  playerName:   string;
  strategyName: string;
  strategyCode: string;   // snapshot so anyone can replay
  seed:         number;
  seedHex:      string;   // e.g. "0xDEADBEEF"
  gridSize:     number;
  score:        number;
  maxTile:      number;
  moveCount:    number;
  createdAt:    string;   // ISO-8601
}

export type SubmitPayload = Omit<LeaderboardEntry, "id" | "seedHex" | "createdAt">;

// ─────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────

export function useLeaderboard() {
  const [entries,     setEntries]     = useState<LeaderboardEntry[]>([]);
  const [isLoading,   setIsLoading]   = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  /** Fetch the top 20 entries for a given grid size (highest score first). */
  const fetchEntries = useCallback(async (gridSize: number) => {
    setIsLoading(true);
    try {
      // ZRANGE ... REV returns members from highest to lowest score.
      // The @upstash/redis SDK auto-deserializes JSON members, so the
      // result is already LeaderboardEntry[] — no manual JSON.parse needed.
      const raw = await redis.zrange<LeaderboardEntry[]>(lbKey(gridSize), 0, 19, { rev: true });
      setEntries(raw);
    } catch (err) {
      console.error("[leaderboard] fetch failed:", err);
      setEntries([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /** Submit a completed game run to the leaderboard. */
  const submitEntry = useCallback(async (payload: SubmitPayload): Promise<boolean> => {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const entry: LeaderboardEntry = {
        ...payload,
        id:        `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        seedHex:   seedToHex(payload.seed),
        createdAt: new Date().toISOString(),
      };
      const key    = lbKey(payload.gridSize);
      const member = JSON.stringify(entry);

      // ZADD score member
      await redis.zadd(key, { score: payload.score, member });

      // Prune to top KEEP_TOP (rank 0 = lowest; -(KEEP_TOP+1) = just below cutoff)
      await redis.zremrangebyrank(key, 0, -(KEEP_TOP + 1));

      return true;
    } catch (err) {
      setSubmitError((err as Error).message ?? "Submit failed");
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  return {
    entries,
    isLoading,
    isSubmitting,
    submitError,
    fetchEntries,
    submitEntry,
  };
}
