/* ── Sifferstigen – localStorage persistence ── */

import type { Difficulty, SavedGame, Stats } from './types';
import { emptyStats } from './types';
import type { Puzzle } from './types';

const KEYS = {
  GAME: 'pusselpaus:numberpath:game',
  STATS: 'pusselpaus:numberpath:stats',
} as const;

/* ── Game save / load ── */

export function saveGame(
  puzzle: Puzzle,
  pathCells: number[],
  elapsed: number,
): void {
  const data: SavedGame = {
    id: puzzle.id,
    rows: puzzle.rows,
    cols: puzzle.cols,
    solutions: puzzle.cells.map((c) => c.solution),
    givens: puzzle.cells.map((c) => c.given),
    pathCells,
    difficulty: puzzle.difficulty,
    elapsed,
    savedAt: new Date().toISOString(),
  };
  localStorage.setItem(KEYS.GAME, JSON.stringify(data));
}

export function loadGame(): SavedGame | null {
  try {
    const raw = localStorage.getItem(KEYS.GAME);
    if (!raw) return null;
    return JSON.parse(raw) as SavedGame;
  } catch {
    return null;
  }
}

export function clearGame(): void {
  localStorage.removeItem(KEYS.GAME);
}

export function rehydratePuzzle(saved: SavedGame): Puzzle {
  return {
    id: saved.id,
    rows: saved.rows,
    cols: saved.cols,
    difficulty: saved.difficulty,
    cells: saved.solutions.map((sol, i) => ({
      solution: sol,
      given: saved.givens[i],
    })),
  };
}

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

export function recordWin(difficulty: Difficulty, elapsed: number): Stats {
  const stats = loadStats();
  const s = stats[difficulty];
  s.played++;
  s.won++;
  if (s.bestTime === null || elapsed < s.bestTime) {
    s.bestTime = elapsed;
  }
  saveStats(stats);
  return stats;
}

export function recordLoss(difficulty: Difficulty): Stats {
  const stats = loadStats();
  stats[difficulty].played++;
  saveStats(stats);
  return stats;
}
