/* ── Sifferstigen – game hook ── */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Difficulty, Puzzle } from '../core/types';
import { generatePuzzle, getNeighbors } from '../core/generator';
import {
  saveGame as persistGame,
  loadGame,
  clearGame,
  rehydratePuzzle,
  recordWin,
} from '../core/storage';

export type Phase = 'idle' | 'picking' | 'playing' | 'won';

export type CellState = 'empty' | 'given' | 'path' | 'head';

export function useNumberPath() {
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [pathCells, setPathCells] = useState<number[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);

  /* ── timer ── */
  useEffect(() => {
    if (phase === 'playing') {
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [phase]);

  /* ── auto-save on path change ── */
  useEffect(() => {
    if (puzzle && phase === 'playing' && pathCells.length > 1) {
      persistGame(puzzle, pathCells, elapsed);
    }
  }, [pathCells, puzzle, phase, elapsed]);

  /* ── detect saved game on mount ── */
  const hasSaved = !!loadGame();

  /* ── derived values ── */
  const total = puzzle ? puzzle.rows * puzzle.cols : 0;
  const currentStep = pathCells.length;
  const headCell = pathCells.length > 0 ? pathCells[pathCells.length - 1] : -1;

  const pathIndexMap = useMemo(
    () => new Map(pathCells.map((c, i) => [c, i])),
    [pathCells],
  );

  // Cell display values: on-path → step number, given → solution, else 0
  const cellValues: number[] = puzzle
    ? puzzle.cells.map((cell, i) => {
        const step = pathIndexMap.get(i);
        if (step !== undefined) return step + 1;
        if (cell.given) return cell.solution;
        return 0;
      })
    : [];

  const cellStates: CellState[] = puzzle
    ? puzzle.cells.map((cell, i) => {
        if (i === headCell) return 'head';
        if (pathIndexMap.has(i)) return 'path';
        if (cell.given) return 'given';
        return 'empty';
      })
    : [];

  const validMoves: Set<number> = useMemo(
    () =>
      puzzle && phase === 'playing' && headCell >= 0
        ? new Set(
            getNeighbors(headCell, puzzle.rows, puzzle.cols).filter((n) => {
              if (pathIndexMap.has(n)) return false;
              const cell = puzzle.cells[n];
              if (cell.given && cell.solution !== pathCells.length + 1) return false;
              return true;
            }),
          )
        : new Set<number>(),
    [puzzle, phase, headCell, pathIndexMap, pathCells.length],
  );

  /* ── actions ── */

  const newGame = useCallback((difficulty: Difficulty) => {
    const p = generatePuzzle(difficulty);
    setPuzzle(p);
    const startCell = p.cells.findIndex((c) => c.solution === 1);
    setPathCells([startCell]);
    setElapsed(0);
    setPhase('playing');
    clearGame();
  }, []);

  const resumeGame = useCallback(() => {
    const saved = loadGame();
    if (!saved) return;
    const p = rehydratePuzzle(saved);
    setPuzzle(p);
    setPathCells(saved.pathCells);
    setElapsed(saved.elapsed);
    setPhase('playing');
  }, []);

  const extendPath = useCallback(
    (cellIndex: number): boolean => {
      if (!puzzle || phase !== 'playing') return false;

      const head = pathCells[pathCells.length - 1];
      const neighbors = getNeighbors(head, puzzle.rows, puzzle.cols);
      if (!neighbors.includes(cellIndex)) return false;
      if (pathIndexMap.has(cellIndex)) return false;

      const nextStep = pathCells.length + 1;
      const cell = puzzle.cells[cellIndex];
      if (cell.given && cell.solution !== nextStep) return false;

      const newPath = [...pathCells, cellIndex];
      setPathCells(newPath);

      // Haptic feedback on mobile
      navigator.vibrate?.(8);

      // Win check
      if (newPath.length === puzzle.rows * puzzle.cols) {
        clearInterval(timerRef.current);
        setPhase('won');
        recordWin(puzzle.difficulty, elapsed);
        clearGame();
      }

      return true;
    },
    [puzzle, phase, pathCells, pathIndexMap, elapsed],
  );

  const undoTo = useCallback(
    (cellIndex: number) => {
      if (!puzzle || phase !== 'playing') return;
      const idx = pathIndexMap.get(cellIndex);
      if (idx === undefined || idx === 0) return; // can't undo start
      if (cellIndex === headCell) return; // no-op on head
      setPathCells((prev) => prev.slice(0, idx + 1));
    },
    [puzzle, phase, pathIndexMap, headCell],
  );

  const undoLast = useCallback(() => {
    if (!puzzle || phase !== 'playing') return;
    if (pathCells.length <= 1) return;
    setPathCells((prev) => prev.slice(0, -1));
    navigator.vibrate?.(5);
  }, [puzzle, phase, pathCells.length]);

  const clearPath = useCallback(() => {
    if (!puzzle || phase !== 'playing') return;
    setPathCells((prev) => prev.slice(0, 1));
  }, [puzzle, phase]);

  const handleCellClick = useCallback(
    (cellIndex: number): boolean => {
      if (!puzzle || phase !== 'playing') return false;

      // On-path cell → undo to that point
      const pos = pathIndexMap.get(cellIndex);
      if (pos !== undefined) {
        if (cellIndex === headCell) {
          undoLast();
          return true;
        }
        if (pos > 0) {
          undoTo(cellIndex);
          return true;
        }
        return false;
      }

      // Valid move → extend
      if (validMoves.has(cellIndex)) {
        return extendPath(cellIndex);
      }

      return false;
    },
    [puzzle, phase, pathIndexMap, headCell, validMoves, undoLast, undoTo, extendPath],
  );

  return {
    puzzle,
    phase,
    elapsed,
    pathCells,
    cellValues,
    cellStates,
    validMoves,
    currentStep,
    total,
    headCell,
    hasSaved,
    newGame,
    resumeGame,
    extendPath,
    undoLast,
    undoTo,
    clearPath,
    handleCellClick,
    setPhase,
  } as const;
}
