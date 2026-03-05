import { Link } from 'react-router-dom';
import { loadStats } from '../../games/sudoku/core/storage';

function fmt(seconds: number | null): string {
  if (seconds === null) return '–';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function StatsOverviewPage() {
  const sudokuStats = loadStats();
  const sudokuPlayed = Object.values(sudokuStats).reduce((a, s) => a + s.played, 0);
  const sudokuWon = Object.values(sudokuStats).reduce((a, s) => a + s.won, 0);
  const sudokuBest = Object.values(sudokuStats)
    .map((s) => s.bestTime)
    .filter((t): t is number => t !== null)
    .sort((a, b) => a - b)[0] ?? null;

  const totalPlayed = sudokuPlayed;
  const totalWon = sudokuWon;

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
      </div>

      <div className="w-full max-w-sm space-y-3">
        <Link
          to="/sudoku/stats"
          className="flex items-center justify-between rounded-xl bg-surface-card px-5 py-4 shadow ring-1 ring-white/10 transition hover:ring-brand/60 active:scale-[0.98]"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">🔢</span>
            <div>
              <p className="font-semibold">Sudoku</p>
              <p className="text-xs text-text-muted">
                {sudokuWon} / {sudokuPlayed} lösta
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-mono text-sm text-accent">{fmt(sudokuBest)}</p>
            <p className="text-xs text-text-muted">bästa tid</p>
          </div>
        </Link>

        <div className="flex items-center gap-3 rounded-xl border-2 border-dashed border-white/10 px-5 py-4 opacity-40">
          <span className="text-2xl">🧠</span>
          <p className="text-sm text-text-muted">Fler spel kommer…</p>
        </div>
      </div>
    </div>
  );
}
