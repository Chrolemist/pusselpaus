import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { loadGame as loadSudokuGame, loadStats as loadSudokuStats } from '../games/sudoku/core/storage';
import { loadGame as loadNumberPathGame, loadStats as loadNumberPathStats } from '../games/numberpath/core/storage';

export interface GameStatsSummary {
  played: number;
  won: number;
  bestTime: number | null;
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
  },
];
