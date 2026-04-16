/**
 * leaderboard.types.ts — shared types for the leaderboard feature.
 *
 * Imported by both the client hook (useLeaderboard.ts) and the
 * server-side edge functions (api/leaderboard/*) so the shapes stay
 * in sync without duplication.
 */

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
