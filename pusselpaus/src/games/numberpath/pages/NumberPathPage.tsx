/* ── Sifferstigen – main game page ── */

import { useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import { ArrowLeft, BarChart3, Footprints, PartyPopper, Undo2, Lightbulb, Trash2, RefreshCw } from 'lucide-react';
import PathGrid from '../components/PathGrid';
import { useNumberPath } from '../hooks/useNumberPath';
import type { Difficulty } from '../core/types';
import { DIFFICULTY_LABELS, GRID_LABELS } from '../core/types';
import { LiveBanner as MultiplayerLiveBanner, MULTIPLAYER_EXIT_EVENT, MULTIPLAYER_REPLAY_EVENT, StagingScreen, type StagingResult } from '../../../multiplayer';

/* ── helpers ── */

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/* ── Page component ── */

export default function NumberPathPage() {
  const game = useNumberPath();
  const confettiFired = useRef(false);
  const stagingResetRef = useRef<(() => void) | null>(null);

  /* fire confetti on win */
  useEffect(() => {
    if (game.phase === 'won' && !confettiFired.current) {
      confettiFired.current = true;
      confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
      setTimeout(() => {
        confetti({ particleCount: 60, spread: 100, origin: { y: 0.5 } });
      }, 250);
    }
    if (game.phase !== 'won') confettiFired.current = false;
  }, [game.phase]);

  useEffect(() => {
    const handleReplay = (event: Event) => {
      const replayEvent = event as CustomEvent<{ gameId?: string }>;
      if (replayEvent.detail?.gameId !== 'numberpath') return;
      stagingResetRef.current?.();
    };

    const handleExit = (event: Event) => {
      const exitEvent = event as CustomEvent<{ gameId?: string }>;
      if (exitEvent.detail?.gameId !== 'numberpath') return;
      stagingResetRef.current?.();
    };

    window.addEventListener(MULTIPLAYER_REPLAY_EVENT, handleReplay as EventListener);
    window.addEventListener(MULTIPLAYER_EXIT_EVENT, handleExit as EventListener);
    return () => {
      window.removeEventListener(MULTIPLAYER_REPLAY_EVENT, handleReplay as EventListener);
      window.removeEventListener(MULTIPLAYER_EXIT_EVENT, handleExit as EventListener);
    };
  }, []);

  /* ── StagingScreen callback ── */
  const handleStart = useCallback(
    (result: StagingResult) => {
      const diff = (result.difficulty ?? 'medium') as Difficulty;
      void game.newGame(diff, result.seed);
    },
    [game],
  );

  /* ── Game view ── */
  const progress = game.total > 0 ? (game.currentStep / game.total) * 100 : 0;

  return (
    <StagingScreen
      gameId="numberpath"
      onStart={handleStart}
      defaultDifficulty="medium"
      hasSavedGame={game.hasSaved}
      onResume={game.resumeGame}
      resetRef={stagingResetRef}
    >
    {game.puzzle ? (
    <div className="flex min-h-full flex-col items-center gap-4 px-4 py-6">
      {/* Header */}
      <div className="flex w-full max-w-sm items-center justify-between">
        <Link to="/" className="flex items-center gap-1 text-sm text-text-muted hover:text-brand-light">
          <ArrowLeft className="h-3.5 w-3.5" /> Lobby
        </Link>
        <span className="font-mono text-sm text-accent">{fmt(game.elapsed)}</span>
        <Link
          to="/numberpath/stats"
          className="text-sm text-text-muted hover:text-brand-light"
        >
          <BarChart3 className="h-4 w-4" />
        </Link>
      </div>

      {/* Title & progress text */}
      <div className="text-center">
        <h2 className="flex items-center gap-2 text-xl font-bold">
          <Footprints className="h-5 w-5 text-brand-light" /> Sifferstigen
        </h2>
        <p className="text-sm text-text-muted">
          {game.currentStep} / {game.total} steg
          <span className="ml-2 text-xs">
            ({DIFFICULTY_LABELS[game.puzzle!.difficulty]})
          </span>
        </p>
      </div>

      <MultiplayerLiveBanner gameId="numberpath" />

      {/* Progress bar */}
      <div className="h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-surface-card">
        <motion.div
          className="h-full rounded-full bg-brand"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ type: 'spring', stiffness: 120, damping: 20 }}
        />
      </div>

      {/* Grid */}
      <PathGrid
        puzzleId={game.puzzle!.id}
        rows={game.puzzle!.rows}
        cols={game.puzzle!.cols}
        cellValues={game.cellValues}
        cellStates={game.cellStates}
        validMoves={game.validMoves}
        pathCells={game.pathCells}
        total={game.total}
        won={game.phase === 'won'}
        onCellClick={game.handleCellClick}
      />

      {/* No valid moves warning */}
      {game.phase === 'playing' && game.validMoves.size === 0 && game.currentStep < game.total && (
        <motion.p
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-sm font-medium text-error"
        >
          Inga möjliga drag – ångra eller rensa stigen!
        </motion.p>
      )}

      {/* Controls */}
      {game.phase === 'playing' && (
        <div className="flex flex-wrap justify-center gap-3">
          <button
            onClick={game.undoLast}
            disabled={game.pathCells.length <= 1}
            className="flex items-center gap-1.5 rounded-xl bg-surface-card px-4 py-2.5 text-sm font-medium shadow ring-1 ring-white/10 transition hover:ring-brand/60 active:scale-95 disabled:opacity-40"
          >
            <Undo2 className="h-3.5 w-3.5" /> Ångra
          </button>
          <button
            onClick={game.showHint}
            className="flex items-center gap-1.5 rounded-xl bg-surface-card px-4 py-2.5 text-sm font-medium shadow ring-1 ring-white/10 transition hover:ring-success/60 active:scale-95"
          >
            <Lightbulb className="h-3.5 w-3.5" /> Ledtråd{game.hintsUsed > 0 && ` (${game.hintsUsed})`}
          </button>
          <button
            onClick={game.clearPath}
            disabled={game.pathCells.length <= 1}
            className="flex items-center gap-1.5 rounded-xl bg-surface-card px-4 py-2.5 text-sm font-medium shadow ring-1 ring-white/10 transition hover:ring-brand/60 active:scale-95 disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" /> Rensa
          </button>
          <button
            onClick={() => stagingResetRef.current?.()}
            className="flex items-center gap-1.5 rounded-xl bg-surface-card px-4 py-2.5 text-sm font-medium shadow ring-1 ring-white/10 transition hover:ring-brand/60 active:scale-95"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Nytt
          </button>
        </div>
      )}

      {/* Win overlay */}
      <AnimatePresence>
        {game.phase === 'won' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ delay: 0.5, duration: 0.4, ease: 'easeOut' }}
            className="flex flex-col items-center gap-4 rounded-2xl bg-surface-card p-6 shadow-xl ring-1 ring-white/10"
          >
            <PartyPopper className="h-10 w-10 text-success" />
            <h3 className="text-2xl font-bold text-success">Klart!</h3>
            <p className="text-text-muted">
              {DIFFICULTY_LABELS[game.puzzle!.difficulty]} ({GRID_LABELS[game.puzzle!.difficulty]})
              på <span className="font-mono text-accent">{fmt(game.elapsed)}</span>
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => game.newGame(game.puzzle!.difficulty)}
                className="rounded-xl bg-brand px-5 py-2.5 font-semibold shadow transition active:scale-95"
              >
                Spela igen
              </button>
              <button
                onClick={() => stagingResetRef.current?.()}
                className="rounded-xl bg-surface-card px-5 py-2.5 font-semibold shadow ring-1 ring-white/10 transition hover:ring-brand/60 active:scale-95"
              >
                Byt nivå
              </button>
              <Link
                to="/numberpath/stats"
                className="rounded-xl bg-surface-card px-5 py-2.5 font-semibold shadow ring-1 ring-white/10 transition hover:ring-brand/60 active:scale-95"
              >
                Statistik
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    ) : (
      <div className="flex min-h-full items-center justify-center text-text-muted">Laddar…</div>
    )}
    </StagingScreen>
  );
}
