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
import {
  ensureAudio,
  playStepNote,
  playUndoNote,
  playWinMelody,
  disposeAudio,
} from '../audio/marimba';
import { useCoinRewards } from '../../../hooks/useCoinRewards';
import { useServerGameStats } from '../../../hooks/useServerGameStats';
import { useMultiplayerGame } from '../../../multiplayer';

export type Phase = 'idle' | 'picking' | 'playing' | 'won';

export type CellState = 'empty' | 'given' | 'path' | 'head' | 'hint';

export function useNumberPath() {
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [pathCells, setPathCells] = useState<number[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [hintCell, setHintCell] = useState<number | null>(null);
  const [hintsUsed, setHintsUsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const { rewardWin, awardXp } = useCoinRewards();
  const { syncGameResult } = useServerGameStats();
  const { submitResult: submitMatchResult, isActive: isMultiplayer } = useMultiplayerGame('numberpath');

  /* ── timer ── */
  useEffect(() => {
    if (phase === 'playing') {
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [phase]);

  /* ── dispose audio on unmount ── */
  useEffect(() => {
    return () => disposeAudio();
  }, []);

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
        if (i === hintCell) return 'hint';
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

  const newGame = useCallback(async (difficulty: Difficulty, seed?: number) => {
    await ensureAudio();
    const p = generatePuzzle(difficulty, seed);
    setPuzzle(p);
    const startCell = p.cells.findIndex((c) => c.solution === 1);
    setPathCells([startCell]);
    setElapsed(0);
    setHintCell(null);
    setHintsUsed(0);
    setPhase('playing');
    clearGame();
    playStepNote(0); // first note for step 1
  }, []);

  const resumeGame = useCallback(async () => {
    await ensureAudio();
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
      setHintCell(null); // clear hint on move

      // Haptic feedback on mobile
      navigator.vibrate?.(8);

      // Audio: ascending C-major note for the new step
      playStepNote(newPath.length - 1);

      // Win check
      if (newPath.length === puzzle.rows * puzzle.cols) {
        clearInterval(timerRef.current);
        setPhase('won');
        recordWin(puzzle.difficulty, elapsed);
        void rewardWin('numberpath', puzzle.difficulty);
        void awardXp({ gameId: 'numberpath', won: true, difficulty: puzzle.difficulty, multiplayer: isMultiplayer });
        void submitMatchResult({
          elapsedSeconds: elapsed,
        });
        void syncGameResult({
          gameId: 'numberpath',
          playedDelta: 1,
          wonDelta: 1,
          bestTime: elapsed,
        });
        clearGame();
        // Short delay then play win melody (after the last step note fades)
        setTimeout(() => playWinMelody(), 300);
      }

      return true;
    },
    [puzzle, phase, pathCells, pathIndexMap, elapsed, rewardWin, awardXp, isMultiplayer, submitMatchResult, syncGameResult],
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
    playUndoNote(pathCells.length - 2);
    navigator.vibrate?.(5);
  }, [puzzle, phase, pathCells.length]);

  const clearPath = useCallback(() => {
    if (!puzzle || phase !== 'playing') return;
    setPathCells((prev) => prev.slice(0, 1));
    setHintCell(null);
  }, [puzzle, phase]);

  const showHint = useCallback(() => {
    if (!puzzle || phase !== 'playing') return;
    // The next step in the solution: find the cell whose solution == currentStep + 1
    const nextStep = pathCells.length + 1;
    const idx = puzzle.cells.findIndex((c) => c.solution === nextStep);
    if (idx === -1) return;
    setHintCell(idx);
    setHintsUsed((h) => h + 1);
    navigator.vibrate?.(12);
  }, [puzzle, phase, pathCells.length]);

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
    showHint,
    hintCell,
    hintsUsed,
  } as const;
}
