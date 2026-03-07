/* ── useMultiplayerGame – lightweight hook for game pages ──
 *
 *  Provides everything a game page needs for multiplayer integration:
 *  - Active match detection (payload, config, seed)
 *  - Result submission (reads matchId from localStorage, calls RPC)
 *
 *  Does NOT load the full match list – keeping game pages fast.
 */

import { useCallback } from 'react';
import { useAuth } from '../auth';
import { mpSubmitResult } from './api';
import type { ActiveMatchPayload } from './types';
import { useActiveMatchPayload } from './useActiveMatchPayload';

export interface MultiplayerGameState {
  /** Whether a multiplayer match is currently active for this game */
  isActive: boolean;
  /** Full localStorage payload (matchId, config, seed, etc.) */
  payload: ActiveMatchPayload | null;
  /** Shortcut: payload.config */
  config: Record<string, unknown> | undefined;
  /** Shortcut: payload.configSeed */
  seed: number | undefined;
  /** Submit the player's result for this match. Safe to call when no match is active. */
  submitResult: (params: {
    elapsedSeconds?: number;
    score?: number;
    survivedSeconds?: number;
  }) => Promise<void>;
}

export function useMultiplayerGame(gameId: string): MultiplayerGameState {
  const { user } = useAuth();
  const payload = useActiveMatchPayload(gameId);

  const submitResult = useCallback(
    async (params: {
      elapsedSeconds?: number;
      score?: number;
      survivedSeconds?: number;
    }) => {
      await mpSubmitResult(gameId, user?.id, params);
    },
    [gameId, user?.id],
  );

  return {
    isActive: !!payload,
    payload,
    config: payload?.config ?? undefined,
    seed: payload?.configSeed,
    submitResult,
  };
}
