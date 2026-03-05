import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { loadGame as loadSudokuGame } from '../games/sudoku/core/storage';
import { loadGame as loadNumberPathGame } from '../games/numberpath/core/storage';

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
  },
];
