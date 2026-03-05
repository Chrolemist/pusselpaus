import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Difficulty } from '../core/types';
import { useSudoku } from '../hooks/useSudoku';
import SudokuBoard from '../components/SudokuBoard';
import Numpad from '../components/Numpad';
import Timer from '../components/Timer';
import DifficultyPicker from '../components/DifficultyPicker';

export default function SudokuPage() {
  const {
    state,
    newGame,
    resumeGame,
    selectCell,
    inputNumber,
    erase,
    toggleNoteMode,
    togglePause,
  } = useSudoku();

  const [difficulty, setDifficulty] = useState<Difficulty>('easy');

  useEffect(() => {
    resumeGame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!state) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-6 px-4">
        <Link
          to="/"
          className="self-start text-sm text-text-muted hover:text-brand-light"
        >
          ← Tillbaka
        </Link>

        <h2 className="text-3xl font-bold">🔢 Sudoku</h2>
        <p className="max-w-xs text-center text-sm text-text-muted">
          Välj svårighetsgrad och starta ett nytt spel.
        </p>

        <DifficultyPicker current={difficulty} onSelect={setDifficulty} />

        <button
          onClick={() => newGame(difficulty)}
          className="mt-4 rounded-xl bg-brand px-8 py-3 text-lg font-bold text-white shadow-lg transition active:scale-95"
        >
          Nytt spel
        </button>

        <Link
          to="/sudoku/stats"
          className="mt-4 text-sm text-text-muted underline underline-offset-4 hover:text-brand-light"
        >
          📊 Sudoku-statistik
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col items-center gap-4 px-4 py-4">
      <div className="flex w-full max-w-[min(90vw,400px)] items-center justify-between">
        <Link
          to="/"
          className="text-sm text-text-muted hover:text-brand-light"
        >
          ← Lobby
        </Link>
        <Timer
          elapsed={state.elapsed}
          paused={state.paused}
          onTogglePause={togglePause}
        />
      </div>

      <span className="rounded-full bg-surface-card px-3 py-1 text-xs font-semibold text-text-muted capitalize">
        {state.difficulty === 'easy' && 'Lätt'}
        {state.difficulty === 'medium' && 'Medel'}
        {state.difficulty === 'hard' && 'Svår'}
        {state.difficulty === 'expert' && 'Expert'}
      </span>

      <SudokuBoard
        board={state.board}
        selectedIndex={state.selectedIndex}
        conflicts={state.conflicts}
        paused={state.paused}
        onSelect={selectCell}
      />

      {state.solved && (
        <div className="flex flex-col items-center gap-2 rounded-xl bg-success/20 px-6 py-4 text-center">
          <span className="text-2xl">🎉</span>
          <p className="font-bold text-success">Grattis, du löste det!</p>
          <p className="text-sm text-text-muted">
            Tid:{' '}
            {String(Math.floor(state.elapsed / 60)).padStart(2, '0')}:
            {String(state.elapsed % 60).padStart(2, '0')}
          </p>
          <button
            onClick={() => newGame(state.difficulty)}
            className="mt-2 rounded-lg bg-brand px-6 py-2 text-sm font-bold text-white shadow transition active:scale-95"
          >
            Nytt spel
          </button>
        </div>
      )}

      <Numpad
        onNumber={inputNumber}
        onErase={erase}
        onToggleNotes={toggleNoteMode}
        noteMode={state.noteMode}
        disabled={state.paused || state.solved}
      />

      <div className="flex items-center gap-4">
        {!state.solved && (
          <button
            onClick={() => {
              if (confirm('Avbryta pågående spel och starta om?')) {
                newGame(state.difficulty);
              }
            }}
            className="mt-2 text-xs text-text-muted underline underline-offset-4 hover:text-brand-light"
          >
            Nytt spel
          </button>
        )}
        <Link
          to="/sudoku/stats"
          className="mt-2 text-xs text-text-muted underline underline-offset-4 hover:text-brand-light"
        >
          📊 Statistik
        </Link>
      </div>
    </div>
  );
}
