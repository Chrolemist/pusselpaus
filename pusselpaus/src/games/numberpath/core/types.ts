/* ── Sifferstigen – types & constants ── */

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface GridConfig {
  rows: number;
  cols: number;
  /** Approximate fraction of cells revealed as clues */
  revealRatio: number;
}

export const GRID_CONFIGS: Record<Difficulty, GridConfig> = {
  easy:   { rows: 5, cols: 5, revealRatio: 0.40 },
  medium: { rows: 6, cols: 6, revealRatio: 0.19 },
  hard:   { rows: 7, cols: 7, revealRatio: 0.10 },
};

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy:   'Lätt',
  medium: 'Medel',
  hard:   'Svår',
};

export const GRID_LABELS: Record<Difficulty, string> = {
  easy:   '5 × 5',
  medium: '6 × 6',
  hard:   '7 × 7',
};

export interface PuzzleCell {
  /** Correct step value for this cell (1-based) */
  solution: number;
  /** Whether the cell's number is shown as a clue */
  given: boolean;
}

export interface Puzzle {
  id: string;
  rows: number;
  cols: number;
  cells: PuzzleCell[];
  difficulty: Difficulty;
}

export interface SavedGame {
  id: string;
  rows: number;
  cols: number;
  solutions: number[];
  givens: boolean[];
  pathCells: number[];
  difficulty: Difficulty;
  elapsed: number;
  savedAt: string;
}

export interface DifficultyStats {
  played: number;
  won: number;
  bestTime: number | null;
}

export type Stats = Record<Difficulty, DifficultyStats>;

export function emptyStats(): Stats {
  return {
    easy:   { played: 0, won: 0, bestTime: null },
    medium: { played: 0, won: 0, bestTime: null },
    hard:   { played: 0, won: 0, bestTime: null },
  };
}
