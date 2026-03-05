import type { Board, SavedGame, Stats, Difficulty } from './types';
import { emptyStats } from './types';

const KEYS = {
  GAME: 'pusselpaus:sudoku:game',
  STATS: 'pusselpaus:sudoku:stats',
} as const;

export function saveGame(board: Board, difficulty: Difficulty, elapsed: number): void {
  const data: SavedGame = {
    solution: board.map((c) => c.solution),
    values: board.map((c) => c.value),
    givens: board.map((c) => c.given),
    notes: board.map((c) => [...c.notes]),
    difficulty,
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

export function rehydrateBoard(saved: SavedGame): Board {
  return saved.solution.map((sol, i) => ({
    solution: sol,
    value: saved.values[i],
    given: saved.givens[i],
    notes: new Set(saved.notes[i]),
  }));
}

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
  const d = stats[difficulty];
  d.won += 1;
  if (d.bestTime === null || elapsed < d.bestTime) {
    d.bestTime = elapsed;
  }
  saveStats(stats);
  return stats;
}

export function recordPlay(difficulty: Difficulty): Stats {
  const stats = loadStats();
  stats[difficulty].played += 1;
  saveStats(stats);
  return stats;
}
