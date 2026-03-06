/* ── Shared multiplayer types ── */

export interface ActiveMatchPayload {
  matchId: string;
  setAt: string;
  configSeed?: number;
  config?: Record<string, unknown>;
  /** When true, StagingScreen shows the match-found overlay on load */
  showOverlay?: boolean;
}

export type MatchConfig = Record<string, string | number | boolean | null>;
