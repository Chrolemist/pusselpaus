import { useState } from 'react';
import { Link } from 'react-router-dom';
import { games } from '../../game-registry';
import { useAuth } from '../../auth';
import { Puzzle, BarChart3, Store, Brain, User } from 'lucide-react';

function LobbyGameIcon({ gameId, emoji, name }: { gameId: string; emoji: string; name: string }) {
  const [hasImageError, setHasImageError] = useState(false);

  if (hasImageError) {
    return <span className="text-5xl">{emoji}</span>;
  }

  return (
    <img
      src={`/lobby-icons/${gameId}.png`}
      alt={name}
      className="h-16 w-16 rounded-2xl object-cover shadow-lg"
      loading="lazy"
      onError={() => setHasImageError(true)}
    />
  );
}

function gameModeBadge(game: (typeof games)[number]): { label: string; tone: string } {
  if (!game.multiplayer) {
    return {
      label: 'Singleplayer',
      tone: 'border-white/10 bg-white/8 text-white/85',
    };
  }

  const { maxPlayers } = game.multiplayer;
  const playerRange = maxPlayers == null
    ? '1+'
    : `1-${maxPlayers}`;

  return {
    label: `Multiplayer ${playerRange}`,
    tone: 'border-emerald-300/25 bg-emerald-400/15 text-emerald-100',
  };
}

export default function LobbyPage() {
  const { isGuest, exitGuestMode } = useAuth();
  const availableGames = games;
  const buildStamp = (() => {
    const parsed = new Date(__APP_BUILD__);
    if (Number.isNaN(parsed.getTime())) return __APP_BUILD__;
    return new Intl.DateTimeFormat('sv-SE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(parsed);
  })();

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-4 py-10">
      <h1 className="mb-2 flex items-center gap-2 text-4xl font-extrabold tracking-tight text-brand-light">
        <Puzzle className="h-9 w-9" />
        PusselPaus
      </h1>
      <p className="mb-10 text-text-muted text-center max-w-xs">
        Välkommen till din reklamfria hjärngympa. Välj ett spel nedan!
      </p>

      {isGuest && (
        <div className="mb-6 rounded-xl bg-surface-card px-4 py-3 text-center ring-1 ring-white/10">
          <p className="text-sm text-text-muted"><User className="mr-1 inline h-4 w-4" />Gästläge: allt sparas bara lokalt på denna enhet.</p>
          <button
            onClick={exitGuestMode}
            className="mt-2 rounded-md bg-brand/30 px-3 py-1 text-xs font-semibold text-brand-light hover:bg-brand/50"
          >
            Logga in för online-funktioner
          </button>
        </div>
      )}

      <div className="grid w-full max-w-sm gap-4">
        {availableGames.map((game) => {
          const hasSavedGame = game.hasSavedGame?.() ?? false;
          const modeBadge = gameModeBadge(game);

          return (
            <Link
              key={game.id}
              to={game.path}
              className="group relative flex flex-col items-center gap-3 rounded-2xl bg-surface-card p-6 shadow-lg ring-1 ring-white/10 transition hover:ring-brand/60 active:scale-[0.98]"
            >
              <span
                className={`absolute left-3 top-3 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] shadow-lg backdrop-blur ${modeBadge.tone}`}
              >
                {modeBadge.label}
              </span>
              <LobbyGameIcon gameId={game.id} emoji={game.emoji} name={game.name} />
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
          <Brain className="h-12 w-12" />
          <span className="text-xl font-semibold">Fler spel snart…</span>
          <span className="text-sm text-text-muted">Håll utkik!</span>
        </div>
      </div>

      <Link
        to="/stats"
        className="mt-8 flex items-center gap-1.5 text-sm text-text-muted underline underline-offset-4 hover:text-brand-light"
      >
        <BarChart3 className="h-4 w-4" /> Statistik
      </Link>

      {!isGuest && (
        <Link
          to="/shop"
          className="mt-2 flex items-center gap-1.5 text-sm text-text-muted underline underline-offset-4 hover:text-brand-light"
        >
          <Store className="h-4 w-4" /> Skinshop
        </Link>
      )}

      <p className="mt-4 text-center text-xs font-medium tracking-[0.18em] text-text-muted/80 uppercase">
        v{__APP_VERSION__} • {buildStamp}
      </p>
    </div>
  );
}
