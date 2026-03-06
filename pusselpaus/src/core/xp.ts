/* ── XP / Level system ──
 *
 *  Formula:  xpToNextLevel(n) = floor(5 * n^2.5 + 30)
 *
 *  Progression examples:
 *    Level 1→2:    35 XP   (~1 game)
 *    Level 2→3:    58 XP   (~1–2 games)
 *    Level 3→4:    86 XP   (~2 games)
 *    Level 5→6:   186 XP   (~4 games)
 *    Level 10→11:  611 XP   (~15 games)
 *    Level 20→21: 2,818 XP
 *    Level 50→51: 17,708 XP
 *    Level 99→100: 97,539 XP
 *
 *  Total XP for level 100: ~13.8 million
 *  At ~40 XP per win × 100 games/day → ~9.5 years
 *
 *  Max level: 100
 */

/** Max level a player can reach */
export const MAX_LEVEL = 100;

/** XP needed to go from level `n` to level `n+1` */
export function xpToNextLevel(n: number): number {
  if (n < 1 || n >= MAX_LEVEL) return Infinity;
  return Math.floor(5 * Math.pow(n, 2.5) + 30);
}

/** Total cumulative XP needed to reach a given level (level 1 = 0 XP) */
export function totalXpForLevel(level: number): number {
  if (level <= 1) return 0;
  let total = 0;
  for (let n = 1; n < level; n++) {
    total += xpToNextLevel(n);
  }
  return total;
}

/** Given cumulative XP, compute the current level (1–100) */
export function levelFromXp(xp: number): number {
  let level = 1;
  let remaining = xp;
  while (level < MAX_LEVEL) {
    const needed = xpToNextLevel(level);
    if (remaining < needed) break;
    remaining -= needed;
    level++;
  }
  return level;
}

/** Progress within the current level as a fraction 0–1 */
export function levelProgress(xp: number): number {
  const level = levelFromXp(xp);
  if (level >= MAX_LEVEL) return 1;
  const base = totalXpForLevel(level);
  const needed = xpToNextLevel(level);
  return Math.min(1, (xp - base) / needed);
}

/* ── XP rewards ── */

export interface XpRewardParams {
  /** Which game was completed */
  gameId: string;
  /** Did the player win / complete the puzzle? */
  won: boolean;
  /** Game difficulty */
  difficulty?: string;
  /** Was this a multiplayer match? */
  multiplayer?: boolean;
}

/**
 * Calculate XP reward for completing a game.
 *
 *  Base:       15 XP for completing any game
 *  Difficulty: easy +5, medium +15, hard +25, expert +35
 *  Win bonus:  +10
 *  Multiplayer win: +20 extra
 */
export function calculateXpReward(params: XpRewardParams): number {
  let xp = 15; // base

  // difficulty bonus
  const diffBonus: Record<string, number> = {
    easy: 5,
    medium: 15,
    hard: 25,
    expert: 35,
  };
  xp += diffBonus[params.difficulty ?? 'medium'] ?? 10;

  // win bonus
  if (params.won) {
    xp += 10;
  }

  // multiplayer win bonus
  if (params.multiplayer && params.won) {
    xp += 20;
  }

  return xp;
}
