/* ── RytmRush – stats page ── */

import { Link } from 'react-router-dom';
import { loadStats } from '../core/storage';
import type { Difficulty } from '../core/types';
import { DIFFICULTY_LABELS } from '../core/types';

export default function RytmRushStatsPage() {
  const stats = loadStats();
  const totalPlayed = Object.values(stats).reduce((a, s) => a + s.played, 0);
  const totalWon = Object.values(stats).reduce((a, s) => a + s.won, 0);

  return (
    <div className="flex min-h-full flex-col items-center gap-6 px-4 py-10">
      <div className="flex w-full max-w-sm justify-between">
        <Link to="/" className="text-sm text-text-muted hover:text-brand-light">
          ← Lobby
        </Link>
        <Link
          to="/rytmrush"
          className="text-sm text-text-muted hover:text-brand-light"
        >
          🎵 RytmRush
        </Link>
      </div>

      <h2 className="text-3xl font-bold">🎵 RytmRush – statistik</h2>

      <div className="flex gap-6 text-center">
        <div>
          <p className="text-2xl font-bold text-brand-light">{totalPlayed}</p>
          <p className="text-xs text-text-muted">Spelade</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-success">{totalWon}</p>
          <p className="text-xs text-text-muted">Klarade</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-accent">
            {totalPlayed > 0 ? Math.round((totalWon / totalPlayed) * 100) : 0}%
          </p>
          <p className="text-xs text-text-muted">Vinst</p>
        </div>
      </div>

      <div className="w-full max-w-sm space-y-3">
        {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => {
          const s = stats[d];
          return (
            <div
              key={d}
              className="flex items-center justify-between rounded-xl bg-surface-card px-5 py-4 shadow"
            >
              <div>
                <p className="font-semibold">{DIFFICULTY_LABELS[d]}</p>
                <p className="text-xs text-text-muted">
                  {s.won} / {s.played} avklarade
                </p>
              </div>
              <div className="text-right space-y-0.5">
                {s.bestScore !== null && (
                  <div>
                    <p className="font-mono text-sm text-accent">
                      {s.bestScore.toLocaleString('sv-SE')} p
                    </p>
                    <p className="text-xs text-text-muted">bästa poäng</p>
                  </div>
                )}
                {s.bestCombo !== null && (
                  <div>
                    <p className="font-mono text-sm text-brand-light">
                      {s.bestCombo}x
                    </p>
                    <p className="text-xs text-text-muted">bästa combo</p>
                  </div>
                )}
                {s.bestScore === null && (
                  <p className="text-sm text-text-muted">–</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
