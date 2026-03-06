/* ── Active-match localStorage helpers ── */

import type { ActiveMatchPayload } from './types';

const KEY_PREFIX = 'pusselpaus:mp:active:';

export function getActiveMatchKey(gameId: string): string {
  return `${KEY_PREFIX}${gameId}`;
}

export function getActiveMatchPayload(gameId: string): ActiveMatchPayload | null {
  const raw = localStorage.getItem(getActiveMatchKey(gameId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ActiveMatchPayload;
    return parsed.matchId ? parsed : null;
  } catch {
    return null;
  }
}

export function setActiveMatchPayload(gameId: string, payload: ActiveMatchPayload): void {
  localStorage.setItem(getActiveMatchKey(gameId), JSON.stringify(payload));
}

export function clearActiveMatch(gameId: string): void {
  localStorage.removeItem(getActiveMatchKey(gameId));
}
