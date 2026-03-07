/* ── LiveBanner – in-game multiplayer overlay ──
 *
 *  Drop into any game page:
 *    import { LiveBanner } from '../../multiplayer';
 *    <LiveBanner gameId="sudoku" />
 *
 *  Game label is read from game-registry – no hardcoded map needed.
 */

import { AnimatePresence, motion } from 'motion/react';
import confetti from 'canvas-confetti';
import { displaySkin } from '../core/skin';

import { Link, useLocation } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Swords, Trophy, Zap, Clock, Coins, Medal, Crown, X } from 'lucide-react';
import { useLiveMatch, type LivePlayer } from './useLiveMatch';
import { mpTickMatchStart, mpForfeitMatch } from './api';
import { clearActiveMatch } from './activeMatch';
import { gameLabel } from './useMultiplayer';
import { playCountdownTick } from './matchSounds';
import LevelBadge from '../components/LevelBadge';
import type { MultiplayerMatch } from '../lib/database.types';

const AFK_TIMEOUT_SECONDS = 180;

interface MatchResultRow {
  player: LivePlayer;
  rank: number;
  coinsAwarded: number;
  statusLabel: string;
  statLabel: string;
  detailLabel: string | null;
  placementTone: string;
}

interface MatchTheme {
  accentText: string;
  accentGlow: string;
  panelGradient: string;
  badgeLabel: string;
}

function formatRemaining(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function getWinnerBonus(gameId: string): number {
  switch (gameId) {
    case 'numberpath':
      return 40;
    case 'sudoku':
    case 'rytmrush':
    default:
      return 45;
  }
}

function getMatchTheme(gameId: string): MatchTheme {
  switch (gameId) {
    case 'sudoku':
      return {
        accentText: 'text-cyan-300',
        accentGlow: 'rgba(34,211,238,0.28)',
        panelGradient: 'from-cyan-400/20 via-brand/10 to-transparent',
        badgeLabel: 'Precision race',
      };
    case 'numberpath':
      return {
        accentText: 'text-emerald-300',
        accentGlow: 'rgba(16,185,129,0.26)',
        panelGradient: 'from-emerald-400/20 via-brand/10 to-transparent',
        badgeLabel: 'Path sprint',
      };
    case 'rytmrush':
    default:
      return {
        accentText: 'text-fuchsia-300',
        accentGlow: 'rgba(217,70,239,0.26)',
        panelGradient: 'from-fuchsia-400/20 via-brand/10 to-transparent',
        badgeLabel: 'Rhythm clash',
      };
  }
}

function formatScore(value: number | null): string {
  return Math.round(value ?? 0).toLocaleString('sv-SE');
}

function formatCompletedOffset(match: MultiplayerMatch | null, submittedAt: string | null): string | null {
  if (!match?.started_at || !submittedAt) return null;
  const startedMs = new Date(match.started_at).getTime();
  const submittedMs = new Date(submittedAt).getTime();
  if (!Number.isFinite(startedMs) || !Number.isFinite(submittedMs) || submittedMs < startedMs) return null;
  return formatRemaining(Math.round((submittedMs - startedMs) / 1000));
}

function buildResultRows(gameId: string, match: MultiplayerMatch, players: LivePlayer[]): MatchResultRow[] {
  const acceptedPlayers = players.filter((entry) => entry.player.status === 'accepted');
  const pot = acceptedPlayers.reduce((sum, entry) => sum + Math.max(0, entry.player.stake_locked ?? 0), 0);
  const winnerBonus = pot > 0 ? pot : getWinnerBonus(gameId);

  const sorted = [...acceptedPlayers].sort((a, b) => {
    const aForfeited = a.player.forfeited === true;
    const bForfeited = b.player.forfeited === true;
    if (aForfeited !== bForfeited) return aForfeited ? 1 : -1;

    if (gameId === 'rytmrush') {
      const survivedDiff = (b.player.survived_seconds ?? -1) - (a.player.survived_seconds ?? -1);
      if (survivedDiff !== 0) return survivedDiff;
      const scoreDiff = (b.player.score ?? -1) - (a.player.score ?? -1);
      if (scoreDiff !== 0) return scoreDiff;
    } else {
      const aElapsed = a.player.elapsed_seconds ?? Number.POSITIVE_INFINITY;
      const bElapsed = b.player.elapsed_seconds ?? Number.POSITIVE_INFINITY;
      if (aElapsed !== bElapsed) return aElapsed - bElapsed;
    }

    const aSubmitted = a.player.submitted_at ? new Date(a.player.submitted_at).getTime() : Number.POSITIVE_INFINITY;
    const bSubmitted = b.player.submitted_at ? new Date(b.player.submitted_at).getTime() : Number.POSITIVE_INFINITY;
    if (aSubmitted !== bSubmitted) return aSubmitted - bSubmitted;

    return (a.profile?.username ?? '').localeCompare(b.profile?.username ?? '');
  });

  return sorted.map((entry, index) => {
    const isWinner = match.winner_id === entry.player.user_id;
    const finishOffset = formatCompletedOffset(match, entry.player.submitted_at);

    let statusLabel = 'Resultat saknas';
    let statLabel = '—';
    let detailLabel: string | null = null;

    if (entry.player.forfeited) {
      statusLabel = 'AFK / gav upp';
      statLabel = 'Nådde inte mål';
      detailLabel = finishOffset ? `Timeout efter ${finishOffset}` : 'Ingen sluttid registrerad';
    } else if (gameId === 'rytmrush') {
      statusLabel = isWinner ? 'Vann rytmduellen' : 'Match avslutad';
      statLabel = `Överlevde ${formatRemaining(Math.max(0, Math.round(entry.player.survived_seconds ?? 0)))}`;
      detailLabel = `Poäng ${formatScore(entry.player.score)}`;
    } else {
      statusLabel = isWinner ? 'Snabbast i mål' : 'Klarade banan';
      statLabel = `Tid ${formatRemaining(Math.max(0, Math.round(entry.player.elapsed_seconds ?? 0)))}`;
      detailLabel = finishOffset ? `Målpassering ${finishOffset}` : null;
    }

    if (!entry.player.submitted && !entry.player.forfeited) {
      statusLabel = 'Ej registrerad i mål';
      statLabel = 'Resultat saknas';
      detailLabel = null;
    }

    return {
      player: entry,
      rank: index + 1,
      coinsAwarded: match.winner_id
        ? (isWinner ? winnerBonus : 0)
        : Math.max(0, entry.player.stake_locked ?? 0),
      statusLabel,
      statLabel,
      detailLabel,
      placementTone:
        index === 0
          ? 'from-yellow-400/30 via-yellow-300/10 to-transparent'
          : index === 1
            ? 'from-slate-300/20 via-slate-200/10 to-transparent'
            : index === 2
              ? 'from-amber-700/20 via-amber-500/10 to-transparent'
              : 'from-brand/15 via-brand/5 to-transparent',
    };
  });
}

function placementDecor(rank: number) {
  if (rank === 1) return <Crown className="h-4 w-4 text-yellow-300" />;
  if (rank <= 3) return <Medal className="h-4 w-4 text-brand-light" />;
  return <span className="text-xs font-bold text-text-muted">#{rank}</span>;
}

function podiumHeight(rank: number): string {
  if (rank === 1) return 'h-28 sm:h-32';
  if (rank === 2) return 'h-20 sm:h-24';
  return 'h-16 sm:h-20';
}

function podiumOrder(rows: MatchResultRow[]): MatchResultRow[] {
  const second = rows.find((row) => row.rank === 2);
  const first = rows.find((row) => row.rank === 1);
  const third = rows.find((row) => row.rank === 3);
  return [second, first, third].filter((row): row is MatchResultRow => Boolean(row));
}

function placementLabel(rank: number): string {
  if (rank === 1) return '1st';
  if (rank === 2) return '2nd';
  if (rank === 3) return '3rd';
  return `${rank}th`;
}

function timeoutTone(seconds: number | null) {
  if (seconds == null) {
    return {
      text: 'text-brand-light',
      glow: 'shadow-brand/20',
      ring: 'ring-brand/25',
      bar: 'from-brand via-cyan-400 to-sky-400',
      pulse: false,
      label: 'Gemensam sluttid',
    };
  }
  if (seconds <= 10) {
    return {
      text: 'text-red-300',
      glow: 'shadow-red-500/30',
      ring: 'ring-red-400/35',
      bar: 'from-red-500 via-orange-400 to-yellow-300',
      pulse: true,
      label: 'Sista sekunderna',
    };
  }
  if (seconds <= 30) {
    return {
      text: 'text-amber-300',
      glow: 'shadow-amber-500/25',
      ring: 'ring-amber-400/30',
      bar: 'from-amber-400 via-yellow-300 to-brand-light',
      pulse: false,
      label: 'Skynda till mål',
    };
  }
  return {
    text: 'text-emerald-300',
    glow: 'shadow-emerald-500/20',
    ring: 'ring-emerald-400/25',
    bar: 'from-emerald-400 via-cyan-300 to-brand-light',
    pulse: false,
    label: 'Gemensam sluttid',
  };
}

interface ResultsOverlayProps {
  gameId: string;
  label: string;
  match: MultiplayerMatch;
  rows: MatchResultRow[];
  myUserId: string | null;
  onClose: () => void;
  onReplay: () => void;
}

function ResultsOverlay({ gameId, label, match, rows, myUserId, onClose, onReplay }: ResultsOverlayProps) {
  const meRow = rows.find((row) => row.player.player.user_id === myUserId) ?? null;
  const winnerName = rows.find((row) => row.player.player.user_id === match.winner_id)?.player.profile?.username ?? null;
  const podiumRows = podiumOrder(rows);
  const afkCount = rows.filter((row) => row.player.player.forfeited).length;
  const totalCoinsAwarded = rows.reduce((sum, row) => sum + row.coinsAwarded, 0);
  const theme = getMatchTheme(gameId);

  useEffect(() => {
    if (!rows.length) return;
    const burst = window.setTimeout(() => {
      confetti({
        particleCount: 160,
        spread: 85,
        origin: { y: 0.25 },
        colors: ['#facc15', '#6366f1', '#38bdf8', '#22c55e', '#fb7185'],
      });
    }, 180);

    return () => window.clearTimeout(burst);
  }, [rows.length]);

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[10000] flex items-center justify-center bg-surface/85 px-4 py-6 backdrop-blur-md"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          className="relative w-full max-w-4xl overflow-hidden rounded-[28px] border border-white/10 bg-[#0f1121] shadow-2xl"
          style={{ boxShadow: `0 24px 80px ${theme.accentGlow}` }}
          initial={{ y: 28, scale: 0.96, opacity: 0 }}
          animate={{ y: 0, scale: 1, opacity: 1 }}
          exit={{ y: 24, scale: 0.98, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 180, damping: 18 }}
        >
          <div className={`absolute inset-0 bg-gradient-to-br ${theme.panelGradient}`} />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.12),transparent_55%)]" />
          <div className="relative z-10 p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-bold uppercase tracking-[0.28em] text-brand-light">Multiplayer resultat</p>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.22em] ${theme.accentText} bg-white/5 ring-1 ring-white/10`}>
                    {theme.badgeLabel}
                  </span>
                </div>
                <h2 className="mt-2 text-3xl font-extrabold text-white sm:text-4xl">{label} · slutresultat</h2>
                <p className="mt-2 text-sm text-text-muted">
                  {match.winner_id
                    ? `Vinnare: ${winnerName ?? 'okänd spelare'} · alla spelare ser samma scoreboard.`
                    : 'Ingen vinnare utsågs – eventuella stakes återbetalades automatiskt.'}
                </p>
              </div>

              <button
                onClick={onClose}
                className="rounded-full bg-white/5 p-2 text-text-muted transition hover:bg-white/10 hover:text-white"
                aria-label="Stäng resultat"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {meRow && (
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl bg-white/5 px-4 py-4 ring-1 ring-white/10">
                  <p className="text-[11px] uppercase tracking-wide text-text-muted">Din placering</p>
                  <p className="mt-1 text-3xl font-extrabold text-white">#{meRow.rank}</p>
                </div>
                <div className="rounded-2xl bg-white/5 px-4 py-4 ring-1 ring-white/10">
                  <p className="text-[11px] uppercase tracking-wide text-text-muted">Ditt resultat</p>
                  <p className={`mt-1 text-lg font-bold ${theme.accentText}`}>{meRow.statLabel}</p>
                </div>
                <div className="rounded-2xl bg-white/5 px-4 py-4 ring-1 ring-white/10">
                  <p className="text-[11px] uppercase tracking-wide text-text-muted">Matchmynt</p>
                  <p className="mt-1 flex items-center gap-2 text-lg font-bold text-yellow-300">
                    <Coins className="h-5 w-5" /> +{meRow.coinsAwarded}
                  </p>
                </div>
              </div>
            )}

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-white/5 px-4 py-3 ring-1 ring-white/10">
                <p className="text-[11px] uppercase tracking-wide text-text-muted">Spelare i mål</p>
                <p className="mt-1 text-2xl font-extrabold text-white">{rows.length}</p>
              </div>
              <div className="rounded-2xl bg-white/5 px-4 py-3 ring-1 ring-white/10">
                <p className="text-[11px] uppercase tracking-wide text-text-muted">AFK / gav upp</p>
                <p className="mt-1 text-2xl font-extrabold text-red-300">{afkCount}</p>
              </div>
              <div className="rounded-2xl bg-white/5 px-4 py-3 ring-1 ring-white/10">
                <p className="text-[11px] uppercase tracking-wide text-text-muted">Utdelade mynt</p>
                <p className="mt-1 flex items-center gap-2 text-2xl font-extrabold text-yellow-300">
                  <Coins className="h-5 w-5" /> {totalCoinsAwarded}
                </p>
              </div>
            </div>

            {podiumRows.length > 0 && (
              <div className="mt-8 rounded-[24px] border border-white/10 bg-white/5 px-4 py-6 sm:px-6">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.24em] text-brand-light">Podium</p>
                    <p className="mt-1 text-sm text-text-muted">Top 3 med synkad slutplacering för alla spelare</p>
                  </div>
                  <Trophy className="h-6 w-6 text-yellow-300" />
                </div>

                <div className="flex items-end justify-center gap-3 sm:gap-5">
                  {podiumRows.map((row) => {
                    const profile = row.player.profile;
                    const isWinner = row.rank === 1;
                    const isMe = row.player.player.user_id === myUserId;

                    return (
                      <motion.div
                        key={`podium-${row.player.player.id}`}
                        className={`flex min-w-0 flex-1 flex-col items-center ${isWinner ? 'order-2' : row.rank === 2 ? 'order-1' : 'order-3'}`}
                        initial={{ opacity: 0, y: 24 }}
                        animate={{ opacity: 1, y: 0, scale: isWinner ? [0.96, 1.03, 1] : 1 }}
                        transition={{ delay: 0.12 * row.rank, type: 'spring', stiffness: 170, damping: 16 }}
                      >
                        <div className="mb-3 flex flex-col items-center text-center">
                          <div className={`flex h-14 w-14 items-center justify-center rounded-full border text-2xl shadow-lg ${isWinner ? 'border-yellow-300/60 bg-yellow-300/10' : 'border-white/15 bg-white/10'}`}>
                            {displaySkin(profile?.skin)}
                          </div>
                          <div className="mt-2 flex items-center gap-1 text-xs font-bold text-white">
                            {placementDecor(row.rank)}
                            <span className="max-w-[88px] truncate">{profile ? profile.username : 'Spelare'}</span>
                          </div>
                          <p className={`mt-1 text-sm font-extrabold ${isWinner ? 'text-yellow-300' : theme.accentText}`}>{placementLabel(row.rank)}</p>
                          <p className="mt-1 text-[11px] text-text-muted">+{row.coinsAwarded} coins</p>
                          {isMe && <span className="mt-1 rounded-full bg-brand/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-light">Du</span>}
                        </div>

                        <div className={`flex w-full max-w-[120px] flex-col items-center justify-center rounded-t-2xl border border-white/10 bg-gradient-to-b ${isWinner ? 'from-yellow-400/35 to-yellow-600/25' : row.rank === 2 ? 'from-slate-200/25 to-slate-400/15' : 'from-amber-500/25 to-amber-700/15'} ${podiumHeight(row.rank)}`}>
                          <span className="text-2xl font-extrabold text-white">{row.rank}</span>
                          <span className="text-[10px] uppercase tracking-[0.22em] text-text-muted">plats</span>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mt-6 space-y-3">
              {rows.map((row) => {
                const profile = row.player.profile;
                const isMe = row.player.player.user_id === myUserId;
                const isWinner = match.winner_id === row.player.player.user_id;

                return (
                  <motion.div
                    key={row.player.player.id}
                    className={`relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-r ${row.placementTone} bg-white/5 px-4 py-4`}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.08 * row.rank }}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-xl shadow-inner shadow-black/30">
                          {displaySkin(profile?.skin)}
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="flex items-center gap-1 text-sm font-bold text-white">
                              {placementDecor(row.rank)}
                              {profile ? `${profile.username}#${profile.tag}` : 'Spelare'}
                            </span>
                            {profile?.level != null && <LevelBadge level={profile.level} />}
                            {isMe && <span className="rounded-full bg-brand/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-light">Du</span>}
                            {isWinner && <span className="rounded-full bg-yellow-400/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-yellow-300">Vinnare</span>}
                          </div>
                          <p className={`mt-1 text-sm font-semibold ${theme.accentText}`}>{row.statLabel}</p>
                          <p className="text-xs text-text-muted">{row.statusLabel}{row.detailLabel ? ` · ${row.detailLabel}` : ''}</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-4 sm:justify-end">
                        <div className="text-right">
                          <p className="text-[11px] uppercase tracking-wide text-text-muted">Placering</p>
                          <p className="text-lg font-extrabold text-white">#{row.rank}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[11px] uppercase tracking-wide text-text-muted">Mynt</p>
                          <p className="flex items-center justify-end gap-1 text-lg font-extrabold text-yellow-300">
                            <Coins className="h-4 w-4" /> +{row.coinsAwarded}
                          </p>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
              <p className="text-xs text-text-muted">
                {gameId === 'rytmrush'
                  ? 'Placering sorteras på överlevnadstid, sedan poäng.'
                  : 'Placering sorteras på snabbaste sluttid.'}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={onReplay}
                  className="rounded-xl bg-success px-4 py-2 text-sm font-bold text-white shadow-lg shadow-success/20 transition hover:brightness-110"
                >
                  Spela igen
                </button>
                <Link
                  to="/"
                  onClick={() => {
                    clearActiveMatch(gameId);
                    onClose();
                  }}
                  className="rounded-xl bg-white/5 px-4 py-2 text-sm font-semibold text-text-muted ring-1 ring-white/10 transition hover:bg-white/10 hover:text-white"
                >
                  Till lobby
                </Link>
                <button
                  onClick={onClose}
                  className="rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white shadow-lg shadow-brand/25 transition hover:brightness-110"
                >
                  Stäng scoreboard
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

interface Props {
  gameId: string;
}

export default function LiveBanner({ gameId }: Props) {
  const live = useLiveMatch(gameId);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [dismissedMatchId, setDismissedMatchId] = useState<string | null>(null);
  const location = useLocation();
  const lastTimeoutTickRef = useRef<number | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const hasPendingPlayers = live.acceptedPlayers.some((p) => !p.player.submitted);
  const resultRows = useMemo(
    () => (live.match?.status === 'completed' ? buildResultRows(gameId, live.match, live.players) : []),
    [gameId, live.match, live.players],
  );

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
  const timeoutProgress = timeoutRemaining == null
    ? 1
    : Math.max(0, Math.min(1, timeoutRemaining / AFK_TIMEOUT_SECONDS));
  const timeoutUi = timeoutTone(timeoutRemaining);

  useEffect(() => {
    if (!live.match) return;
    if (live.match.status !== 'starting') return;
    if (startCountdown === null || startCountdown > 0) return;
    void mpTickMatchStart(live.match.id);
  }, [live.match, startCountdown]);

  useEffect(() => {
    if (live.match?.status !== 'in_progress') {
      lastTimeoutTickRef.current = null;
      return;
    }
    if (timeoutRemaining == null || timeoutRemaining <= 0 || timeoutRemaining > 10) {
      lastTimeoutTickRef.current = timeoutRemaining;
      return;
    }
    if (lastTimeoutTickRef.current === timeoutRemaining) return;
    lastTimeoutTickRef.current = timeoutRemaining;
    void playCountdownTick();
  }, [live.match?.status, timeoutRemaining]);

  if (!live.isActive || !live.match) return null;

  const status = live.match.status;
  const label = gameLabel(gameId);
  const hasWinner = Boolean(live.match.winner_id);
  const showResultsOverlay = status === 'completed' && dismissedMatchId !== live.match.id;

  return (
    <>
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
            {hasPendingPlayers && timeoutRemaining !== null && (
              <motion.div
                className={`mb-3 overflow-hidden rounded-2xl bg-black/25 p-3 ring-1 ${timeoutUi.ring} shadow-lg ${timeoutUi.glow}`}
                animate={timeoutUi.pulse ? { scale: [1, 1.015, 1], opacity: [1, 0.96, 1] } : { scale: 1, opacity: 1 }}
                transition={timeoutUi.pulse ? { duration: 0.9, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
              >
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-text-muted">{timeoutUi.label}</p>
                    <p className="text-xs text-text-muted">Bli klar innan timern går ut för att få ett registrerat resultat.</p>
                  </div>
                  <motion.div
                    key={timeoutRemaining}
                    className={`rounded-xl bg-white/5 px-3 py-2 text-right ring-1 ring-white/10 ${timeoutUi.text}`}
                    initial={{ scale: 1.08, opacity: 0.7 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.2 }}
                  >
                    <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-text-muted">Tid kvar</p>
                    <p className="text-2xl font-extrabold tabular-nums">{formatRemaining(timeoutRemaining)}</p>
                  </motion.div>
                </div>

                <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
                  <motion.div
                    className={`h-full rounded-full bg-gradient-to-r ${timeoutUi.bar}`}
                    animate={{ width: `${timeoutProgress * 100}%` }}
                    transition={{ duration: 0.35, ease: 'easeOut' }}
                  />
                </div>
              </motion.div>
            )}

            <p className="mb-2 text-xs text-text-muted">
              {live.me?.submitted
                ? `Du är klar. Väntar på andra (${live.submittedCount}/${live.acceptedPlayers.length}).`
                : `Match pågår live (${live.submittedCount}/${live.acceptedPlayers.length} klara).`}
            </p>
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
                    {player.forfeited ? 'Gav upp / AFK' : player.submitted ? 'Klar' : 'Spelar…'}
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
              {showResultsOverlay
                ? 'Scoreboarden visas för alla spelare nu.'
                : `Vinnare: ${live.winner ? `${live.winner.username}#${live.winner.tag}` : 'ingen'}`}
            </p>
          </div>
        )}

        {live.loading && <p className="mt-2 text-[11px] text-text-muted">Uppdaterar…</p>}
      </div>

      {showResultsOverlay && (
        <ResultsOverlay
          gameId={gameId}
          label={label}
          match={live.match}
          rows={resultRows}
          myUserId={live.me?.user_id ?? null}
          onReplay={() => {
            clearActiveMatch(gameId);
            setDismissedMatchId(live.match?.id ?? null);
            window.location.assign(location.pathname);
          }}
          onClose={() => {
            clearActiveMatch(gameId);
            setDismissedMatchId(live.match?.id ?? null);
          }}
        />
      )}
    </>
  );
}
