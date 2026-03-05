import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useFriends } from '../../hooks/useFriends';
import { useMultiplayer, type MultiplayerGameId } from '../../hooks/useMultiplayer';
import { useAuth } from '../../auth';

const GAME_LABELS: Record<MultiplayerGameId, string> = {
  sudoku: 'Sudoku',
  numberpath: 'Sifferstigen',
  rytmrush: 'RytmRush',
};

type SudokuDifficulty = 'easy' | 'medium' | 'hard' | 'expert';
type NumberPathDifficulty = 'easy' | 'medium' | 'hard';
type MatchConfig = Record<string, string | number | boolean | null>;

export default function MultiplayerPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { friends } = useFriends();
  const mp = useMultiplayer();

  const acceptedFriends = useMemo(
    () => friends.filter((f) => f.status === 'accepted').map((f) => f.friend),
    [friends],
  );

  const [gameId, setGameId] = useState<MultiplayerGameId>('sudoku');
  const [sudokuDifficulty, setSudokuDifficulty] = useState<SudokuDifficulty>('medium');
  const [numberPathDifficulty, setNumberPathDifficulty] = useState<NumberPathDifficulty>('medium');
  const [stake, setStake] = useState(25);
  const [useStake, setUseStake] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (mp.grouped.starting.length === 0) return;

    const timer = window.setInterval(() => {
      const now = Date.now();
      for (const entry of mp.grouped.starting) {
        const startedAt = entry.match.started_at ? new Date(entry.match.started_at).getTime() : null;
        if (!startedAt) continue;
        if (now >= startedAt) {
          void mp.tickMatchStart(entry.match.id);
        }
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [mp]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const formatStartCountdown = (startedAt: string | null): string | null => {
    if (!startedAt) return null;
    const target = new Date(startedAt).getTime();
    if (!Number.isFinite(target)) return null;
    const remaining = Math.max(0, Math.ceil((target - nowMs) / 1000));
    return `${remaining}s`;
  };

  const toggleFriend = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const create = async () => {
    if (isCreating) return;
    setIsCreating(true);
    const effectiveStake = useStake ? Math.max(1, stake) : 0;
    const config: MatchConfig =
      gameId === 'sudoku'
        ? { difficulty: sudokuDifficulty }
        : gameId === 'numberpath'
          ? { difficulty: numberPathDifficulty }
          : { difficulty: 'easy' };
    const configSeed = Math.floor(Math.random() * 2_000_000_000);

    const err = await mp.createMatch(gameId, effectiveStake, selectedIds, {
      config,
      configSeed,
    });
    setMessage(err ?? 'Match skapad ✅');
    if (!err) setSelectedIds([]);
    window.setTimeout(() => setMessage(null), 3000);
    setIsCreating(false);
  };

  return (
    <div className="flex min-h-full flex-col items-center gap-6 px-4 py-10">
      <Link to="/" className="self-start text-sm text-text-muted hover:text-brand-light">← Tillbaka</Link>

      <h2 className="text-3xl font-bold">⚔️ Multiplayer</h2>
      <p className="text-center text-sm text-text-muted max-w-xl">
        Utmana vänner med stake eller kör utan stake. Vid stake lägger alla samma insats i potten, annars får vinnaren en bonus.
      </p>

      {message && (
        <p className="rounded-lg bg-brand/20 px-3 py-2 text-xs text-brand-light">{message}</p>
      )}

      <section className="w-full max-w-2xl rounded-2xl bg-surface-card p-5 ring-1 ring-white/10">
        <h3 className="mb-3 font-semibold">Skapa match</h3>

        <label className="mb-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={useStake}
            onChange={(e) => setUseStake(e.target.checked)}
          />
          <span className="text-text-muted">Använd stake (coin-insats)</span>
        </label>

        <div className="mb-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block text-text-muted">Spel</span>
            <select
              value={gameId}
              onChange={(e) => setGameId(e.target.value as MultiplayerGameId)}
              className="w-full rounded-lg bg-black/30 px-3 py-2 ring-1 ring-white/10"
            >
              <option value="sudoku">Sudoku</option>
              <option value="numberpath">Sifferstigen</option>
              <option value="rytmrush">RytmRush</option>
            </select>
          </label>

          {gameId === 'sudoku' && (
            <label className="text-sm">
              <span className="mb-1 block text-text-muted">Sudoku-nivå (låst för alla)</span>
              <select
                value={sudokuDifficulty}
                onChange={(e) => setSudokuDifficulty(e.target.value as SudokuDifficulty)}
                className="w-full rounded-lg bg-black/30 px-3 py-2 ring-1 ring-white/10"
              >
                <option value="easy">Lätt</option>
                <option value="medium">Medel</option>
                <option value="hard">Svår</option>
                <option value="expert">Expert</option>
              </select>
            </label>
          )}

          {gameId === 'numberpath' && (
            <label className="text-sm">
              <span className="mb-1 block text-text-muted">Sifferstigen-nivå (låst för alla)</span>
              <select
                value={numberPathDifficulty}
                onChange={(e) => setNumberPathDifficulty(e.target.value as NumberPathDifficulty)}
                className="w-full rounded-lg bg-black/30 px-3 py-2 ring-1 ring-white/10"
              >
                <option value="easy">Lätt</option>
                <option value="medium">Medel</option>
                <option value="hard">Svår</option>
              </select>
            </label>
          )}

          <label className="text-sm">
            <span className="mb-1 block text-text-muted">Stake (coins / spelare)</span>
            <input
              type="number"
              min={1}
              step={1}
              value={stake}
              onChange={(e) => setStake(Math.max(1, Number(e.target.value) || 1))}
              disabled={!useStake}
              className="w-full rounded-lg bg-black/30 px-3 py-2 ring-1 ring-white/10"
            />
          </label>
        </div>

        {!useStake && (
          <p className="mb-3 text-xs text-text-muted">Utan stake: ingen coin dras vid start. Vinnaren får multiplayer-bonus.</p>
        )}

        <p className="mb-2 text-xs font-bold uppercase text-text-muted">Välj vänner att bjuda in</p>
        <div className="max-h-44 space-y-2 overflow-y-auto rounded-lg bg-black/20 p-3">
          {acceptedFriends.length === 0 && (
            <p className="text-xs text-text-muted">Inga vänner ännu.</p>
          )}

          {acceptedFriends.map((f) => (
            <label key={f.id} className="flex cursor-pointer items-center justify-between rounded-md px-2 py-1 hover:bg-white/5">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(f.id)}
                  onChange={() => toggleFriend(f.id)}
                />
                <span>{f.skin ?? '🙂'}</span>
                <span className="text-sm">{f.username}#{f.tag}</span>
              </div>
              <span className={`text-[11px] ${f.is_online ? 'text-green-300' : 'text-text-muted'}`}>
                {f.is_online ? 'Online' : 'Offline'}
              </span>
            </label>
          ))}
        </div>

        <button
          onClick={create}
          disabled={selectedIds.length === 0 || isCreating}
          className="mt-3 rounded-lg bg-brand/30 px-4 py-2 text-sm font-bold text-brand-light transition hover:bg-brand/50 disabled:opacity-50"
        >
          {isCreating ? 'Skapar…' : 'Skapa multiplayer-match'}
        </button>
      </section>

      <section className="w-full max-w-2xl space-y-4">
        <h3 className="font-semibold">Inkommande inbjudningar</h3>
        {mp.grouped.incoming.length === 0 ? (
          <p className="text-sm text-text-muted">Inga inbjudningar just nu.</p>
        ) : (
          mp.grouped.incoming.map((entry) => (
            <div key={entry.match.id} className="rounded-xl bg-surface-card p-4 ring-1 ring-white/10">
              <p className="text-sm font-semibold">{GAME_LABELS[entry.match.game_id as MultiplayerGameId]} • {entry.match.stake > 0 ? `Stake ${entry.match.stake} 🪙` : 'Utan stake (bonus-läge)'}</p>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={async () => {
                    const err = await mp.acceptInvite(entry.match.id);
                    setMessage(err ?? 'Inbjudan accepterad ✅');
                    window.setTimeout(() => setMessage(null), 2500);
                  }}
                  className="rounded-md bg-green-500/20 px-3 py-1 text-xs font-bold text-green-300"
                >
                  Acceptera
                </button>
                <button
                  onClick={async () => {
                    const err = await mp.declineInvite(entry.match.id);
                    setMessage(err ?? 'Inbjudan nekad');
                    window.setTimeout(() => setMessage(null), 2500);
                  }}
                  className="rounded-md bg-red-500/20 px-3 py-1 text-xs font-bold text-red-300"
                >
                  Neka
                </button>
              </div>
            </div>
          ))
        )}
      </section>

      <section className="w-full max-w-2xl space-y-4">
        <h3 className="font-semibold">Väntar på start</h3>
        {mp.grouped.waiting.length === 0 ? (
          <p className="text-sm text-text-muted">Inga väntande matcher.</p>
        ) : (
          mp.grouped.waiting.map((entry) => {
            const game = entry.match.game_id as MultiplayerGameId;
            const isHost = entry.match.host_id === user?.id;
            const allAccepted = entry.players.every((p) => p.player.status === 'accepted');

            return (
              <div key={entry.match.id} className="rounded-xl bg-surface-card p-4 ring-1 ring-white/10">
                <p className="text-sm font-semibold">{GAME_LABELS[game]} • {entry.match.stake > 0 ? `Stake ${entry.match.stake} 🪙` : 'Utan stake (bonus-läge)'}</p>
                <p className="mt-1 text-xs text-text-muted">
                  Accepterat: {entry.players.filter((p) => p.player.status === 'accepted').length}/{entry.players.length}
                </p>
                <div className="mt-2 flex gap-2">
                  {isHost ? (
                    <button
                      onClick={async () => {
                        const err = await mp.startMatch(entry.match.id, 5);
                        setMessage(err ?? 'Matchstart synkad! Nedräkning igång ⏳');
                        window.setTimeout(() => setMessage(null), 3000);
                      }}
                      disabled={!allAccepted}
                      className="rounded-md bg-green-500/20 px-3 py-1 text-xs font-bold text-green-300 disabled:opacity-50"
                    >
                      Starta match
                    </button>
                  ) : (
                    <span className="rounded-md bg-black/20 px-3 py-1 text-xs text-text-muted">
                      Väntar på att hosten startar
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </section>

      <section className="w-full max-w-2xl space-y-4">
        <h3 className="font-semibold">Startar nu</h3>
        {mp.grouped.starting.length === 0 ? (
          <p className="text-sm text-text-muted">Ingen match startar just nu.</p>
        ) : (
          mp.grouped.starting.map((entry) => {
            const g = entry.match.game_id as MultiplayerGameId;
            const countdown = formatStartCountdown(entry.match.started_at);
            const canEnter = !countdown || countdown === '0s';

            return (
              <div key={entry.match.id} className="rounded-xl bg-surface-card p-4 ring-1 ring-white/10">
                <p className="text-sm font-semibold">{GAME_LABELS[g]} • Gemensam start</p>
                <p className="mt-1 text-xs text-text-muted">Start om: {countdown ?? 'snart'}</p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => {
                      mp.setActiveMatch(g, entry.match.id, {
                        config: (entry.match.config as MatchConfig | null) ?? undefined,
                        configSeed: entry.match.config_seed ?? undefined,
                      });
                      if (canEnter) {
                        navigate(mp.gamePath(g));
                        return;
                      }
                      void mp.tickMatchStart(entry.match.id);
                    }}
                    className="rounded-md bg-brand/30 px-3 py-1 text-xs font-bold text-brand-light"
                  >
                    {canEnter ? 'Gå till spelet' : 'Redo i lobby'}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </section>

      <section className="w-full max-w-2xl space-y-4">
        <h3 className="font-semibold">Aktiva matcher</h3>
        {mp.grouped.active.length === 0 ? (
          <p className="text-sm text-text-muted">Inga aktiva matcher.</p>
        ) : (
          mp.grouped.active.map((entry) => {
            const g = entry.match.game_id as MultiplayerGameId;
            return (
              <div key={entry.match.id} className="rounded-xl bg-surface-card p-4 ring-1 ring-white/10">
                <p className="text-sm font-semibold">{GAME_LABELS[g]} • {entry.match.stake > 0 ? 'Potten växer med antal spelare' : 'Bonus-läge utan stake'}</p>
                <div className="mt-2 flex gap-2">
                  <Link
                    to={mp.gamePath(g)}
                    onClick={() => mp.setActiveMatch(g, entry.match.id, {
                      config: (entry.match.config as MatchConfig | null) ?? undefined,
                      configSeed: entry.match.config_seed ?? undefined,
                    })}
                    className="rounded-md bg-brand/30 px-3 py-1 text-xs font-bold text-brand-light"
                  >
                    Gå till spelet
                  </Link>
                </div>
              </div>
            );
          })
        )}
      </section>

      <section className="w-full max-w-2xl space-y-2 pb-8">
        <h3 className="font-semibold">Senaste avslutade matcher</h3>
        {mp.grouped.completed.length === 0 ? (
          <p className="text-sm text-text-muted">Inga avslutade matcher ännu.</p>
        ) : (
          mp.grouped.completed.map((entry) => {
            const accepted = entry.players.filter((p) => p.player.status === 'accepted');
            const pot = accepted.reduce((sum, p) => sum + p.player.stake_locked, 0);
            const winner = entry.players.find((p) => p.player.user_id === entry.match.winner_id)?.profile;

            return (
              <div key={entry.match.id} className="rounded-xl bg-black/20 px-4 py-3 ring-1 ring-white/10">
                <p className="text-sm font-semibold">{GAME_LABELS[entry.match.game_id as MultiplayerGameId]}</p>
                <p className="text-xs text-text-muted">Vinnare: {winner ? `${winner.username}#${winner.tag}` : 'okänd'} • {pot > 0 ? `Pot: ${pot} 🪙` : 'Utan stake: bonus utdelad'}</p>
              </div>
            );
          })
        )}
      </section>

      {mp.loading && <p className="text-sm text-text-muted">Laddar multiplayer…</p>}
    </div>
  );
}
