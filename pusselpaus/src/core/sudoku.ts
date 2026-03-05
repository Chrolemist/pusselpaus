// ─── Sudoku generator & validator ────────────────────────────
// Pure TypeScript – NO React or DOM code.

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

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

/** Fisher-Yates shuffle (mutates in place, returns same array) */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ────────────────────────────────────────────────────────────
// Solver (back-tracking, used internally)
// ────────────────────────────────────────────────────────────

/**
 * Solve a grid in-place.  Returns `true` if a solution exists.
 * `grid` is a flat 81-element number[] (0 = empty).
 * When `stopAtTwo` is true, returns `true` as soon as a *second*
 * solution is found → useful for uniqueness check.
 */
function solve(
  grid: number[],
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

  // Collect used values from peers
  const used = new Set<number>();
  for (const i of ALL_INDICES) {
    if (row(i) === r || col(i) === c || box(i) === b) {
      if (grid[i] !== 0) used.add(grid[i]);
    }
  }

  const candidates = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9].filter((n) => !used.has(n)));

  for (const num of candidates) {
    grid[empty] = num;
    if (solve(grid, stopAtTwo, solutions)) return true;
  }

  grid[empty] = 0;
  return false;
}

// ────────────────────────────────────────────────────────────
// Generator
// ────────────────────────────────────────────────────────────

/** Generate a fully solved grid (flat number[81]) */
function generateSolvedGrid(): number[] {
  const grid = new Array(81).fill(0);
  solve(grid);
  return grid;
}

/** Check that the puzzle has a unique solution */
function hasUniqueSolution(grid: number[]): boolean {
  const copy = [...grid];
  const solutions = { count: 0 };
  solve(copy, true, solutions);
  return solutions.count === 1;
}

/**
 * Generate a new Sudoku board with the given difficulty.
 * Returns a `Board` (array of 81 `Cell` objects).
 */
export function generateBoard(difficulty: Difficulty): Board {
  const solution = generateSolvedGrid();
  const puzzle = [...solution];

  const toRemove = CLUES_REMOVED[difficulty];
  const indices = shuffle([...ALL_INDICES]);

  let removed = 0;
  for (const i of indices) {
    if (removed >= toRemove) break;

    const backup = puzzle[i];
    puzzle[i] = 0;

    if (hasUniqueSolution(puzzle)) {
      removed++;
    } else {
      puzzle[i] = backup; // put it back – removing breaks uniqueness
    }
  }

  return solution.map((sol, i): Cell => ({
    solution: sol,
    value: puzzle[i],
    given: puzzle[i] !== 0,
    notes: new Set<number>(),
  }));
}

// ────────────────────────────────────────────────────────────
// Validation
// ────────────────────────────────────────────────────────────

/**
 * Returns a Set of indices whose *current value* conflicts
 * with a peer (same row / col / box) that holds the same value.
 * Given cells are included if they visually conflict (shouldn't
 * happen with a valid puzzle, but we check anyway).
 */
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

/**
 * Is the board completely and correctly filled?
 */
export function isSolved(board: Board): boolean {
  return board.every((cell) => cell.value === cell.solution);
}

/**
 * Place a value in a cell. Returns a *new* Board (immutable update).
 * If `value` is 0, the cell is cleared.
 */
export function setValue(board: Board, index: number, value: number): Board {
  if (board[index].given) return board; // can't overwrite givens
  return board.map((cell, i) =>
    i === index
      ? { ...cell, value, notes: value !== 0 ? new Set<number>() : cell.notes }
      : cell,
  );
}

/**
 * Toggle a pencil-mark note for a cell. Returns a new Board.
 */
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
