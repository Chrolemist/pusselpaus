/* ── Shared multiplayer types ── */

export interface ActiveMatchPayload {
  matchId: string;
  setAt: string;
  configSeed?: number;
  config?: Record<string, unknown>;
}

export type MatchConfig = Record<string, string | number | boolean | null>;
