import type { MultiplayerGameId } from './useMultiplayer';

export interface ActiveMatchPayload {
  matchId: string;
  setAt: string;
  configSeed?: number;
  config?: Record<string, unknown>;
}

const ACTIVE_MATCH_KEY_PREFIX = 'pusselpaus:mp:active:';

export function getActiveMatchPayload(gameId: MultiplayerGameId): ActiveMatchPayload | null {
  const raw = localStorage.getItem(`${ACTIVE_MATCH_KEY_PREFIX}${gameId}`);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as ActiveMatchPayload;
    if (!parsed.matchId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function getActiveMatchKey(gameId: MultiplayerGameId): string {
  return `${ACTIVE_MATCH_KEY_PREFIX}${gameId}`;
}
