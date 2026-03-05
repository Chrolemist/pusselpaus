/* ── RytmRush – types & constants ── */

/** A note event in a song chart */
export interface ChartNote {
  /** Which lane (0-based) */
  lane: number;
  /** Time in seconds from song start */
  time: number;
  /** Note name for audio, e.g. 'C4' */
  note: string;
  /** 'tap' = short hit, 'hold' = sustained */
  type: 'tap' | 'hold';
  /** Duration in seconds (only relevant for holds) */
  duration: number;
}

/** A complete song definition */
export interface Song {
  id: string;
  title: string;
  artist: string;
  bpm: number;
  lanes: number;
  /** Chart notes sorted by time */
  notes: ChartNote[];
}

/** Difficulty affects timing windows */
export type Difficulty = 'easy' | 'medium' | 'hard';

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: 'Lätt',
  medium: 'Medel',
  hard: 'Svår',
};

/** Timing windows in seconds */
export interface TimingWindows {
  perfect: number;
  great: number;
  good: number;
  miss: number;
}

export const TIMING_WINDOWS: Record<Difficulty, TimingWindows> = {
  easy:   { perfect: 0.08, great: 0.14, good: 0.22, miss: 0.30 },
  medium: { perfect: 0.05, great: 0.10, good: 0.16, miss: 0.22 },
  hard:   { perfect: 0.03, great: 0.07, good: 0.12, miss: 0.18 },
};

export type HitGrade = 'perfect' | 'great' | 'good' | 'miss';

export const GRADE_SCORES: Record<HitGrade, number> = {
  perfect: 300,
  great: 200,
  good: 100,
  miss: 0,
};

/** Runtime state of a single block on screen */
export interface BlockState {
  id: string;
  chartNote: ChartNote;
  /** Current hit result (null = not judged yet) */
  grade: HitGrade | null;
  /** Whether this hold is currently being held */
  holding: boolean;
  /** How much of the hold has been completed (0-1) */
  holdProgress: number;
}

/** Per-song stats */
export interface SongResult {
  songId: string;
  difficulty: Difficulty;
  score: number;
  maxCombo: number;
  perfects: number;
  greats: number;
  goods: number;
  misses: number;
  elapsed: number;
}

export interface DifficultyStats {
  played: number;
  won: number;
  bestScore: number | null;
  bestCombo: number | null;
}

export type Stats = Record<Difficulty, DifficultyStats>;

export function emptyStats(): Stats {
  return {
    easy:   { played: 0, won: 0, bestScore: null, bestCombo: null },
    medium: { played: 0, won: 0, bestScore: null, bestCombo: null },
    hard:   { played: 0, won: 0, bestScore: null, bestCombo: null },
  };
}

/** Lane key bindings */
export const LANE_KEYS: Record<number, string[]> = {
  0: ['d', 'D'],
  1: ['f', 'F'],
  2: ['j', 'J'],
  3: ['k', 'K'],
};

export const LANE_LABELS = ['D', 'F', 'J', 'K'];

export const LANE_COLORS = [
  '#ef4444',  // red
  '#3b82f6',  // blue
  '#22c55e',  // green
  '#facc15',  // yellow
];

/** Scroll speed: seconds visible on screen before reaching hit zone */
export const SCROLL_TIME = 2.0;
