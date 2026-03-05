// ─── Core Sudoku types ───────────────────────────────────────
// NO React / DOM code allowed here – pure TypeScript only.

/** A single cell on the board */
export interface Cell {
  /** The correct / solution value (1-9) */
  solution: number;
  /** The value currently showing (0 = empty) */
  value: number;
  /** true if the cell was pre-filled (given clue) */
  given: boolean;
  /** User-toggled pencil marks (candidates) */
  notes: Set<number>;
}

/** 9×9 board represented as a flat 81-element array */
export type Board = Cell[];

/** Difficulty presets – controls how many cells are removed */
export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';

/** Map difficulty to the number of cells to REMOVE */
export const CLUES_REMOVED: Record<Difficulty, number> = {
  easy: 30,
  medium: 40,
  hard: 50,
  expert: 56,
};

/** Coordinate helper – converts flat index ↔ row/col */
export const idx = (r: number, c: number) => r * 9 + c;
export const row = (i: number) => Math.floor(i / 9);
export const col = (i: number) => i % 9;
export const box = (i: number) =>
  Math.floor(row(i) / 3) * 3 + Math.floor(col(i) / 3);

/** All 81 indices */
export const ALL_INDICES = Array.from({ length: 81 }, (_, i) => i);

/** Get all peer indices (same row, col, or box – excluding self) */
export function peers(index: number): number[] {
  const r = row(index);
  const c = col(index);
  const b = box(index);
  const set = new Set<number>();
  for (const i of ALL_INDICES) {
    if (i !== index && (row(i) === r || col(i) === c || box(i) === b)) {
      set.add(i);
    }
  }
  return [...set];
}

/** Saved game state (serialisable to JSON) */
export interface SavedGame {
  /** Flat array of solution values */
  solution: number[];
  /** Flat array of current values (0 = empty) */
  values: number[];
  /** Which cells are given */
  givens: boolean[];
  /** Notes stored as number[][] for JSON compat */
  notes: number[][];
  difficulty: Difficulty;
  /** Elapsed seconds */
  elapsed: number;
  /** ISO timestamp when saved */
  savedAt: string;
}

/** Stats record per difficulty */
export interface DifficultyStats {
  played: number;
  won: number;
  bestTime: number | null; // seconds, null if never completed
}

/** Full stats object */
export type Stats = Record<Difficulty, DifficultyStats>;

export const emptyStats = (): Stats => ({
  easy: { played: 0, won: 0, bestTime: null },
  medium: { played: 0, won: 0, bestTime: null },
  hard: { played: 0, won: 0, bestTime: null },
  expert: { played: 0, won: 0, bestTime: null },
});
