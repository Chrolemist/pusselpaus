import { Link } from 'react-router-dom';
import { games } from '../../game-registry';
import type { GameStatsSummary } from '../../game-registry';

function fmt(seconds: number | null): string {
  if (seconds === null) return '–';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function StatsOverviewPage() {
  const gameStats: { id: string; name: string; emoji: string; statsPath?: string; stats: GameStatsSummary }[] =
    games
      .filter((g) => g.getStats)
      .map((g) => ({
        id: g.id,
        name: g.name,
        emoji: g.emoji,
        statsPath: g.statsPath,
        stats: g.getStats!(),
      }));

  const totalPlayed = gameStats.reduce((a, g) => a + g.stats.played, 0);
  const totalWon = gameStats.reduce((a, g) => a + g.stats.won, 0);
  const allBestTimes = gameStats
    .map((g) => g.stats.bestTime)
    .filter((t): t is number => t !== null);
  const overallBest = allBestTimes.length > 0 ? Math.min(...allBestTimes) : null;

  return (
    <div className="flex min-h-full flex-col items-center gap-6 px-4 py-10">
      <Link
        to="/"
        className="self-start text-sm text-text-muted hover:text-brand-light"
      >
        ← Tillbaka
      </Link>

      <h2 className="text-3xl font-bold">📊 Översikt</h2>
      <p className="text-sm text-text-muted">Sammanställd statistik från alla spel</p>

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
        {overallBest !== null && (
          <div>
            <p className="font-mono text-2xl font-bold text-accent">{fmt(overallBest)}</p>
            <p className="text-xs text-text-muted">Snabbast</p>
          </div>
        )}
      </div>

      <div className="w-full max-w-sm space-y-3">
        {gameStats.map((g) => (
          <Link
            key={g.id}
            to={g.statsPath ?? '#'}
            className="flex items-center justify-between rounded-xl bg-surface-card px-5 py-4 shadow ring-1 ring-white/10 transition hover:ring-brand/60 active:scale-[0.98]"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">{g.emoji}</span>
              <div>
                <p className="font-semibold">{g.name}</p>
                <p className="text-xs text-text-muted">
                  {g.stats.won} / {g.stats.played} lösta
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-mono text-sm text-accent">{fmt(g.stats.bestTime)}</p>
              <p className="text-xs text-text-muted">bästa tid</p>
            </div>
          </Link>
        ))}

        {gameStats.length === 0 && (
          <p className="text-center text-sm text-text-muted py-4">
            Ingen statistik ännu — spela ett spel först!
          </p>
        )}
      </div>
    </div>
  );
}
