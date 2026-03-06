import { useCallback } from 'react';
import { useAuth } from '../auth';
import { supabase } from '../lib/supabaseClient';
import { calculateXpReward, levelFromXp, levelUpCoinBonus, type XpRewardParams } from '../core/xp';

export const COIN_AWARDED_EVENT = 'pusselpaus:coins-awarded';
export const LEVEL_UP_EVENT = 'pusselpaus:level-up';
export const XP_AWARDED_EVENT = 'pusselpaus:xp-awarded';

/* ── Coin tables (rebalanced – much stingier) ── */

const WIN_COINS = {
  sudoku: {
    easy: 3,
    medium: 5,
    hard: 8,
    expert: 12,
  },
  numberpath: {
    easy: 2,
    medium: 4,
    hard: 7,
  },
  rytmrush: {
    easy: 3,
    medium: 5,
    hard: 8,
  },
} as const;

type GameKey = keyof typeof WIN_COINS;

type DifficultyKey = 'easy' | 'medium' | 'hard' | 'expert';

export function useCoinRewards() {
  const { user, refreshProfile } = useAuth();

  /* ── Coins ── */

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

    emitCoinsAwarded(amount);
    return amount;
  }, [user, emitCoinsAwarded]);

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
    const scoreCoins = Math.floor(params.score / 5000);
    const accuracyCoins = Math.floor(params.hitRate * 3);
    const survivalCoins = Math.floor(params.survivedSeconds / 60);
    const clearBonus = params.cleared ? 4 : 0;
    const total = Math.min(20, Math.max(1, scoreCoins + accuracyCoins + survivalCoins + clearBonus));
    return addCoins(total);
  }, [addCoins]);

  /* ── XP ── */

  const awardXp = useCallback(async (params: XpRewardParams) => {
    if (!user) return { xp: 0, leveledUp: false, newLevel: 1 };

    const xpGain = calculateXpReward(params);

    const { data: profile } = await supabase
      .from('profiles')
      .select('xp, level')
      .eq('id', user.id)
      .single();

    if (!profile) return { xp: xpGain, leveledUp: false, newLevel: 1 };

    const oldXp = profile.xp ?? 0;
    const newXp = oldXp + xpGain;
    const oldLevel = profile.level ?? 1;
    const newLevel = levelFromXp(newXp);

    const { error } = await supabase
      .from('profiles')
      .update({ xp: newXp, level: newLevel })
      .eq('id', user.id);

    if (error) {
      console.error('[XP] Could not award XP:', error);
      return { xp: xpGain, leveledUp: false, newLevel: oldLevel };
    }

    // Emit XP event
    window.dispatchEvent(new CustomEvent(XP_AWARDED_EVENT, { detail: { xp: xpGain } }));

    // Emit level-up event + award coin bonus
    const leveledUp = newLevel > oldLevel;
    if (leveledUp) {
      const coinBonus = levelUpCoinBonus(newLevel);
      window.dispatchEvent(new CustomEvent(LEVEL_UP_EVENT, { detail: { oldLevel, newLevel } }));
      // Award the coin bonus (fire-and-forget, separate from the XP update)
      await addCoins(coinBonus);
    }

    await refreshProfile();
    return { xp: xpGain, leveledUp, newLevel };
  }, [user, refreshProfile]);

  return { rewardWin, rewardRytmRushPerformance, awardXp } as const;
}
