// Client-safe leaderboard types + constants. Kept free of server-only imports
// (no `./base44`, no SDK) so client components like leaderboard.tsx can read
// the ranking window without dragging the Base44 SDK into the browser bundle.
// lib/leaderboard.ts re-exports these so its server-side import surface is
// unchanged — the same arrangement as lib/bounty-types.ts.

export interface LeaderboardEntry {
  contributorId: string;
  handle: string;
  displayName: string | null;
  readings: number;
  stations: number;
  rank: number;
}

/**
 * Rolling window the board ranks over. Lives here so the copy that states it
 * and the query that applies it cannot drift apart — which is exactly how the
 * board ended up claiming a monthly window it never applied.
 */
export const LEADERBOARD_WINDOW_DAYS = 30;
