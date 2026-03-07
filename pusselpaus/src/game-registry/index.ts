import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { loadGame as loadSudokuGame, loadStats as loadSudokuStats } from '../games/sudoku/core/storage';
import { loadGame as loadNumberPathGame, loadStats as loadNumberPathStats } from '../games/numberpath/core/storage';
import { loadStats as loadRytmRushStats } from '../games/rytmrush/core/storage';

export interface GameStatsSummary {
  played: number;
  won: number;
  bestTime: number | null;
}

export interface MultiplayerDifficulty {
  value: string;
  label: string;
}

export interface MultiplayerConfig {
  /** Available difficulty options shown in the match-creation UI */
  difficulties: MultiplayerDifficulty[];
  /** How results are ranked: 'time' = lowest wins, 'score' = highest wins */
  rankBy: 'time' | 'score';
}

export interface GameDefinition {
  id: string;
  name: string;
  emoji: string;
  description: string;
  path: string;
  statsPath?: string;
  PlayPage: LazyExoticComponent<ComponentType>;
  StatsPage?: LazyExoticComponent<ComponentType>;
  hasSavedGame?: () => boolean;
  getStats?: () => GameStatsSummary;
  /** If set, this game supports multiplayer */
  multiplayer?: MultiplayerConfig;
}

function summarizeStats(statsObj: Record<string, { played: number; won: number; bestTime: number | null }>): GameStatsSummary {
  const entries = Object.values(statsObj);
  const played = entries.reduce((a, s) => a + s.played, 0);
  const won = entries.reduce((a, s) => a + s.won, 0);
  const times = entries.map((s) => s.bestTime).filter((t): t is number => t !== null);
  const bestTime = times.length > 0 ? Math.min(...times) : null;
  return { played, won, bestTime };
}

export const games: GameDefinition[] = [
  {
    id: 'pingpong',
    name: 'Ping Pong',
    emoji: '🏓',
    description: 'Snabb duell byggd för framtida realtime multiplayer',
    path: '/pingpong',
    PlayPage: lazy(() => import('../games/pingpong/pages/PingPongPage')),
  },
  {
    id: 'sudoku',
    name: 'Sudoku',
    emoji: '🔢',
    description: 'Klassisk sifferpussel i fyra svårighetsgrader',
    path: '/sudoku',
    statsPath: '/sudoku/stats',
    PlayPage: lazy(() => import('../games/sudoku/pages/SudokuPage')),
    StatsPage: lazy(() => import('../games/sudoku/pages/SudokuStatsPage')),
    hasSavedGame: () => !!loadSudokuGame(),
    getStats: () => summarizeStats(loadSudokuStats()),
    multiplayer: {
      difficulties: [
        { value: 'easy', label: 'Lätt' },
        { value: 'medium', label: 'Medel' },
        { value: 'hard', label: 'Svår' },
        { value: 'expert', label: 'Expert' },
      ],
      rankBy: 'time',
    },
  },
  {
    id: 'numberpath',
    name: 'Sifferstigen',
    emoji: '🚶',
    description: 'Dra en stig genom rutnätet – besök alla rutor i rätt ordning',
    path: '/numberpath',
    statsPath: '/numberpath/stats',
    PlayPage: lazy(() => import('../games/numberpath/pages/NumberPathPage')),
    StatsPage: lazy(() => import('../games/numberpath/pages/NumberPathStatsPage')),
    hasSavedGame: () => !!loadNumberPathGame(),
    getStats: () => summarizeStats(loadNumberPathStats()),
    multiplayer: {
      difficulties: [
        { value: 'easy', label: 'Lätt' },
        { value: 'medium', label: 'Medel' },
        { value: 'hard', label: 'Svår' },
      ],
      rankBy: 'time',
    },
  },
  {
    id: 'rytmrush',
    name: 'RytmRush',
    emoji: '🎵',
    description: 'Tryck i takt – Guitar Hero med marimba!',
    path: '/rytmrush',
    statsPath: '/rytmrush/stats',
    PlayPage: lazy(() => import('../games/rytmrush/pages/RytmRushPage')),
    StatsPage: lazy(() => import('../games/rytmrush/pages/RytmRushStatsPage')),
    hasSavedGame: () => false,
    multiplayer: {
      difficulties: [{ value: 'easy', label: 'Standard' }],
      rankBy: 'score',
    },
    getStats: () => {
      const s = loadRytmRushStats();
      const entries = Object.values(s);
      return {
        played: entries.reduce((a, e) => a + e.played, 0),
        won: entries.reduce((a, e) => a + e.won, 0),
        bestTime: null,
      };
    },
  },
];
