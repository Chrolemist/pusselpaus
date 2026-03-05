/* ── RytmRush – main game page ── */

import { useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import Lane from '../components/Lane';
import Hud from '../components/Hud';
import { useRhythmEngine } from '../hooks/useRhythmEngine';
import {
  SONGS,
  LANE_KEYS,
  LANE_LABELS,
  LANE_COLORS,
  DIFFICULTY_LABELS,
} from '../core';
import type { Difficulty, Song } from '../core';
import { playWinJingle } from '../audio/rhythmAudio';

/* ── Page component ── */

export default function RytmRushPage() {
  const engine = useRhythmEngine();
  const containerRef = useRef<HTMLDivElement>(null);
  const confettiFired = useRef(false);

  /* ── Keyboard handling ── */
  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (engine.phase !== 'playing') return;
      for (const [lane, keys] of Object.entries(LANE_KEYS)) {
        if (keys.includes(e.key)) {
          engine.handleKeyDown(Number(lane));
          return;
        }
      }
    },
    [engine],
  );

  const onKeyUp = useCallback(
    (e: KeyboardEvent) => {
      if (engine.phase !== 'playing') return;
      for (const [lane, keys] of Object.entries(LANE_KEYS)) {
        if (keys.includes(e.key)) {
          engine.handleKeyUp(Number(lane));
          return;
        }
      }
    },
    [engine],
  );

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [onKeyDown, onKeyUp]);

  /* ── Confetti + jingle on results ── */
  useEffect(() => {
    if (engine.phase === 'results' && !confettiFired.current) {
      confettiFired.current = true;
      // Calculate hit rate
      const total =
        engine.perfects + engine.greats + engine.goods + engine.misses;
      const hitRate =
        total > 0
          ? (engine.perfects + engine.greats + engine.goods) / total
          : 0;
      if (hitRate >= 0.7) {
        playWinJingle();
        confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
        setTimeout(() => {
          confetti({ particleCount: 60, spread: 100, origin: { y: 0.5 } });
        }, 300);
      }
    }
    if (engine.phase !== 'results') confettiFired.current = false;
  }, [engine.phase, engine.perfects, engine.greats, engine.goods, engine.misses]);

  /* ── Cleanup ── */
  useEffect(() => {
    return () => engine.cleanup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Menu: song + difficulty picker ── */
  if (engine.phase === 'menu') {
    return <MenuView onStart={engine.startSong} />;
  }

  /* ── Countdown ── */
  if (engine.phase === 'countdown') {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-black">
        <motion.p
          key={engine.countdownValue}
          className="text-8xl font-extrabold text-brand-light"
          initial={{ scale: 2, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.5, opacity: 0 }}
          transition={{ duration: 0.4 }}
        >
          {engine.countdownValue}
        </motion.p>
        {engine.song && (
          <p className="mt-4 text-text-muted">
            {engine.song.title} – {DIFFICULTY_LABELS[engine.difficulty]}
          </p>
        )}
      </div>
    );
  }

  /* ── Results screen ── */
  if (engine.phase === 'results') {
    return (
      <ResultsView
        engine={engine}
        onBack={() => {
          engine.saveResult();
          engine.setPhase('menu');
        }}
      />
    );
  }

  /* ── Playing: game board ── */

  return (
    <div
      ref={containerRef}
      className="relative flex h-dvh w-full select-none flex-col bg-black"
      tabIndex={0}
    >
      {/* Lane label header */}
      <div className="flex h-10 items-center justify-center gap-0">
        {LANE_LABELS.map((label, i) => (
          <div
            key={i}
            className="flex-1 text-center text-xs font-bold opacity-50"
            style={{ color: LANE_COLORS[i] }}
          >
            {label}
          </div>
        ))}
      </div>

      {/* Game area */}
      <div className="relative flex flex-1">
        {Array.from({ length: engine.song?.lanes ?? 4 }, (_, i) => {
          const laneBlocks = engine.blocks.filter(
            (b) => b.chartNote.lane === i,
          );
          return (
            <Lane
              key={i}
              laneIndex={i}
              blocks={laneBlocks}
              transportTime={engine.transportTime}
              active={engine.pressedLanes.has(i)}
              laneCount={engine.song?.lanes ?? 4}
            />
          );
        })}

        <Hud
          score={engine.score}
          combo={engine.combo}
          lastGrade={engine.lastGrade}
          gradeSeq={engine.gradeSeq}
        />
      </div>

      {/* Touch controls for mobile */}
      <div className="flex h-20 shrink-0">
        {LANE_LABELS.map((label, i) => (
          <button
            key={i}
            className="flex flex-1 items-center justify-center text-lg font-bold opacity-70 active:opacity-100"
            style={{
              backgroundColor: `${LANE_COLORS[i]}33`,
              color: LANE_COLORS[i],
            }}
            onPointerDown={() => engine.handleKeyDown(i)}
            onPointerUp={() => engine.handleKeyUp(i)}
            onPointerLeave={() => engine.handleKeyUp(i)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ────────────────────────────────────
   Sub-components
   ──────────────────────────────────── */

interface MenuViewProps {
  onStart: (song: Song, diff: Difficulty) => void;
}

function MenuView({ onStart }: MenuViewProps) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-10">
      <Link to="/" className="text-sm text-text-muted hover:text-brand-light">
        ← Lobby
      </Link>

      <h2 className="text-3xl font-bold">🎵 RytmRush</h2>
      <p className="max-w-xs text-center text-sm text-text-muted">
        Tryck i takt! Block rullar nedåt — träffa dem i rätt ögonblick.
        Tangenter: D&nbsp;F&nbsp;J&nbsp;K eller tryck på mobilen.
      </p>

      <div className="w-full max-w-sm space-y-4">
        {SONGS.map((song) => (
          <div
            key={song.id}
            className="rounded-xl bg-surface-card p-5 shadow ring-1 ring-white/10"
          >
            <div className="mb-3">
              <p className="text-lg font-semibold">{song.title}</p>
              <p className="text-xs text-text-muted">
                {song.artist} · {song.bpm} BPM · {song.notes.length} noter
              </p>
            </div>
            <div className="flex gap-2">
              {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => (
                <button
                  key={d}
                  onClick={() => onStart(song, d)}
                  className="flex-1 rounded-lg bg-brand/20 px-3 py-2 text-sm font-semibold text-brand-light transition hover:bg-brand/40 active:scale-95"
                >
                  {DIFFICULTY_LABELS[d]}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <Link
        to="/rytmrush/stats"
        className="text-sm text-text-muted hover:text-brand-light"
      >
        📊 Statistik
      </Link>
    </div>
  );
}

interface ResultsViewProps {
  engine: ReturnType<typeof useRhythmEngine>;
  onBack: () => void;
}

function ResultsView({ engine, onBack }: ResultsViewProps) {
  const total =
    engine.perfects + engine.greats + engine.goods + engine.misses;
  const hitRate =
    total > 0
      ? (engine.perfects + engine.greats + engine.goods) / total
      : 0;
  const won = hitRate >= 0.7;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-10">
      <AnimatePresence>
        <motion.div
          className="flex flex-col items-center gap-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <p className="text-5xl">{won ? '🎉' : '😅'}</p>
          <h2 className="text-3xl font-bold">
            {won ? 'Fantastiskt!' : 'Snyggt försök!'}
          </h2>

          {engine.song && (
            <p className="text-sm text-text-muted">
              {engine.song.title} – {DIFFICULTY_LABELS[engine.difficulty]}
            </p>
          )}

          <p className="font-mono text-4xl font-bold text-brand-light">
            {Math.round(engine.score).toLocaleString('sv-SE')}
          </p>

          <div className="flex gap-6 text-center">
            <Stat label="Max Combo" value={`${engine.maxCombo}x`} />
            <Stat
              label="Träffar"
              value={`${Math.round(hitRate * 100)}%`}
            />
          </div>

          <div className="flex gap-4 text-center text-sm">
            <GradeStat label="Perfekt" count={engine.perfects} color="#22c55e" />
            <GradeStat label="Bra" count={engine.greats} color="#38bdf8" />
            <GradeStat label="OK" count={engine.goods} color="#facc15" />
            <GradeStat label="Miss" count={engine.misses} color="#ef4444" />
          </div>

          <button
            onClick={onBack}
            className="mt-4 rounded-xl bg-brand px-8 py-3 text-lg font-semibold shadow-lg transition active:scale-95"
          >
            Tillbaka
          </button>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-2xl font-bold text-accent">{value}</p>
      <p className="text-xs text-text-muted">{label}</p>
    </div>
  );
}

function GradeStat({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: string;
}) {
  return (
    <div>
      <p className="text-xl font-bold" style={{ color }}>
        {count}
      </p>
      <p className="text-xs text-text-muted">{label}</p>
    </div>
  );
}
