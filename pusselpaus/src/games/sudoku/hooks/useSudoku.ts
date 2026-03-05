import { useState, useCallback, useEffect, useRef } from 'react';
import type { Board, Difficulty } from '../core/types';
import {
  generateBoard,
  findConflicts,
  isSolved,
  setValue,
  toggleNote,
} from '../core/sudoku';
import {
  saveGame,
  loadGame,
  clearGame,
  rehydrateBoard,
  recordPlay,
  recordWin,
} from '../core/storage';
import { useCoinRewards } from '../../../hooks/useCoinRewards';
import { useServerGameStats } from '../../../hooks/useServerGameStats';
import { useMultiplayer } from '../../../hooks/useMultiplayer';

export interface SudokuState {
  board: Board;
  difficulty: Difficulty;
  selectedIndex: number | null;
  conflicts: Set<number>;
  noteMode: boolean;
  solved: boolean;
  elapsed: number;
  paused: boolean;
}

export function useSudoku() {
  const [state, setState] = useState<SudokuState | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { rewardWin } = useCoinRewards();
  const { syncGameResult } = useServerGameStats();
  const { submitResultForGame } = useMultiplayer();

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    stopTimer();
    timerRef.current = setInterval(() => {
      setState((prev) => {
        if (!prev || prev.paused || prev.solved) return prev;
        return { ...prev, elapsed: prev.elapsed + 1 };
      });
    }, 1000);
  }, [stopTimer]);

  useEffect(() => () => stopTimer(), [stopTimer]);

  const newGame = useCallback(
    (difficulty: Difficulty) => {
      const board = generateBoard(difficulty);
      recordPlay(difficulty);
      setState({
        board,
        difficulty,
        selectedIndex: null,
        conflicts: new Set(),
        noteMode: false,
        solved: false,
        elapsed: 0,
        paused: false,
      });
      startTimer();
      void syncGameResult({ gameId: 'sudoku', playedDelta: 1 });
    },
    [startTimer, syncGameResult],
  );

  const resumeGame = useCallback(() => {
    const saved = loadGame();
    if (!saved) return false;
    const board = rehydrateBoard(saved);
    setState({
      board,
      difficulty: saved.difficulty,
      selectedIndex: null,
      conflicts: findConflicts(board),
      noteMode: false,
      solved: false,
      elapsed: saved.elapsed,
      paused: false,
    });
    startTimer();
    return true;
  }, [startTimer]);

  const selectCell = useCallback((index: number | null) => {
    setState((prev) => (prev ? { ...prev, selectedIndex: index } : prev));
  }, []);

  const inputNumber = useCallback(
    (num: number) => {
      setState((prev) => {
        if (!prev || prev.selectedIndex === null || prev.solved) return prev;

        let board: Board;
        if (prev.noteMode) {
          board = toggleNote(prev.board, prev.selectedIndex, num);
        } else {
          board = setValue(prev.board, prev.selectedIndex, num);
        }

        const conflicts = findConflicts(board);
        const solved = isSolved(board);

        if (solved) {
          stopTimer();
          clearGame();
          recordWin(prev.difficulty, prev.elapsed);
          void rewardWin('sudoku', prev.difficulty);
          void submitResultForGame('sudoku', {
            elapsedSeconds: prev.elapsed,
          });
          void syncGameResult({
            gameId: 'sudoku',
            wonDelta: 1,
            bestTime: prev.elapsed,
          });
        }

        return { ...prev, board, conflicts, solved };
      });
    },
    [stopTimer, rewardWin, submitResultForGame, syncGameResult],
  );

  const erase = useCallback(() => {
    setState((prev) => {
      if (!prev || prev.selectedIndex === null || prev.solved) return prev;
      const board = setValue(prev.board, prev.selectedIndex, 0);
      return { ...prev, board, conflicts: findConflicts(board) };
    });
  }, []);

  const toggleNoteMode = useCallback(() => {
    setState((prev) => (prev ? { ...prev, noteMode: !prev.noteMode } : prev));
  }, []);

  const togglePause = useCallback(() => {
    setState((prev) => (prev ? { ...prev, paused: !prev.paused } : prev));
  }, []);

  useEffect(() => {
    if (state && !state.solved) {
      saveGame(state.board, state.difficulty, state.elapsed);
    }
  }, [state]);

  return {
    state,
    newGame,
    resumeGame,
    selectCell,
    inputNumber,
    erase,
    toggleNoteMode,
    togglePause,
  };
}
