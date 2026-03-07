import { useEffect, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { driver, type Driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import confetti from 'canvas-confetti';
import { ArrowLeft, BarChart3, BookOpen, PartyPopper, X } from 'lucide-react';
import type { Board, Difficulty } from '../core/types';
import { row, col, box } from '../core/types';
import { loadGame } from '../core/storage';
import { useSudoku } from '../hooks/useSudoku';
import SudokuBoard from '../components/SudokuBoard';
import Numpad from '../components/Numpad';
import Timer from '../components/Timer';
import { LiveBanner as MultiplayerLiveBanner, MULTIPLAYER_EXIT_EVENT, MULTIPLAYER_REPLAY_EVENT, StagingScreen, type StagingResult } from '../../../multiplayer';

interface TutorialTarget {
  index: number;
  value: number;
  reason: string;
  rowSeen: number[];
  colSeen: number[];
  boxSeen: number[];
  candidates: number[];
}

function seenValues(board: Board, index: number, scope: 'row' | 'col' | 'box'): number[] {
  const values = new Set<number>();
  for (let j = 0; j < board.length; j++) {
    if (j === index) continue;
    const sameScope =
      (scope === 'row' && row(j) === row(index)) ||
      (scope === 'col' && col(j) === col(index)) ||
      (scope === 'box' && box(j) === box(index));
    if (!sameScope) continue;
    const value = board[j].value;
    if (value !== 0) values.add(value);
  }
  return [...values].sort((a, b) => a - b);
}

function findTutorialTarget(board: Board): TutorialTarget | null {
  for (let i = 0; i < board.length; i++) {
    const cell = board[i];
    if (cell.given || cell.value !== 0) continue;

    const rowSeen = seenValues(board, i, 'row');
    const colSeen = seenValues(board, i, 'col');
    const boxSeen = seenValues(board, i, 'box');
    const used = new Set<number>([...rowSeen, ...colSeen, ...boxSeen]);

    const candidates = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((n) => !used.has(n));
    if (candidates.length === 1) {
      return {
        index: i,
        value: candidates[0],
        reason: `Rad har ${rowSeen.join(', ') || 'inga'}; kolumn har ${colSeen.join(', ') || 'inga'}; 3×3-rutan har ${boxSeen.join(', ') || 'inga'}. Därför återstår bara ${candidates[0]}.`,
        rowSeen,
        colSeen,
        boxSeen,
        candidates,
      };
    }
  }

  const fallbackIndex = board.findIndex((cell) => !cell.given && cell.value === 0);
  if (fallbackIndex === -1) return null;

  const rowSeen = seenValues(board, fallbackIndex, 'row');
  const colSeen = seenValues(board, fallbackIndex, 'col');
  const boxSeen = seenValues(board, fallbackIndex, 'box');
  const used = new Set<number>([...rowSeen, ...colSeen, ...boxSeen]);
  const candidates = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((n) => !used.has(n));

  return {
    index: fallbackIndex,
    value: board[fallbackIndex].solution,
    reason: `Här finns kandidaterna ${candidates.join(', ')}. Vi demonstrerar med ${board[fallbackIndex].solution} och förklarar varför den fungerar.`,
    rowSeen,
    colSeen,
    boxSeen,
    candidates,
  };
}

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

  const [tutorialTarget, setTutorialTarget] = useState<TutorialTarget | null>(null);
  const [tutorialPhase, setTutorialPhase] = useState<'idle' | 'select-cell' | 'input-number' | 'done'>('idle');
  const [tutorialFeedback, setTutorialFeedback] = useState<string | null>(null);
  const tutorialDriverRef = useRef<Driver | null>(null);
  const confettiFired = useRef(false);
  const stagingResetRef = useRef<(() => void) | null>(null);

  /* fire confetti on win */
  useEffect(() => {
    if (state?.solved && !confettiFired.current) {
      confettiFired.current = true;
      confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
      setTimeout(() => confetti({ particleCount: 60, spread: 100, origin: { y: 0.5 } }), 250);
    }
    if (state && !state.solved) confettiFired.current = false;
  }, [state?.solved]);

  useEffect(() => {
    return () => {
      tutorialDriverRef.current?.destroy();
      tutorialDriverRef.current = null;
    };
  }, []);

  useEffect(() => {
    const handleReplay = (event: Event) => {
      const replayEvent = event as CustomEvent<{ gameId?: string }>;
      if (replayEvent.detail?.gameId !== 'sudoku') return;
      stagingResetRef.current?.();
    };

    const handleExit = (event: Event) => {
      const exitEvent = event as CustomEvent<{ gameId?: string }>;
      if (exitEvent.detail?.gameId !== 'sudoku') return;
      stagingResetRef.current?.();
    };

    window.addEventListener(MULTIPLAYER_REPLAY_EVENT, handleReplay as EventListener);
    window.addEventListener(MULTIPLAYER_EXIT_EVENT, handleExit as EventListener);
    return () => {
      window.removeEventListener(MULTIPLAYER_REPLAY_EVENT, handleReplay as EventListener);
      window.removeEventListener(MULTIPLAYER_EXIT_EVENT, handleExit as EventListener);
    };
  }, []);

  function stopTutorial() {
    tutorialDriverRef.current?.destroy();
    tutorialDriverRef.current = null;
    setTutorialTarget(null);
    setTutorialPhase('idle');
    setTutorialFeedback(null);
  }

  function startTutorial() {
    if (!state || state.solved || state.paused) return;

    const target = findTutorialTarget(state.board);
    if (!target) {
      setTutorialFeedback('Ingen bra guidruta hittades just nu. Starta ett nytt spel och försök igen.');
      return;
    }

    setTutorialTarget(target);
    setTutorialPhase('select-cell');
    setTutorialFeedback('Steg 1: klicka på den markerade rutan.');

    tutorialDriverRef.current?.destroy();

    const tutorial = driver({
      showProgress: true,
      allowClose: true,
      nextBtnText: 'Nästa',
      prevBtnText: 'Tillbaka',
      doneBtnText: 'Stäng',
      onDestroyed: () => {
        setTutorialTarget(null);
        setTutorialPhase('idle');
      },
      steps: [
        {
          element: '[data-tour="sudoku-board"]',
          popover: {
            title: 'Regler i Sudoku',
            description: 'Varje rad, kolumn och 3×3-ruta ska innehålla siffrorna 1–9 exakt en gång. Nu testar vi det på riktiga brädet.',
            side: 'bottom',
            align: 'start',
          },
        },
        {
          element: '[data-tour="sudoku-board"]',
          popover: {
            title: 'Interaktiv guide',
            description: 'Vi tar en ruta i taget: först välj rutan, sedan rätt siffra i numpaden.',
            side: 'bottom',
            align: 'start',
          },
        },
        {
          element: `[data-tour="cell-${target.index}"]`,
          popover: {
            title: 'Steg 1: välj rutan',
            description: `${target.reason} Klicka på den här rutan för att fortsätta.`,
            side: 'bottom',
            align: 'start',
            showButtons: [],
          },
        },
        {
          element: `[data-tour="numpad-${target.value}"]`,
          popover: {
            title: 'Steg 2: fyll i siffran',
            description: `Tryck nu ${target.value} i numpaden.`,
            side: 'top',
            align: 'center',
            showButtons: [],
          },
        },
        {
          element: '[data-tour="sudoku-board"]',
          popover: {
            title: 'Klart! 🎉',
            description: 'Nu har du gjort ett komplett guidat drag på riktiga brädet.',
            side: 'bottom',
            align: 'start',
          },
        },
      ],
    });

    tutorialDriverRef.current = tutorial;
    tutorial.drive();
  }

  function handleSelectCell(index: number) {
    selectCell(index);

    if (tutorialPhase === 'select-cell' && tutorialTarget) {
      if (index === tutorialTarget.index) {
        setTutorialPhase('input-number');
        setTutorialFeedback('Perfekt! Steg 2: tryck rätt siffra i numpaden.');
        tutorialDriverRef.current?.moveNext();
      } else {
        setTutorialFeedback('Bra försök! Använd den markerade rutan i guiden.');
      }
    }
  }

  function handleInputNumber(num: number) {
    if (tutorialPhase === 'input-number' && tutorialTarget) {
      if (state?.selectedIndex !== tutorialTarget.index) {
        setTutorialFeedback('Välj först den markerade rutan i steg 1.');
        return;
      }

      if (num !== tutorialTarget.value) {
        const reasonParts: string[] = [];
        if (tutorialTarget.rowSeen.includes(num)) reasonParts.push(`raden har redan ${num}`);
        if (tutorialTarget.colSeen.includes(num)) reasonParts.push(`kolumnen har redan ${num}`);
        if (tutorialTarget.boxSeen.includes(num)) reasonParts.push(`3×3-rutan har redan ${num}`);

        if (reasonParts.length > 0) {
          setTutorialFeedback(`Inte riktigt: ${reasonParts.join(', ')}. Därför kan rutan inte vara ${num}; rätt val är ${tutorialTarget.value}.`);
        } else {
          setTutorialFeedback(`Bra försök! Kandidater här är ${tutorialTarget.candidates.join(', ')} och guiden visar varför ${tutorialTarget.value} är rätt i just det här steget.`);
        }
        return;
      }

      inputNumber(num);
      setTutorialPhase('done');
      setTutorialFeedback('Snyggt! Du gjorde rätt drag med guidning.');
      tutorialDriverRef.current?.moveNext();
      return;
    }

    inputNumber(num);
  }

  /* ── StagingScreen callback ── */
  const handleStart = useCallback(
    (result: StagingResult) => {
      const diff = (result.difficulty ?? 'medium') as Difficulty;
      newGame(diff, result.seed);
    },
    [newGame],
  );

  return (
    <StagingScreen
      gameId="sudoku"
      onStart={handleStart}
      defaultDifficulty="medium"
      hasSavedGame={!!loadGame()}
      onResume={resumeGame}
      resetRef={stagingResetRef}
    >
      {/* ── Game view (only rendered after StagingScreen calls onStart) ── */}
      {state ? (
        <div className="flex min-h-full flex-col items-center gap-4 px-4 py-4">
      <div className="flex w-full max-w-[min(90vw,400px)] items-center justify-between">
        <Link
          to="/"
          className="flex items-center gap-1 text-sm text-text-muted underline underline-offset-4 hover:text-brand-light"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Lobby
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

      <MultiplayerLiveBanner gameId="sudoku" />

      <SudokuBoard
        board={state.board}
        selectedIndex={state.selectedIndex}
        conflicts={state.conflicts}
        paused={state.paused}
        onSelect={handleSelectCell}
      />

      {state.solved && (
        <div className="flex flex-col items-center gap-2 rounded-xl bg-success/20 px-6 py-4 text-center">
          <PartyPopper className="h-7 w-7 text-success" />
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
        onNumber={handleInputNumber}
        onErase={erase}
        onToggleNotes={toggleNoteMode}
        noteMode={state.noteMode}
        disabled={state.paused || state.solved}
      />

      <div className="flex items-center gap-4">
        {tutorialPhase === 'idle' ? (
          <button
            onClick={startTutorial}
            className="mt-2 flex items-center gap-1 text-xs text-text-muted underline underline-offset-4 hover:text-brand-light"
          >
            <BookOpen className="h-3.5 w-3.5" /> Starta interaktiv guide
          </button>
        ) : (
          <button
            onClick={stopTutorial}
            className="mt-2 flex items-center gap-1 text-xs text-text-muted underline underline-offset-4 hover:text-brand-light"
          >
            <X className="h-3.5 w-3.5" /> Avsluta guide
          </button>
        )}
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
          className="mt-2 flex items-center gap-1 text-xs text-text-muted underline underline-offset-4 hover:text-brand-light"
        >
          <BarChart3 className="h-3.5 w-3.5" /> Statistik
        </Link>
      </div>

      {tutorialFeedback && (
        <div className="w-full max-w-[min(90vw,400px)] rounded-lg bg-surface-card px-4 py-3 text-xs text-text-muted ring-1 ring-white/10">
          {tutorialFeedback}
        </div>
      )}
    </div>
      ) : (
        <div className="flex min-h-full items-center justify-center text-text-muted">Laddar…</div>
      )}
    </StagingScreen>
  );
}
