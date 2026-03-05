export interface Cell {
  solution: number;
  value: number;
  given: boolean;
  notes: Set<number>;
}

export type Board = Cell[];

export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';

export const CLUES_REMOVED: Record<Difficulty, number> = {
  easy: 30,
  medium: 40,
  hard: 50,
  expert: 56,
};

export const idx = (r: number, c: number) => r * 9 + c;
export const row = (i: number) => Math.floor(i / 9);
export const col = (i: number) => i % 9;
export const box = (i: number) =>
  Math.floor(row(i) / 3) * 3 + Math.floor(col(i) / 3);

export const ALL_INDICES = Array.from({ length: 81 }, (_, i) => i);

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

export interface SavedGame {
  solution: number[];
  values: number[];
  givens: boolean[];
  notes: number[][];
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

export const emptyStats = (): Stats => ({
  easy: { played: 0, won: 0, bestTime: null },
  medium: { played: 0, won: 0, bestTime: null },
  hard: { played: 0, won: 0, bestTime: null },
  expert: { played: 0, won: 0, bestTime: null },
});
