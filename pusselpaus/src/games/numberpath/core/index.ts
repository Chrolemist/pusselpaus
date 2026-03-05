export type { Difficulty, Puzzle, PuzzleCell, Stats, SavedGame } from './types';
export {
  GRID_CONFIGS,
  DIFFICULTY_LABELS,
  GRID_LABELS,
  emptyStats,
} from './types';
export { generatePuzzle, getNeighbors } from './generator';
export {
  saveGame,
  loadGame,
  clearGame,
  rehydratePuzzle,
  loadStats,
  saveStats,
  recordWin,
  recordLoss,
} from './storage';
