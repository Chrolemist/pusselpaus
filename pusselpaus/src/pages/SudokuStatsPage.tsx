import { Link } from 'react-router-dom';
import { loadStats } from '../core/storage';
import type { Difficulty } from '../core/types';

const LABELS: Record<Difficulty, string> = {
  easy: 'Lätt',
  medium: 'Medel',
  hard: 'Svår',
  expert: 'Expert',
};

function fmt(seconds: number | null): string {
  if (seconds === null) return '–';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function SudokuStatsPage() {
  const stats = loadStats();
  const totalPlayed = Object.values(stats).reduce((a, s) => a + s.played, 0);
  const totalWon = Object.values(stats).reduce((a, s) => a + s.won, 0);

  return (
    <div className="flex min-h-full flex-col items-center gap-6 px-4 py-10">
      <div className="flex w-full max-w-sm justify-between">
        <Link
          to="/"
          className="text-sm text-text-muted hover:text-brand-light"
        >
          ← Lobby
        </Link>
        <Link
          to="/sudoku"
          className="text-sm text-text-muted hover:text-brand-light"
        >
          🔢 Sudoku
        </Link>
      </div>

      <h2 className="text-3xl font-bold">🔢 Sudoku-statistik</h2>

      {/* Summary */}
      <div className="flex gap-6 text-center">
        <div>
          <p className="text-2xl font-bold text-brand-light">{totalPlayed}</p>
          <p className="text-xs text-text-muted">Spelade</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-success">{totalWon}</p>
          <p className="text-xs text-text-muted">Lösta</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-accent">
            {totalPlayed > 0 ? Math.round((totalWon / totalPlayed) * 100) : 0}%
          </p>
          <p className="text-xs text-text-muted">Vinst</p>
        </div>
      </div>

      {/* Per difficulty */}
      <div className="w-full max-w-sm space-y-3">
        {(Object.keys(LABELS) as Difficulty[]).map((d) => {
          const s = stats[d];
          return (
            <div
              key={d}
              className="flex items-center justify-between rounded-xl bg-surface-card px-5 py-4 shadow"
            >
              <div>
                <p className="font-semibold">{LABELS[d]}</p>
                <p className="text-xs text-text-muted">
                  {s.won} / {s.played} avklarade
                </p>
              </div>
              <div className="text-right">
                <p className="font-mono text-sm text-accent">
                  {fmt(s.bestTime)}
                </p>
                <p className="text-xs text-text-muted">bästa tid</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
