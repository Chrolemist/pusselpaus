import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useLiveMultiplayerMatch } from '../hooks/useLiveMultiplayerMatch';
import type { MultiplayerGameId } from '../hooks/useMultiplayer';

const GAME_LABELS: Record<MultiplayerGameId, string> = {
  sudoku: 'Sudoku',
  numberpath: 'Sifferstigen',
  rytmrush: 'RytmRush',
};

interface Props {
  gameId: MultiplayerGameId;
}

const AFK_TIMEOUT_SECONDS = 180;

function formatRemaining(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function MultiplayerLiveBanner({ gameId }: Props) {
  const live = useLiveMultiplayerMatch(gameId);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const hasPendingPlayers = live.acceptedPlayers.some((p) => !p.player.submitted);
  const timeoutRemaining = (() => {
    if (!live.match?.started_at) return null;
    const started = new Date(live.match.started_at).getTime();
    if (!Number.isFinite(started)) return null;
    const deadline = started + AFK_TIMEOUT_SECONDS * 1000;
    return Math.ceil((deadline - nowMs) / 1000);
  })();

  if (!live.isActive || !live.match) return null;

  const status = live.match.status;

  return (
    <div className="w-full max-w-[min(90vw,420px)] rounded-xl bg-surface-card/90 px-4 py-3 ring-1 ring-white/10">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-wide text-brand-light">⚔️ Multiplayer live · {GAME_LABELS[gameId]}</p>
        <Link to="/multiplayer" className="text-[11px] text-text-muted underline underline-offset-2 hover:text-brand-light">
          Öppna match
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
                <span className="truncate text-text-muted">
                  {profile ? `${profile.skin ?? '🙂'} ${profile.username}#${profile.tag}` : 'Spelare'}
                </span>
                <span className={player.submitted ? 'text-green-300' : 'text-yellow-300'}>
                  {player.submitted ? 'Klar' : 'Spelar…'}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {status === 'completed' && (
        <div className="rounded-md bg-black/20 px-3 py-2">
          <p className={`text-sm font-bold ${live.outcome === 'won' ? 'text-green-300' : 'text-red-300'}`}>
            {live.outcome === 'won' ? '🏆 Du vann matchen!' : '💥 Matchen är avgjord'}
          </p>
          <p className="text-xs text-text-muted">
            Vinnare: {live.winner ? `${live.winner.username}#${live.winner.tag}` : 'okänd'}
          </p>
        </div>
      )}

      {live.loading && <p className="mt-2 text-[11px] text-text-muted">Uppdaterar…</p>}
    </div>
  );
}
