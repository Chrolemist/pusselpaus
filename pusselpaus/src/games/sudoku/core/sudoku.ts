import {
  type Board,
  type Cell,
  type Difficulty,
  CLUES_REMOVED,
  ALL_INDICES,
  row,
  col,
  box,
  peers,
} from './types';
import { createSeededRandom, normalizeSeed } from '../../../utils/seededRandom';

function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function solve(
  grid: number[],
  rng: () => number,
  stopAtTwo = false,
  solutions: { count: number } = { count: 0 },
): boolean {
  const empty = grid.indexOf(0);
  if (empty === -1) {
    solutions.count++;
    return solutions.count >= (stopAtTwo ? 2 : 1);
  }

  const r = row(empty);
  const c = col(empty);
  const b = box(empty);

  const used = new Set<number>();
  for (const i of ALL_INDICES) {
    if (row(i) === r || col(i) === c || box(i) === b) {
      if (grid[i] !== 0) used.add(grid[i]);
    }
  }

  const candidates = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9].filter((n) => !used.has(n)), rng);

  for (const num of candidates) {
    grid[empty] = num;
    if (solve(grid, rng, stopAtTwo, solutions)) return true;
  }

  grid[empty] = 0;
  return false;
}

function generateSolvedGrid(rng: () => number): number[] {
  const grid = new Array(81).fill(0);
  solve(grid, rng);
  return grid;
}

function hasUniqueSolution(grid: number[], rng: () => number): boolean {
  const copy = [...grid];
  const solutions = { count: 0 };
  solve(copy, rng, true, solutions);
  return solutions.count === 1;
}

export function generateBoard(difficulty: Difficulty, seed?: number): Board {
  const rng = createSeededRandom(normalizeSeed(seed));
  const solution = generateSolvedGrid(rng);
  const puzzle = [...solution];

  const toRemove = CLUES_REMOVED[difficulty];
  const indices = shuffle([...ALL_INDICES], rng);

  let removed = 0;
  for (const i of indices) {
    if (removed >= toRemove) break;

    const backup = puzzle[i];
    puzzle[i] = 0;

    if (hasUniqueSolution(puzzle, rng)) {
      removed++;
    } else {
      puzzle[i] = backup;
    }
  }

  return solution.map((sol, i): Cell => ({
    solution: sol,
    value: puzzle[i],
    given: puzzle[i] !== 0,
    notes: new Set<number>(),
  }));
}

export function findConflicts(board: Board): Set<number> {
  const conflicts = new Set<number>();

  for (const i of ALL_INDICES) {
    const v = board[i].value;
    if (v === 0) continue;

    for (const p of peers(i)) {
      if (board[p].value === v) {
        conflicts.add(i);
        conflicts.add(p);
      }
    }
  }

  return conflicts;
}

export function isSolved(board: Board): boolean {
  return board.every((cell) => cell.value === cell.solution);
}

export function setValue(board: Board, index: number, value: number): Board {
  if (board[index].given) return board;
  return board.map((cell, i) =>
    i === index
      ? { ...cell, value, notes: value !== 0 ? new Set<number>() : cell.notes }
      : cell,
  );
}

export function toggleNote(board: Board, index: number, num: number): Board {
  if (board[index].given || board[index].value !== 0) return board;
  return board.map((cell, i) => {
    if (i !== index) return cell;
    const next = new Set(cell.notes);
    if (next.has(num)) next.delete(num);
    else next.add(num);
    return { ...cell, notes: next };
  });
}
