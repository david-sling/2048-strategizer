/**
 * useLeaderboard.ts — Leaderboard client hook.
 *
 * All Redis access is proxied through Vercel Edge Functions under /api/leaderboard/
 * so credentials never reach the browser bundle.
 *
 * GET  /api/leaderboard/:gridSize  → { entries: LeaderboardEntry[] }
 * POST /api/leaderboard/submit     → { success: boolean; id: string }
 */

import { useState, useCallback } from "react";
import type { LeaderboardEntry, SubmitPayload } from "./leaderboard.types.ts";

// Re-export types so existing consumers don't need to change their import path.
export type { LeaderboardEntry, SubmitPayload };

// ─────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────

export function useLeaderboard() {
  const [entries,      setEntries]      = useState<LeaderboardEntry[]>([]);
  const [isLoading,    setIsLoading]    = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError,  setSubmitError]  = useState<string | null>(null);

  /** Fetch the top 20 entries for a given grid size (highest score first). */
  const fetchEntries = useCallback(async (gridSize: number) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/leaderboard/${gridSize}`);
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = (await res.json()) as { entries: LeaderboardEntry[] };
      setEntries(data.entries ?? []);
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
      const res = await fetch("/api/leaderboard/submit", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? `Server error ${res.status}`);
      }
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
