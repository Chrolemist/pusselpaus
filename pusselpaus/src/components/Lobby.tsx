import { Link } from 'react-router-dom';
import { loadGame } from '../core/storage';

export default function Lobby() {
  const hasSavedGame = !!loadGame();

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-4 py-10">
      {/* Logo / Title */}
      <h1 className="mb-2 text-4xl font-extrabold tracking-tight text-brand-light">
        🧩 PusselPaus
      </h1>
      <p className="mb-10 text-text-muted text-center max-w-xs">
        Välkommen till din reklamfria hjärngympa. Välj ett spel nedan!
      </p>

      {/* Game cards grid */}
      <div className="grid w-full max-w-sm gap-4">
        {/* Sudoku card */}
        <Link
          to="/sudoku"
          className="group relative flex flex-col items-center gap-3 rounded-2xl bg-surface-card p-6 shadow-lg ring-1 ring-white/10 transition hover:ring-brand/60 active:scale-[0.98]"
        >
          <span className="text-5xl">🔢</span>
          <span className="text-xl font-semibold">Sudoku</span>
          <span className="text-sm text-text-muted text-center">
            Klassisk sifferpussel i fyra svårighetsgrader
          </span>
          {hasSavedGame && (
            <span className="absolute top-3 right-3 rounded-full bg-brand px-2 py-0.5 text-xs font-medium">
              Pågående
            </span>
          )}
        </Link>

        {/* Placeholder for future games */}
        <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-white/10 p-6 opacity-40">
          <span className="text-5xl">🧠</span>
          <span className="text-xl font-semibold">Fler spel snart…</span>
          <span className="text-sm text-text-muted">Håll utkik!</span>
        </div>
      </div>

      {/* Stats link */}
      <Link
        to="/stats"
        className="mt-8 text-sm text-text-muted underline underline-offset-4 hover:text-brand-light"
      >
        📊 Statistik
      </Link>
    </div>
  );
}
