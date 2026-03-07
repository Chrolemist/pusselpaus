/* ── Active-match localStorage helpers ── */

import type { ActiveMatchPayload } from './types';

const KEY_PREFIX = 'pusselpaus:mp:active:';
const PENDING_MATCHMAKING_CLEANUP_KEY = 'pusselpaus:mp:pending-cleanup';

export interface PendingMatchmakingCleanupPayload {
  setAt: string;
  reason?: string;
}

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

export function clearAllActiveMatches(): void {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key?.startsWith(KEY_PREFIX)) keysToRemove.push(key);
  }
  for (const key of keysToRemove) {
    localStorage.removeItem(key);
  }
}

export function getPendingMatchmakingCleanup(): PendingMatchmakingCleanupPayload | null {
  const raw = localStorage.getItem(PENDING_MATCHMAKING_CLEANUP_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PendingMatchmakingCleanupPayload;
    return parsed?.setAt ? parsed : null;
  } catch {
    return null;
  }
}

export function setPendingMatchmakingCleanup(reason?: string): void {
  localStorage.setItem(
    PENDING_MATCHMAKING_CLEANUP_KEY,
    JSON.stringify({
      setAt: new Date().toISOString(),
      reason,
    } satisfies PendingMatchmakingCleanupPayload),
  );
}

export function clearPendingMatchmakingCleanup(): void {
  localStorage.removeItem(PENDING_MATCHMAKING_CLEANUP_KEY);
}
