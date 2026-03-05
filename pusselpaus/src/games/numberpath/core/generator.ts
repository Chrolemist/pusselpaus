/* ── Sifferstigen – puzzle generator ── */

import type { Difficulty, Puzzle, GridConfig, PuzzleCell } from './types';
import { GRID_CONFIGS } from './types';

/* ── helpers ── */

export function getNeighbors(pos: number, rows: number, cols: number): number[] {
  const r = Math.floor(pos / cols);
  const c = pos % cols;
  const out: number[] = [];
  if (r > 0)        out.push((r - 1) * cols + c);
  if (r < rows - 1) out.push((r + 1) * cols + c);
  if (c > 0)        out.push(r * cols + (c - 1));
  if (c < cols - 1) out.push(r * cols + (c + 1));
  return out;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ── Hamiltonian-path generator (Warnsdorff heuristic + backtracking) ── */

function generateHamiltonianPath(rows: number, cols: number): number[] | null {
  const total = rows * cols;
  const visited = new Uint8Array(total);
  const path: number[] = [];
  let backtracks = 0;
  const MAX_BACKTRACKS = 50_000;

  const starts = shuffle(Array.from({ length: total }, (_, i) => i));

  for (const start of starts.slice(0, 8)) {
    path.length = 0;
    visited.fill(0);
    backtracks = 0;
    if (dfs(start)) return path;
  }
  return null;

  function dfs(pos: number): boolean {
    path.push(pos);
    visited[pos] = 1;
    if (path.length === total) return true;

    // Warnsdorff: sort unvisited neighbours by their own unvisited-neighbour count
    const raw = getNeighbors(pos, rows, cols).filter((n) => !visited[n]);
    const scored = raw.map((n) => ({
      cell: n,
      score: getNeighbors(n, rows, cols).filter((nn) => !visited[nn]).length,
    }));
    scored.sort((a, b) => a.score - b.score);

    // Shuffle within same-score groups for variety
    const ordered: number[] = [];
    let i = 0;
    while (i < scored.length) {
      let j = i;
      while (j < scored.length && scored[j].score === scored[i].score) j++;
      ordered.push(...shuffle(scored.slice(i, j).map((s) => s.cell)));
      i = j;
    }

    for (const next of ordered) {
      if (dfs(next)) return true;
      if (++backtracks > MAX_BACKTRACKS) return false;
    }

    path.pop();
    visited[pos] = 0;
    return false;
  }
}

/* ── Clue selection ── */

function selectClues(solution: number[], total: number, config: GridConfig): boolean[] {
  const given = new Array<boolean>(total).fill(false);

  // Always reveal start (1) and end (N)
  given[solution.indexOf(1)] = true;
  given[solution.indexOf(total)] = true;

  const targetCount = Math.max(3, Math.round(total * config.revealRatio));
  let revealed = 2;

  // Evenly spaced along the solution path
  const step = Math.max(1, Math.floor(total / targetCount));
  for (let v = 1 + step; v < total && revealed < targetCount; v += step) {
    const idx = solution.indexOf(v);
    if (!given[idx]) {
      given[idx] = true;
      revealed++;
    }
  }

  // Fill remaining randomly
  const pool = shuffle(
    Array.from({ length: total }, (_, i) => i).filter((i) => !given[i]),
  );
  for (const idx of pool) {
    if (revealed >= targetCount) break;
    given[idx] = true;
    revealed++;
  }

  return given;
}

/* ── Public API ── */

export function generatePuzzle(difficulty: Difficulty): Puzzle {
  const config = GRID_CONFIGS[difficulty];
  const { rows, cols } = config;
  const total = rows * cols;

  let path: number[] | null = null;
  for (let attempt = 0; attempt < 20 && !path; attempt++) {
    path = generateHamiltonianPath(rows, cols);
  }
  if (!path) throw new Error('Kunde inte generera pussel');

  // solution[cellIndex] = step value (1-based)
  const solution = new Array<number>(total).fill(0);
  path.forEach((cellIdx, step) => {
    solution[cellIdx] = step + 1;
  });

  const givens = selectClues(solution, total, config);

  const cells: PuzzleCell[] = solution.map((sol, i) => ({
    solution: sol,
    given: givens[i],
  }));

  return {
    id: crypto.randomUUID(),
    rows,
    cols,
    cells,
    difficulty,
  };
}
