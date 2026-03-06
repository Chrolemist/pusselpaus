/* ── Shared multiplayer types ── */

export interface ActiveMatchPayload {
  matchId: string;
  setAt: string;
  configSeed?: number;
  config?: Record<string, unknown>;
  /** When true, StagingScreen shows the match-found overlay on load */
  showOverlay?: boolean;
  /** True if this match came from random matchmaking (stricter auto-forfeit) */
  matchmade?: boolean;
}

export type MatchConfig = Record<string, string | number | boolean | null>;
