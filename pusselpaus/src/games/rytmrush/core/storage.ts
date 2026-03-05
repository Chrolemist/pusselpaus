/* ── RytmRush – localStorage persistence ── */

import type { Stats, SongResult } from './types';
import { emptyStats } from './types';

const KEYS = {
  STATS: 'pusselpaus:rytmrush:stats',
  LAST: 'pusselpaus:rytmrush:lastResult',
} as const;

/* ── Stats ── */

export function loadStats(): Stats {
  try {
    const raw = localStorage.getItem(KEYS.STATS);
    if (!raw) return emptyStats();
    return JSON.parse(raw) as Stats;
  } catch {
    return emptyStats();
  }
}

export function saveStats(stats: Stats): void {
  localStorage.setItem(KEYS.STATS, JSON.stringify(stats));
}

export function recordResult(result: SongResult): Stats {
  const stats = loadStats();
  const s = stats[result.difficulty];
  s.played++;
  // "won" = more than 70% hit rate
  const total = result.perfects + result.greats + result.goods + result.misses;
  const hitRate = total > 0 ? (result.perfects + result.greats + result.goods) / total : 0;
  if (hitRate >= 0.7) s.won++;
  if (s.bestScore === null || result.score > s.bestScore) s.bestScore = result.score;
  if (s.bestCombo === null || result.maxCombo > s.bestCombo) s.bestCombo = result.maxCombo;
  saveStats(stats);
  // Also store last result for the results screen
  localStorage.setItem(KEYS.LAST, JSON.stringify(result));
  return stats;
}

export function loadLastResult(): SongResult | null {
  try {
    const raw = localStorage.getItem(KEYS.LAST);
    if (!raw) return null;
    return JSON.parse(raw) as SongResult;
  } catch {
    return null;
  }
}

/** This game has no "saved game" concept – it's session-based */
export function hasSavedGame(): boolean {
  return false;
}
