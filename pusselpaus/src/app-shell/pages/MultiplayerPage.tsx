/* ── MultiplayerPage – lobby for creating/managing matches ──
 *
 *  All game-specific data (labels, paths, difficulties) comes from
 *  game-registry – adding a new multiplayer game is just adding
 *  `multiplayer: { ... }` to the game's definition.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useFriends } from '../../hooks/useFriends';
import { useAuth } from '../../auth';
import {
  useMultiplayer,
  multiplayerGames,
  gameLabel,
  gamePath,
} from '../../multiplayer';
import type { MatchConfig } from '../../multiplayer';

export default function MultiplayerPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { friends } = useFriends();
  const mp = useMultiplayer();

  const acceptedFriends = useMemo(
    () => friends.filter((f) => f.status === 'accepted').map((f) => f.friend),
    [friends],
  );

  /* ── form state ── */

  const [gameId, setGameId] = useState(multiplayerGames[0]?.id ?? '');
  const [difficultyValue, setDifficultyValue] = useState('medium');
  const [stake, setStake] = useState(25);
  const [useStake, setUseStake] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Keep the selected difficulty valid when switching games
  const selectedGame = multiplayerGames.find((g) => g.id === gameId);
  const difficulties = selectedGame?.multiplayer?.difficulties ?? [];

  useEffect(() => {
    if (difficulties.length > 0 && !difficulties.some((d) => d.value === difficultyValue)) {
      setDifficultyValue(difficulties[0].value);
    }
  }, [difficulties, difficultyValue]);

  /* ── tick countdown / now ── */

  useEffect(() => {
    if (mp.grouped.starting.length === 0) return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      for (const entry of mp.grouped.starting) {
        const startedAt = entry.match.started_at
          ? new Date(entry.match.started_at).getTime()
          : null;
        if (!startedAt) continue;
        if (now >= startedAt) void mp.tickMatchStart(entry.match.id);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [mp]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const formatStartCountdown = (startedAt: string | null): string | null => {
    if (!startedAt) return null;
    const target = new Date(startedAt).getTime();
    if (!Number.isFinite(target)) return null;
    const remaining = Math.max(0, Math.ceil((target - nowMs) / 1000));
    return `${remaining}s`;
  };

  /* ── helpers ── */

  const toggleFriend = (id: string) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const flash = (msg: string) => {
    setMessage(msg);
    window.setTimeout(() => setMessage(null), 3000);
  };

  /* ── create match ── */

  const create = async () => {
    if (isCreating) return;
    setIsCreating(true);

    const effectiveStake = useStake ? Math.max(1, stake) : 0;
    const config: MatchConfig = { difficulty: difficultyValue };
    const configSeed = Math.floor(Math.random() * 2_000_000_000);

    const err = await mp.createMatch(gameId, effectiveStake, selectedIds, {
      config,
      configSeed,
    });
    flash(err ?? 'Match skapad ✅');
    if (!err) setSelectedIds([]);
    setIsCreating(false);
  };

  /* ── render ── */

  return (
    <div className="flex min-h-full flex-col items-center gap-6 px-4 py-10">
      <Link to="/" className="self-start text-sm text-text-muted hover:text-brand-light">
        ← Tillbaka
      </Link>

      <h2 className="text-3xl font-bold">⚔️ Multiplayer</h2>
      <p className="text-center text-sm text-text-muted max-w-xl">
        Utmana vänner med stake eller kör utan stake. Vid stake lägger alla
        samma insats i potten, annars får vinnaren en bonus.
      </p>

      {message && (
        <p className="rounded-lg bg-brand/20 px-3 py-2 text-xs text-brand-light">
          {message}
        </p>
      )}

      {/* ── Create match ── */}
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
          {/* Game picker – driven by registry */}
          <label className="text-sm">
            <span className="mb-1 block text-text-muted">Spel</span>
            <select
              value={gameId}
              onChange={(e) => setGameId(e.target.value)}
              className="w-full rounded-lg bg-black/30 px-3 py-2 ring-1 ring-white/10"
            >
              {multiplayerGames.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.emoji} {g.name}
                </option>
              ))}
            </select>
          </label>

          {/* Difficulty picker – driven by registry */}
          {difficulties.length > 1 && (
            <label className="text-sm">
              <span className="mb-1 block text-text-muted">
                Nivå (låst för alla)
              </span>
              <select
                value={difficultyValue}
                onChange={(e) => setDifficultyValue(e.target.value)}
                className="w-full rounded-lg bg-black/30 px-3 py-2 ring-1 ring-white/10"
              >
                {difficulties.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          {/* Stake input */}
          <label className="text-sm">
            <span className="mb-1 block text-text-muted">
              Stake (coins / spelare)
            </span>
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
          <p className="mb-3 text-xs text-text-muted">
            Utan stake: ingen coin dras vid start. Vinnaren får
            multiplayer-bonus.
          </p>
        )}

        <p className="mb-2 text-xs font-bold uppercase text-text-muted">
          Välj vänner att bjuda in
        </p>
        <div className="max-h-44 space-y-2 overflow-y-auto rounded-lg bg-black/20 p-3">
          {acceptedFriends.length === 0 && (
            <p className="text-xs text-text-muted">Inga vänner ännu.</p>
          )}
          {acceptedFriends.map((f) => (
            <label
              key={f.id}
              className="flex cursor-pointer items-center justify-between rounded-md px-2 py-1 hover:bg-white/5"
            >
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(f.id)}
                  onChange={() => toggleFriend(f.id)}
                />
                <span>{f.skin ?? '🙂'}</span>
                <span className="text-sm">
                  {f.username}#{f.tag}
                </span>
              </div>
              <span
                className={`text-[11px] ${f.is_online ? 'text-green-300' : 'text-text-muted'}`}
              >
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

      {/* ── Incoming invitations ── */}
      <Section title="Inkommande inbjudningar">
        {mp.grouped.incoming.length === 0 ? (
          <Empty>Inga inbjudningar just nu.</Empty>
        ) : (
          mp.grouped.incoming.map((entry) => (
            <MatchCard key={entry.match.id} entry={entry}>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={async () => {
                    const err = await mp.acceptInvite(entry.match.id);
                    flash(err ?? 'Inbjudan accepterad ✅');
                  }}
                  className="rounded-md bg-green-500/20 px-3 py-1 text-xs font-bold text-green-300"
                >
                  Acceptera
                </button>
                <button
                  onClick={async () => {
                    const err = await mp.declineInvite(entry.match.id);
                    flash(err ?? 'Inbjudan nekad');
                  }}
                  className="rounded-md bg-red-500/20 px-3 py-1 text-xs font-bold text-red-300"
                >
                  Neka
                </button>
              </div>
            </MatchCard>
          ))
        )}
      </Section>

      {/* ── Waiting to start ── */}
      <Section title="Väntar på start">
        {mp.grouped.waiting.length === 0 ? (
          <Empty>Inga väntande matcher.</Empty>
        ) : (
          mp.grouped.waiting.map((entry) => {
            const isHost = entry.match.host_id === user?.id;
            const allAccepted = entry.players.every(
              (p) => p.player.status === 'accepted',
            );

            return (
              <MatchCard key={entry.match.id} entry={entry}>
                <p className="mt-1 text-xs text-text-muted">
                  Accepterat:{' '}
                  {entry.players.filter((p) => p.player.status === 'accepted').length}/
                  {entry.players.length}
                </p>
                <div className="mt-2 flex gap-2">
                  {isHost ? (
                    <>
                      <button
                        onClick={async () => {
                          const err = await mp.startMatch(entry.match.id, 5);
                          flash(err ?? 'Matchstart synkad! Nedräkning igång ⏳');
                        }}
                        disabled={!allAccepted}
                        className="rounded-md bg-green-500/20 px-3 py-1 text-xs font-bold text-green-300 disabled:opacity-50"
                      >
                        Starta match
                      </button>
                      <button
                        onClick={async () => {
                          if (!window.confirm('Avbryta matchen?')) return;
                          const err = await mp.cancelMatch(entry.match.id);
                          flash(err ?? 'Match avbruten');
                        }}
                        className="rounded-md bg-red-500/20 px-3 py-1 text-xs font-bold text-red-300"
                      >
                        Avbryt
                      </button>
                    </>
                  ) : (
                    <span className="rounded-md bg-black/20 px-3 py-1 text-xs text-text-muted">
                      Väntar på att hosten startar
                    </span>
                  )}
                </div>
              </MatchCard>
            );
          })
        )}
      </Section>

      {/* ── Starting now ── */}
      <Section title="Startar nu">
        {mp.grouped.starting.length === 0 ? (
          <Empty>Ingen match startar just nu.</Empty>
        ) : (
          mp.grouped.starting.map((entry) => {
            const g = entry.match.game_id;
            const countdown = formatStartCountdown(entry.match.started_at);
            const canEnter = !countdown || countdown === '0s';

            return (
              <MatchCard key={entry.match.id} entry={entry} subtitle="Gemensam start">
                <p className="mt-1 text-xs text-text-muted">
                  Start om: {countdown ?? 'snart'}
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => {
                      mp.setActiveMatch(g, entry.match.id, {
                        config: (entry.match.config as MatchConfig | null) ?? undefined,
                        configSeed: entry.match.config_seed ?? undefined,
                      });
                      if (canEnter) {
                        navigate(gamePath(g));
                        return;
                      }
                      void mp.tickMatchStart(entry.match.id);
                    }}
                    className="rounded-md bg-brand/30 px-3 py-1 text-xs font-bold text-brand-light"
                  >
                    {canEnter ? 'Gå till spelet' : 'Redo i lobby'}
                  </button>
                </div>
              </MatchCard>
            );
          })
        )}
      </Section>

      {/* ── Active ── */}
      <Section title="Aktiva matcher">
        {mp.grouped.active.length === 0 ? (
          <Empty>Inga aktiva matcher.</Empty>
        ) : (
          mp.grouped.active.map((entry) => {
            const g = entry.match.game_id;
            return (
              <MatchCard key={entry.match.id} entry={entry}>
                <div className="mt-2 flex gap-2">
                  <Link
                    to={gamePath(g)}
                    onClick={() =>
                      mp.setActiveMatch(g, entry.match.id, {
                        config: (entry.match.config as MatchConfig | null) ?? undefined,
                        configSeed: entry.match.config_seed ?? undefined,
                      })
                    }
                    className="rounded-md bg-brand/30 px-3 py-1 text-xs font-bold text-brand-light"
                  >
                    Gå till spelet
                  </Link>
                </div>
              </MatchCard>
            );
          })
        )}
      </Section>

      {/* ── Completed ── */}
      <Section title="Senaste avslutade matcher">
        {mp.grouped.completed.length === 0 ? (
          <Empty>Inga avslutade matcher ännu.</Empty>
        ) : (
          mp.grouped.completed.map((entry) => {
            const accepted = entry.players.filter(
              (p) => p.player.status === 'accepted',
            );
            const pot = accepted.reduce(
              (sum, p) => sum + p.player.stake_locked,
              0,
            );
            const winner = entry.players.find(
              (p) => p.player.user_id === entry.match.winner_id,
            )?.profile;

            return (
              <div
                key={entry.match.id}
                className="rounded-xl bg-black/20 px-4 py-3 ring-1 ring-white/10"
              >
                <p className="text-sm font-semibold">
                  {gameLabel(entry.match.game_id)}
                </p>
                <p className="text-xs text-text-muted">
                  Vinnare:{' '}
                  {winner
                    ? `${winner.username}#${winner.tag}`
                    : 'okänd'}{' '}
                  •{' '}
                  {pot > 0
                    ? `Pot: ${pot} 🪙`
                    : 'Utan stake: bonus utdelad'}
                </p>
              </div>
            );
          })
        )}
      </Section>

      {mp.loading && (
        <p className="text-sm text-text-muted">Laddar multiplayer…</p>
      )}
    </div>
  );
}

/* ── tiny sub-components ── */

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="w-full max-w-2xl space-y-4">
      <h3 className="font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-text-muted">{children}</p>;
}

interface MatchCardProps {
  entry: import('../../multiplayer').MultiplayerMatchView;
  subtitle?: string;
  children?: React.ReactNode;
}

function MatchCard({ entry, subtitle, children }: MatchCardProps) {
  const label = gameLabel(entry.match.game_id);
  const stakeText =
    entry.match.stake > 0
      ? `Stake ${entry.match.stake} 🪙`
      : 'Bonus-läge utan stake';

  return (
    <div className="rounded-xl bg-surface-card p-4 ring-1 ring-white/10">
      <p className="text-sm font-semibold">
        {label} • {subtitle ?? stakeText}
      </p>
      {children}
    </div>
  );
}
