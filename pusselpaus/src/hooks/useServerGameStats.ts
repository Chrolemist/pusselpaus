import { useCallback } from 'react';
import { useAuth } from '../auth';
import { supabase } from '../lib/supabaseClient';
import type { UserGameStat } from '../lib/database.types';

type GameId = 'sudoku' | 'numberpath' | 'rytmrush';

interface SyncGameResultParams {
  gameId: GameId;
  playedDelta?: number;
  wonDelta?: number;
  bestTime?: number | null;
  bestScore?: number | null;
}

export function useServerGameStats() {
  const { user } = useAuth();

  const syncGameResult = useCallback(async ({
    gameId,
    playedDelta = 0,
    wonDelta = 0,
    bestTime,
    bestScore,
  }: SyncGameResultParams) => {
    if (!user) return;
    if (playedDelta === 0 && wonDelta === 0 && bestTime == null && bestScore == null) return;

    const { data: existing } = await supabase
      .from('user_game_stats')
      .select('*')
      .eq('user_id', user.id)
      .eq('game_id', gameId)
      .returns<UserGameStat[]>()
      .maybeSingle();

    const nextPlayed = (existing?.played ?? 0) + playedDelta;
    const nextWon = (existing?.won ?? 0) + wonDelta;

    const nextBestTime =
      bestTime == null
        ? (existing?.best_time ?? null)
        : existing?.best_time == null
          ? bestTime
          : Math.min(existing.best_time, bestTime);

    const nextBestScore =
      bestScore == null
        ? (existing?.best_score ?? null)
        : existing?.best_score == null
          ? bestScore
          : Math.max(existing.best_score, bestScore);

    const { error } = await supabase
      .from('user_game_stats')
      .upsert(
        {
          user_id: user.id,
          game_id: gameId,
          played: nextPlayed,
          won: nextWon,
          best_time: nextBestTime,
          best_score: nextBestScore,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,game_id' },
      );

    if (error) {
      console.error('[ServerStats] Could not sync stats:', error);
    }
  }, [user]);

  return { syncGameResult } as const;
}
