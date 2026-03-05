import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { loadGame as loadSudokuGame } from '../games/sudoku/core/storage';

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
];
