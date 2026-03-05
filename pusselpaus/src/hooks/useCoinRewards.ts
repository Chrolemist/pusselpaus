import { useCallback } from 'react';
import { useAuth } from '../auth';
import { supabase } from '../lib/supabaseClient';

const COIN_AWARDED_EVENT = 'pusselpaus:coins-awarded';

const WIN_COINS = {
  sudoku: {
    easy: 20,
    medium: 35,
    hard: 55,
    expert: 80,
  },
  numberpath: {
    easy: 15,
    medium: 30,
    hard: 50,
  },
  rytmrush: {
    easy: 20,
    medium: 35,
    hard: 55,
  },
} as const;

type GameKey = keyof typeof WIN_COINS;

type DifficultyKey = 'easy' | 'medium' | 'hard' | 'expert';

export function useCoinRewards() {
  const { user, refreshProfile } = useAuth();

  const emitCoinsAwarded = useCallback((amount: number) => {
    if (amount <= 0) return;
    window.dispatchEvent(new CustomEvent(COIN_AWARDED_EVENT, { detail: { amount } }));
  }, []);

  const addCoins = useCallback(async (amount: number) => {
    if (!user || amount <= 0) return 0;

    const { data: profile } = await supabase
      .from('profiles')
      .select('coins')
      .eq('id', user.id)
      .single();

    if (!profile) return 0;

    const { error } = await supabase
      .from('profiles')
      .update({ coins: profile.coins + amount })
      .eq('id', user.id);

    if (error) {
      console.error('[Coins] Could not award coins:', error);
      return 0;
    }

    await refreshProfile();
    emitCoinsAwarded(amount);
    return amount;
  }, [user, refreshProfile, emitCoinsAwarded]);

  const rewardWin = useCallback(async (game: GameKey, difficulty: DifficultyKey) => {
    const amount = WIN_COINS[game][difficulty as keyof (typeof WIN_COINS)[GameKey]];
    if (!amount) return 0;

    return addCoins(amount);
  }, [addCoins]);

  const rewardRytmRushPerformance = useCallback(async (params: {
    score: number;
    hitRate: number;
    survivedSeconds: number;
    cleared: boolean;
  }) => {
    const scoreCoins = Math.floor(params.score / 1200);
    const accuracyCoins = Math.floor(params.hitRate * 30);
    const survivalCoins = Math.floor(params.survivedSeconds / 12);
    const clearBonus = params.cleared ? 40 : 0;
    const total = Math.max(5, scoreCoins + accuracyCoins + survivalCoins + clearBonus);
    return addCoins(total);
  }, [addCoins]);

  return { rewardWin, rewardRytmRushPerformance } as const;
}
