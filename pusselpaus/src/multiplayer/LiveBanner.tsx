/* ── LiveBanner – in-game multiplayer overlay ──
 *
 *  Drop into any game page:
 *    import { LiveBanner } from '../../multiplayer';
 *    <LiveBanner gameId="sudoku" />
 *
 *  Game label is read from game-registry – no hardcoded map needed.
 */

import { displaySkin } from '../core/skin';

import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Swords, Trophy, Zap, Clock } from 'lucide-react';
import { useLiveMatch } from './useLiveMatch';
import { mpTickMatchStart, mpForfeitMatch } from './api';
import { clearActiveMatch } from './activeMatch';
import { gameLabel } from './useMultiplayer';
import LevelBadge from '../components/LevelBadge';

const AFK_TIMEOUT_SECONDS = 180;

function formatRemaining(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

interface Props {
  gameId: string;
}

export default function LiveBanner({ gameId }: Props) {
  const live = useLiveMatch(gameId);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const hasPendingPlayers = live.acceptedPlayers.some((p) => !p.player.submitted);

  const startCountdown = (() => {
    if (!live.match?.started_at) return null;
    const started = new Date(live.match.started_at).getTime();
    if (!Number.isFinite(started)) return null;
    return Math.max(0, Math.ceil((started - nowMs) / 1000));
  })();

  const timeoutRemaining = (() => {
    if (!live.match?.started_at) return null;
    const started = new Date(live.match.started_at).getTime();
    if (!Number.isFinite(started)) return null;
    const deadline = started + AFK_TIMEOUT_SECONDS * 1000;
    return Math.ceil((deadline - nowMs) / 1000);
  })();

  // Auto-tick when countdown reaches 0
  useEffect(() => {
    if (!live.match) return;
    if (live.match.status !== 'starting') return;
    if (startCountdown === null || startCountdown > 0) return;
    void mpTickMatchStart(live.match.id);
  }, [live.match, startCountdown]);

  if (!live.isActive || !live.match) return null;

  const status = live.match.status;
  const label = gameLabel(gameId);
  const hasWinner = Boolean(live.match.winner_id);

  return (
    <div className="w-full max-w-[min(90vw,420px)] rounded-xl bg-surface-card/90 px-4 py-3 ring-1 ring-white/10">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-brand-light">
          <Swords className="h-3.5 w-3.5" /> Multiplayer live · {label}
        </p>
        <Link
          to="/"
          className="text-[11px] text-text-muted underline underline-offset-2 hover:text-brand-light"
        >
          Lobby
        </Link>
      </div>

      {status === 'waiting' && (
        <p className="text-xs text-text-muted">
          Väntar på spelare: {live.acceptedPlayers.length} accepterade.
        </p>
      )}

      {status === 'in_progress' && (
        <>
          <p className="mb-2 text-xs text-text-muted">
            {live.me?.submitted
              ? `Du är klar. Väntar på andra (${live.submittedCount}/${live.acceptedPlayers.length}).`
              : `Match pågår live (${live.submittedCount}/${live.acceptedPlayers.length} klara).`}
          </p>
          {hasPendingPlayers && timeoutRemaining !== null && (
            <p className="mb-2 text-[11px] text-yellow-300">
              AFK-timeout: auto-avgörs om {formatRemaining(timeoutRemaining)}
            </p>
          )}
          <div className="space-y-1">
            {live.acceptedPlayers.map(({ player, profile }) => (
              <div key={player.id} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1 truncate text-text-muted">
                  {profile
                    ? <>{displaySkin(profile.skin)} {profile.username}#{profile.tag} <LevelBadge level={profile.level} /></>
                    : 'Spelare'}
                </span>
                <span
                  className={
                    player.forfeited
                      ? 'text-red-300'
                      : player.submitted
                        ? 'text-green-300'
                        : 'text-yellow-300'
                  }
                >
                  {player.forfeited ? 'Gav upp' : player.submitted ? 'Klar' : 'Spelar…'}
                </span>
              </div>
            ))}
          </div>

          {live.me && !live.me.submitted && (
            <div className="mt-2">
              <button
                onClick={async () => {
                  if (!live.match) return;
                  if (!window.confirm('Vill du ge upp matchen?')) return;
                  await mpForfeitMatch(live.match.id);
                  clearActiveMatch(gameId);
                }}
                className="rounded-md bg-red-500/20 px-2 py-1 text-[11px] font-semibold text-red-300 hover:bg-red-500/35"
              >
                Ge upp match
              </button>
            </div>
          )}
        </>
      )}

      {status === 'starting' && (
        <div className="rounded-md bg-black/20 px-3 py-2">
          <p className="flex items-center gap-1.5 text-sm font-bold text-accent">
            <Clock className="h-4 w-4" /> Gemensam start om {formatRemaining(startCountdown ?? 0)}
          </p>
          <p className="text-xs text-text-muted">
            Alla startar samtidigt när nedräkningen når 0.
          </p>
        </div>
      )}

      {status === 'completed' && (
        <div className="rounded-md bg-black/20 px-3 py-2">
          <p
            className={`flex items-center gap-1.5 text-sm font-bold ${live.outcome === 'won' ? 'text-green-300' : hasWinner ? 'text-red-300' : 'text-yellow-300'}`}
          >
            {live.outcome === 'won'
              ? <><Trophy className="h-4 w-4" /> Du vann matchen!</>
              : hasWinner
                ? <><Zap className="h-4 w-4" /> Matchen är avgjord</>
                : <><Clock className="h-4 w-4" /> Matchen avslutades utan vinnare</>}
          </p>
          <p className="text-xs text-text-muted">
            Vinnare: {live.winner ? `${live.winner.username}#${live.winner.tag}` : 'ingen'}
          </p>
        </div>
      )}

      {live.loading && <p className="mt-2 text-[11px] text-text-muted">Uppdaterar…</p>}
    </div>
  );
}
