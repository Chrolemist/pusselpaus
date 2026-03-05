import { Link } from 'react-router-dom';
import { games } from '../../game-registry';

export default function LobbyPage() {
  const availableGames = games;

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-4 py-10">
      <h1 className="mb-2 text-4xl font-extrabold tracking-tight text-brand-light">
        🧩 PusselPaus
      </h1>
      <p className="mb-10 text-text-muted text-center max-w-xs">
        Välkommen till din reklamfria hjärngympa. Välj ett spel nedan!
      </p>

      <div className="grid w-full max-w-sm gap-4">
        {availableGames.map((game) => {
          const hasSavedGame = game.hasSavedGame?.() ?? false;

          return (
            <Link
              key={game.id}
              to={game.path}
              className="group relative flex flex-col items-center gap-3 rounded-2xl bg-surface-card p-6 shadow-lg ring-1 ring-white/10 transition hover:ring-brand/60 active:scale-[0.98]"
            >
              <span className="text-5xl">{game.emoji}</span>
              <span className="text-xl font-semibold">{game.name}</span>
              <span className="text-sm text-text-muted text-center">
                {game.description}
              </span>
              {hasSavedGame && (
                <span className="absolute top-3 right-3 rounded-full bg-brand px-2 py-0.5 text-xs font-medium">
                  Pågående
                </span>
              )}
            </Link>
          );
        })}

        <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-white/10 p-6 opacity-40">
          <span className="text-5xl">🧠</span>
          <span className="text-xl font-semibold">Fler spel snart…</span>
          <span className="text-sm text-text-muted">Håll utkik!</span>
        </div>
      </div>

      <Link
        to="/stats"
        className="mt-8 text-sm text-text-muted underline underline-offset-4 hover:text-brand-light"
      >
        📊 Statistik
      </Link>
    </div>
  );
}
