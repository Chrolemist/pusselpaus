/* ── MatchInboxPanel – slide-out multiplayer inbox ──
 *
 *  Replaces the old MultiplayerPage with a lightweight dropdown panel.
 *  Shows incoming invites, active matches, and recent results.
 *  Accept/decline invites → navigate straight to the game page.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Swords, X, Coins, Check, Rocket, Trophy } from 'lucide-react';
import { useAuth } from '../../auth';
import {
  useMultiplayer,
  gameLabel,
  gamePath,
} from '../../multiplayer';
import type { MatchConfig } from '../../multiplayer';
import LevelBadge from '../../components/LevelBadge';
import { displaySkin } from '../../core/skin';

interface MatchInboxPanelProps {
  onClose: () => void;
}

export default function MatchInboxPanel({ onClose }: MatchInboxPanelProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const mp = useMultiplayer();
  const [message, setMessage] = useState<string | null>(null);

  const flash = (msg: string) => {
    setMessage(msg);
    window.setTimeout(() => setMessage(null), 3500);
  };

  const goToGame = (entry: (typeof mp.grouped.active)[number]) => {
    const g = entry.match.game_id;
    mp.setActiveMatch(g, entry.match.id, {
      config: (entry.match.config as MatchConfig | null) ?? undefined,
      configSeed: entry.match.config_seed ?? undefined,
    });
    onClose();
    navigate(gamePath(g));
  };

  const totalBadge =
    mp.grouped.incoming.length +
    mp.grouped.waiting.length +
    mp.grouped.starting.length +
    mp.grouped.active.length;

  return (
    <motion.div
      className="fixed inset-y-0 right-0 z-40 flex w-80 max-w-[90vw] flex-col bg-surface-card shadow-2xl"
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <h3 className="flex items-center gap-1.5 text-lg font-bold"><Swords className="h-5 w-5" /> Matcher</h3>
        <button onClick={onClose} className="text-text-muted hover:text-white transition">
          <X className="h-4 w-4" />
        </button>
      </div>

      {message && (
        <p className="border-b border-white/10 px-4 py-2 text-xs text-accent">{message}</p>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-5">
        {mp.loading && <p className="text-sm text-text-muted">Laddar…</p>}

        {/* ── Incoming invitations ── */}
        {mp.grouped.incoming.length > 0 && (
          <section>
            <p className="mb-2 text-xs font-bold uppercase text-text-muted">
              Inbjudningar ({mp.grouped.incoming.length})
            </p>
            {mp.grouped.incoming.map((entry) => {
              const host = entry.players.find(
                (p) => p.player.user_id === entry.match.host_id,
              )?.profile;
              return (
                <div
                  key={entry.match.id}
                  className="mb-2 rounded-xl bg-black/20 px-3 py-3 ring-1 ring-white/10"
                >
                  <p className="text-sm font-semibold">
                    {gameLabel(entry.match.game_id)}
                  </p>
                  <p className="text-xs text-text-muted">
                    Från {host ? <>{displaySkin(host.skin)} {host.username} <LevelBadge level={host.level} /></> : 'okänd'}
                    {entry.match.stake > 0
                      ? <> · Stake {entry.match.stake} <Coins className="inline h-3 w-3 text-yellow-400" /></>
                      : ' · Utan stake'}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={async () => {
                        const err = await mp.acceptInvite(entry.match.id);
                        if (err) {
                          flash(err);
                        } else {
                          // Navigate to game page and trigger match-found overlay
                          const g = entry.match.game_id;
                          mp.setActiveMatch(g, entry.match.id, {
                            config: (entry.match.config as MatchConfig | null) ?? undefined,
                            configSeed: entry.match.config_seed ?? undefined,
                            showOverlay: true,
                          });
                          onClose();
                          navigate(gamePath(g));
                        }
                      }}
                      className="flex items-center gap-1 rounded-md bg-green-500/20 px-3 py-1.5 text-xs font-bold text-green-300 transition hover:bg-green-500/40 active:scale-95"
                    >
                      <Check className="h-3 w-3" /> Acceptera
                    </button>
                    <button
                      onClick={async () => {
                        const err = await mp.declineInvite(entry.match.id);
                        flash(err ?? 'Nekad');
                      }}
                      className="flex items-center gap-1 rounded-md bg-red-500/20 px-3 py-1.5 text-xs font-bold text-red-300 transition hover:bg-red-500/40 active:scale-95"
                    >
                      <X className="h-3 w-3" /> Neka
                    </button>
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {/* ── Waiting for host to start ── */}
        {mp.grouped.waiting.length > 0 && (
          <section>
            <p className="mb-2 text-xs font-bold uppercase text-text-muted">
              Väntar på start
            </p>
            {mp.grouped.waiting.map((entry) => {
              const isHost = entry.match.host_id === user?.id;
              const acceptedCount = entry.players.filter(
                (p) => p.player.status === 'accepted',
              ).length;

              return (
                <div
                  key={entry.match.id}
                  className="mb-2 rounded-xl bg-black/20 px-3 py-3 ring-1 ring-white/10"
                >
                  <p className="text-sm font-semibold">
                    {gameLabel(entry.match.game_id)}
                  </p>
                  <p className="text-xs text-text-muted">
                    {acceptedCount}/{entry.players.length} accepterat
                    {entry.match.stake > 0
                      ? <> · {entry.match.stake} <Coins className="inline h-3 w-3 text-yellow-400" /></>
                      : ''}
                  </p>

                  <div className="mt-1 flex flex-wrap gap-1">
                    {entry.players.map(({ player, profile: prof }) => (
                      <span
                        key={player.user_id}
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${
                          player.status === 'accepted'
                            ? 'bg-green-500/20 text-green-300'
                            : player.status === 'invited'
                              ? 'bg-yellow-500/20 text-yellow-300'
                              : 'bg-red-500/20 text-red-300'
                        }`}
                      >
                        {displaySkin(prof?.skin)} {prof?.username ?? '?'}
                        <LevelBadge level={prof?.level} />
                      </span>
                    ))}
                  </div>

                  <div className="mt-2 flex gap-2">
                    {isHost ? (
                      <>
                        <button
                          onClick={async () => {
                            const err = await mp.startMatchIfReady(entry.match.id, 5);
                            if (err) flash(err);
                            else goToGame(entry);
                          }}
                          className="rounded-md bg-green-500/20 px-3 py-1.5 text-xs font-bold text-green-300 transition hover:bg-green-500/40 active:scale-95 disabled:opacity-40"
                        >
                          ▶ Starta
                        </button>
                        <button
                          onClick={async () => {
                            const err = await mp.cancelMatch(entry.match.id);
                            flash(err ?? 'Avbruten');
                          }}
                          className="rounded-md bg-red-500/20 px-3 py-1.5 text-xs font-bold text-red-300 transition hover:bg-red-500/40 active:scale-95"
                        >
                          Avbryt
                        </button>
                      </>
                    ) : (
                      <span className="text-xs text-text-muted">
                        Väntar på hosten…
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {/* ── Starting now (countdown) ── */}
        {mp.grouped.starting.length > 0 && (
          <section>
            <p className="mb-2 text-xs font-bold uppercase text-text-muted">
              Startar nu!
            </p>
            {mp.grouped.starting.map((entry) => (
              <div
                key={entry.match.id}
                className="mb-2 rounded-xl bg-brand/10 px-3 py-3 ring-1 ring-brand/30"
              >
                <p className="text-sm font-semibold text-brand-light">
                  {gameLabel(entry.match.game_id)}
                </p>
                <button
                  onClick={() => goToGame(entry)}
                  className="mt-2 w-full flex items-center justify-center gap-1.5 rounded-lg bg-brand/30 px-3 py-2 text-sm font-bold text-brand-light transition hover:bg-brand/50 active:scale-95"
                >
                  <Rocket className="h-3.5 w-3.5" /> Gå till spelet
                </button>
              </div>
            ))}
          </section>
        )}

        {/* ── Active (in progress) ── */}
        {mp.grouped.active.length > 0 && (
          <section>
            <p className="mb-2 text-xs font-bold uppercase text-text-muted">
              Pågående
            </p>
            {mp.grouped.active.map((entry) => (
              <div
                key={entry.match.id}
                className="mb-2 rounded-xl bg-black/20 px-3 py-3 ring-1 ring-white/10"
              >
                <p className="text-sm font-semibold">
                  {gameLabel(entry.match.game_id)}
                </p>
                <button
                  onClick={() => goToGame(entry)}
                  className="mt-2 w-full rounded-lg bg-brand/30 px-3 py-2 text-sm font-bold text-brand-light transition hover:bg-brand/50 active:scale-95"
                >
                  ▶ Fortsätt
                </button>
              </div>
            ))}
          </section>
        )}

        {/* ── Recent completed ── */}
        {mp.grouped.completed.length > 0 && (
          <section>
            <p className="mb-2 text-xs font-bold uppercase text-text-muted">
              Senaste resultat
            </p>
            {mp.grouped.completed.slice(0, 5).map((entry) => {
              const winner = entry.players.find(
                (p) => p.player.user_id === entry.match.winner_id,
              )?.profile;
              const isMe = entry.match.winner_id === user?.id;
              const accepted = entry.players.filter(
                (p) => p.player.status === 'accepted',
              );
              const pot = accepted.reduce(
                (sum, p) => sum + p.player.stake_locked,
                0,
              );

              return (
                <div
                  key={entry.match.id}
                  className="mb-2 rounded-xl bg-black/20 px-3 py-2.5 ring-1 ring-white/10"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">
                      {gameLabel(entry.match.game_id)}
                    </p>
                    <span className={`flex items-center gap-1 text-xs font-bold ${isMe ? 'text-success' : 'text-text-muted'}`}>
                      {isMe ? <><Trophy className="h-3 w-3" /> Vinst!</> : 'Förlust'}
                    </span>
                  </div>
                  <p className="text-xs text-text-muted">
                    Vinnare: {winner
                      ? <>{displaySkin(winner.skin)} {winner.username} <LevelBadge level={winner.level} /></>
                      : 'okänd'}
                    {pot > 0 ? <> · {pot} <Coins className="inline h-3 w-3 text-yellow-400" /></> : ''}
                  </p>
                </div>
              );
            })}
          </section>
        )}

        {/* ── Empty state ── */}
        {!mp.loading && totalBadge === 0 && mp.grouped.completed.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <Swords className="h-10 w-10 text-brand-light" />
            <p className="text-sm text-text-muted">
              Inga matcher just nu.
            </p>
            <p className="text-xs text-text-muted">
              Gå till ett spel och klicka <strong>"Bjud in vän"</strong> för att starta en multiplayer-match!
            </p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
