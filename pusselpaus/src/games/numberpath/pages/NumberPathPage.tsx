/* ── Sifferstigen – main game page ── */

import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import PathGrid from '../components/PathGrid';
import { useNumberPath } from '../hooks/useNumberPath';
import type { Difficulty } from '../core/types';
import { DIFFICULTY_LABELS, GRID_LABELS } from '../core/types';
import MultiplayerLiveBanner from '../../../components/MultiplayerLiveBanner';

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

  /* ── Difficulty picker view ── */
  if (game.phase === 'idle' || game.phase === 'picking') {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-6 px-4 py-10">
        <Link to="/" className="text-sm text-text-muted hover:text-brand-light">
          ← Lobby
        </Link>

        <h2 className="text-3xl font-bold">🚶 Sifferstigen</h2>
        <p className="max-w-xs text-center text-sm text-text-muted">
          Dra en sammanhängande stig genom alla rutor – från 1 till sista
          siffran. Varje ruta måste fyllas!
        </p>

        {game.hasSaved && (
          <button
            onClick={game.resumeGame}
            className="w-full max-w-xs rounded-xl bg-brand px-5 py-3 text-lg font-semibold shadow-lg transition active:scale-[0.97]"
          >
            ▶️ Fortsätt sparad
          </button>
        )}

        <div className="grid w-full max-w-xs gap-3">
          {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => (
            <button
              key={d}
              onClick={() => game.newGame(d)}
              className="flex items-center justify-between rounded-xl bg-surface-card px-5 py-4 text-lg font-semibold shadow ring-1 ring-white/10 transition hover:ring-brand/60 active:scale-[0.97]"
            >
              <span>{DIFFICULTY_LABELS[d]}</span>
              <span className="text-sm text-text-muted">{GRID_LABELS[d]}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  /* ── Game view ── */
  const progress = game.total > 0 ? (game.currentStep / game.total) * 100 : 0;

  return (
    <div className="flex min-h-full flex-col items-center gap-4 px-4 py-6">
      {/* Header */}
      <div className="flex w-full max-w-sm items-center justify-between">
        <Link to="/" className="text-sm text-text-muted hover:text-brand-light">
          ← Lobby
        </Link>
        <span className="font-mono text-sm text-accent">{fmt(game.elapsed)}</span>
        <Link
          to="/numberpath/stats"
          className="text-sm text-text-muted hover:text-brand-light"
        >
          📊
        </Link>
      </div>

      {/* Title & progress text */}
      <div className="text-center">
        <h2 className="text-xl font-bold">🚶 Sifferstigen</h2>
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
            className="rounded-xl bg-surface-card px-4 py-2.5 text-sm font-medium shadow ring-1 ring-white/10 transition hover:ring-brand/60 active:scale-95 disabled:opacity-40"
          >
            ↩ Ångra
          </button>
          <button
            onClick={game.showHint}
            className="rounded-xl bg-surface-card px-4 py-2.5 text-sm font-medium shadow ring-1 ring-white/10 transition hover:ring-success/60 active:scale-95"
          >
            💡 Ledtråd{game.hintsUsed > 0 && ` (${game.hintsUsed})`}
          </button>
          <button
            onClick={game.clearPath}
            disabled={game.pathCells.length <= 1}
            className="rounded-xl bg-surface-card px-4 py-2.5 text-sm font-medium shadow ring-1 ring-white/10 transition hover:ring-brand/60 active:scale-95 disabled:opacity-40"
          >
            🗑 Rensa
          </button>
          <button
            onClick={() => game.setPhase('picking')}
            className="rounded-xl bg-surface-card px-4 py-2.5 text-sm font-medium shadow ring-1 ring-white/10 transition hover:ring-brand/60 active:scale-95"
          >
            🆕 Nytt
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
            <span className="text-4xl">🎉</span>
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
                onClick={() => game.setPhase('picking')}
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
  );
}
