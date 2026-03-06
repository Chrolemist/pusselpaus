/* ── StagingScreen – unified pre-game lobby ──
 *
 *  Every game page wraps its content with this component.
 *  Flow:
 *    1. Player enters the game page → sees StagingScreen
 *    2. Big "Starta!" button → solo start (no DB match)
 *    3. "Bjud in vän" → opens friend picker → creates DB match
 *    4. Friends join live (Realtime) → avatars appear
 *    5. Host clicks "Starta!" → synced countdown → game reveals
 *
 *  Usage:
 *    <StagingScreen gameId="sudoku" onStart={({ seed, config, multiplayer }) => { ... }}>
 *      <ActualGameContent />
 *    </StagingScreen>
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { useAuth } from '../auth';
import { useFriends } from '../hooks/useFriends';
import { games } from '../game-registry';
import LevelBadge from '../components/LevelBadge';
import {
  useMultiplayer,
  gameLabel,
} from './useMultiplayer';
import { useMatchmaking } from './useMatchmaking';
import { setActiveMatchPayload, clearActiveMatch, getActiveMatchPayload } from './activeMatch';
import MatchFoundOverlay from './MatchFoundOverlay';
import type { MatchPlayer } from './MatchFoundOverlay';
import type { MatchConfig } from './types';
import { isUserOnline, lastSeenLabel } from '../core/onlineStatus';

/* ── Types ── */

export interface StagingResult {
  /** True if this is a multiplayer match */
  multiplayer: boolean;
  /** Difficulty value chosen */
  difficulty: string;
  /** Seed for deterministic puzzle generation (multiplayer) */
  seed?: number;
  /** Full match config (multiplayer) */
  config?: Record<string, unknown>;
  /** Match ID (multiplayer) */
  matchId?: string;
}

interface StagingScreenProps {
  gameId: string;
  /** Called when the game should actually start. */
  onStart: (result: StagingResult) => void;
  /** Default difficulty to pre-select */
  defaultDifficulty?: string;
  /** If the game has a saved/resumed state, skip staging */
  hasSavedGame?: boolean;
  /** Called when user wants to resume a saved game */
  onResume?: () => void;
  /** Ref that will be populated with a function to reset back to staging */
  resetRef?: React.RefObject<(() => void) | null>;
  children: React.ReactNode;
}

/* ── Component ── */

export default function StagingScreen({
  gameId,
  onStart,
  defaultDifficulty,
  hasSavedGame,
  onResume,
  resetRef,
  children,
}: StagingScreenProps) {
  const { user } = useAuth();
  const { friends } = useFriends();
  const mp = useMultiplayer();
  const mm = useMatchmaking(gameId);

  const gameDef = useMemo(() => games.find((g) => g.id === gameId), [gameId]);
  const label = gameLabel(gameId);
  const difficulties = gameDef?.multiplayer?.difficulties ?? [];

  /* ── State machine: 'staging' → 'inviting' → 'waiting' → 'countdown' → 'playing' ── */
  /*                   'staging' → 'queuing' → 'match-found' → 'waiting' → ...           */
  type Phase = 'staging' | 'inviting' | 'waiting' | 'countdown' | 'playing' | 'queuing' | 'match-found';
  const [phase, setPhase] = useState<Phase>('staging');
  const [difficulty, setDifficulty] = useState(
    defaultDifficulty ?? difficulties[0]?.value ?? 'medium',
  );
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [countdownValue, setCountdownValue] = useState(5);
  const [message, setMessage] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  /** True when the match-found overlay was triggered by a friend invite (no countdown timer) */
  const [isInviteOverlay, setIsInviteOverlay] = useState(false);

  const acceptedFriends = useMemo(
    () => friends.filter((f) => f.status === 'accepted').map((f) => f.friend),
    [friends],
  );

  /* ── Expose reset function to children via ref ── */
  useEffect(() => {
    if (resetRef) {
      (resetRef as React.MutableRefObject<(() => void) | null>).current = () => {
        setPhase('staging');
        setActiveMatchId(null);
        setIsInviteOverlay(false);
        setSelectedFriends([]);
        setMessage(null);
        // Also leave matchmaking queue if active
        if (mm.status === 'queuing') void mm.leave();
      };
    }
  }, [resetRef, mm]);

  /* ── Check if we already have an active match (e.g. page refresh) ── */
  useEffect(() => {
    const existing = getActiveMatchPayload(gameId);
    if (existing?.matchId) {
      setActiveMatchId(existing.matchId);
      // Find the match in the lobby data and decide the phase
      const entry = mp.matches.find((m) => m.match.id === existing.matchId);
      if (entry) {
        const status = entry.match.status;

        // Show match-found overlay if flagged (friend invite just accepted)
        if (existing.showOverlay && status === 'waiting') {
          setIsInviteOverlay(true);
          setPhase('match-found');
          // Clear the flag so a page refresh goes to normal waiting
          setActiveMatchPayload(gameId, { ...existing, showOverlay: undefined });
          return;
        }

        if (status === 'waiting' || status === 'starting') {
          setPhase('waiting');
        } else if (status === 'in_progress') {
          // Already in progress — go straight to game
          setPhase('playing');
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, mp.matches.length]);

  /* ── Watch match status in waiting phase ── */
  const activeEntry = useMemo(
    () => mp.matches.find((m) => m.match.id === activeMatchId),
    [mp.matches, activeMatchId],
  );

  useEffect(() => {
    if (!activeEntry) return;

    const status = activeEntry.match.status;

    if (status === 'starting') {
      // Start the countdown
      const startedAt = activeEntry.match.started_at
        ? new Date(activeEntry.match.started_at).getTime()
        : null;

      if (startedAt) {
        const tick = () => {
          const remaining = Math.max(0, Math.ceil((startedAt - Date.now()) / 1000));
          setCountdownValue(remaining);
          if (remaining <= 0) {
            // Tick the match to in_progress
            void mp.tickMatchStart(activeEntry.match.id);
          }
        };
        tick();
        const timer = window.setInterval(tick, 500);
        setPhase('countdown');
        return () => window.clearInterval(timer);
      }
    }

    if (status === 'in_progress') {
      setPhase('playing');
      onStart({
        multiplayer: true,
        difficulty,
        seed: activeEntry.match.config_seed ?? undefined,
        config: (activeEntry.match.config as Record<string, unknown> | null) ?? undefined,
        matchId: activeEntry.match.id,
      });
    }
  }, [activeEntry?.match.status, activeEntry?.match.started_at, activeEntry, difficulty, mp, onStart]);

  /* ── Flash message ── */
  const flash = useCallback((msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3000);
  }, []);

  /* ── Matchmaking: when matched, show match-found overlay ── */
  useEffect(() => {
    if (mm.status !== 'matched' || !mm.matchId) return;
    const matchId = mm.matchId;

    setActiveMatchPayload(gameId, {
      matchId,
      setAt: new Date().toISOString(),
      configSeed: mm.configSeed ?? undefined,
      config: { difficulty },
    });
    setActiveMatchId(matchId);
    setPhase('match-found');

    // Refresh mp data so the match appears in the list
    void mp.refresh();
  }, [mm.status, mm.matchId, mm.configSeed, difficulty, gameId, mp]);

  /* ── Overlay: derive MatchPlayer[] from activeEntry ── */
  const overlayPlayers = useMemo<MatchPlayer[]>(() => {
    if (!activeEntry) return [];
    return activeEntry.players.map(({ player, profile }) => ({
      id: profile?.id ?? player.user_id,
      username: profile?.username ?? 'Spelare',
      tag: profile?.tag ?? '????',
      skin: profile?.skin ?? '🙂',
      level: profile?.level ?? null,
      accepted: player.status === 'accepted',
    }));
  }, [activeEntry]);

  /* ── Overlay: accept handler ── */
  const handleOverlayAccept = useCallback(async () => {
    if (!activeMatchId) return;
    await mp.acceptInvite(activeMatchId);
  }, [activeMatchId, mp]);

  /* ── Overlay: decline handler ── */
  const handleOverlayDecline = useCallback(async () => {
    if (activeMatchId) {
      await mp.declineInvite(activeMatchId);
    }
    clearActiveMatch(gameId);
    setActiveMatchId(null);
    setIsInviteOverlay(false);
    setPhase('staging');
  }, [activeMatchId, gameId, mp]);

  /* ── Auto-start when all players accept (matchmaking) ── */
  useEffect(() => {
    if (phase !== 'match-found' || !activeEntry) return;
    const allAccepted = activeEntry.players.every((p) => p.player.status === 'accepted');
    if (allAccepted && activeEntry.match.host_id === user?.id) {
      void mp.startMatch(activeEntry.match.id, 5);
    }
  }, [phase, activeEntry, user?.id, mp]);

  /* ── Matchmaking: join queue handler ── */
  const handleJoinQueue = useCallback(async () => {
    await mm.join(difficulty);
  }, [mm, difficulty]);

  /* ── Matchmaking: leave queue handler ── */
  const handleLeaveQueue = useCallback(async () => {
    await mm.leave();
    setPhase('staging');
  }, [mm]);

  /* ── Solo start ── */
  const handleSoloStart = useCallback(() => {
    clearActiveMatch(gameId);
    onStart({
      multiplayer: false,
      difficulty,
    });
    setPhase('playing');
  }, [gameId, difficulty, onStart]);

  /* ── Create multiplayer match ── */
  const handleCreateMatch = useCallback(async () => {
    if (isCreating || selectedFriends.length === 0) return;
    setIsCreating(true);

    const config: MatchConfig = { difficulty };
    const configSeed = Math.floor(Math.random() * 2_000_000_000);

    const err = await mp.createMatch(gameId, 0, selectedFriends, {
      config,
      configSeed,
    });

    if (err) {
      flash(err);
      setIsCreating(false);
      return;
    }

    // Find the newly created match
    await mp.refresh();
    setIsCreating(false);
    setPhase('waiting');
  }, [isCreating, selectedFriends, difficulty, gameId, mp, flash]);

  /* ── After match is created, find it and store in localStorage ── */
  useEffect(() => {
    if (phase !== 'waiting' || activeMatchId) return;

    // Find a match I'm hosting in waiting state for this game
    const myMatch = mp.matches.find(
      (m) =>
        m.match.game_id === gameId &&
        m.match.host_id === user?.id &&
        m.match.status === 'waiting',
    );

    if (myMatch) {
      setActiveMatchId(myMatch.match.id);
      setActiveMatchPayload(gameId, {
        matchId: myMatch.match.id,
        setAt: new Date().toISOString(),
        config: (myMatch.match.config as Record<string, unknown> | null) ?? undefined,
        configSeed: myMatch.match.config_seed ?? undefined,
      });
    }
  }, [phase, activeMatchId, mp.matches, gameId, user?.id]);

  /* ── Start the multiplayer match (host only) ── */
  const handleMultiplayerStart = useCallback(async () => {
    if (!activeMatchId) return;
    const err = await mp.startMatch(activeMatchId, 5);
    if (err) flash(err);
  }, [activeMatchId, mp, flash]);

  /* ── Cancel match ── */
  const handleCancelMatch = useCallback(async () => {
    if (!activeMatchId) return;
    if (!window.confirm('Avbryta matchen?')) return;
    await mp.cancelMatch(activeMatchId);
    clearActiveMatch(gameId);
    setActiveMatchId(null);
    setPhase('staging');
  }, [activeMatchId, mp, gameId]);

  /* ── Toggle friend selection ── */
  const toggleFriend = (id: string) =>
    setSelectedFriends((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  /* ── If phase is 'playing', render the actual game ── */
  if (phase === 'playing') {
    return <>{children}</>;
  }

  /* ── Countdown overlay ── */
  if (phase === 'countdown') {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4">
        <p className="text-sm uppercase tracking-widest text-text-muted">
          {label}
        </p>
        <motion.p
          key={countdownValue}
          className="text-8xl font-extrabold text-brand-light"
          initial={{ scale: 2, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.5, opacity: 0 }}
          transition={{ duration: 0.35 }}
        >
          {countdownValue > 0 ? countdownValue : 'KÖR!'}
        </motion.p>
        <p className="text-xs text-text-muted">Alla spelare startar samtidigt</p>

        {activeEntry && (
          <div className="mt-4 flex gap-3">
            {activeEntry.players.map(({ player, profile }) => (
              <div key={player.id} className="flex flex-col items-center gap-1">
                <span className="text-2xl">{profile?.skin ?? '🙂'}</span>
                <span className="text-[11px] text-text-muted">
                  {profile?.username ?? 'Spelare'}
                </span>
                <LevelBadge level={profile?.level} />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  /* ── Match-found overlay (matchmaking ready-up) ── */
  if (phase === 'match-found') {
    return (
      <MatchFoundOverlay
        visible
        players={overlayPlayers}
        timeLimit={15}
        myId={user?.id ?? ''}
        onAccept={handleOverlayAccept}
        onDecline={handleOverlayDecline}
        noTimeout={isInviteOverlay}
      />
    );
  }

  /* ── Staging / Inviting / Waiting ── */
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-10">
      <Link to="/" className="self-start text-sm text-text-muted hover:text-brand-light">
        ← Tillbaka
      </Link>

      <div className="text-center">
        <p className="text-4xl">{gameDef?.emoji ?? '🎮'}</p>
        <h2 className="mt-2 text-3xl font-bold">{label}</h2>
        <p className="mt-1 text-sm text-text-muted">{gameDef?.description}</p>
      </div>

      {message && (
        <motion.p
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg bg-brand/20 px-3 py-2 text-xs text-brand-light"
        >
          {message}
        </motion.p>
      )}

      {/* Difficulty picker */}
      {difficulties.length > 1 && phase === 'staging' && (
        <div className="flex gap-2">
          {difficulties.map((d) => (
            <button
              key={d.value}
              onClick={() => setDifficulty(d.value)}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                difficulty === d.value
                  ? 'bg-brand text-white shadow-lg'
                  : 'bg-surface-card text-text-muted ring-1 ring-white/10 hover:ring-brand/40'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      )}

      {/* ── STAGING phase ── */}
      {phase === 'staging' && (
        <div className="flex w-full max-w-sm flex-col items-center gap-4">
          {/* Resume saved game */}
          {hasSavedGame && onResume && (
            <button
              onClick={() => {
                onResume();
                setPhase('playing');
              }}
              className="w-full rounded-xl bg-surface-card px-6 py-3 text-lg font-semibold shadow ring-1 ring-white/10 transition active:scale-[0.97] hover:ring-brand/60"
            >
              ▶️ Fortsätt sparad
            </button>
          )}

          {/* Big start button */}
          <button
            onClick={handleSoloStart}
            className="w-full rounded-2xl bg-brand px-8 py-4 text-xl font-bold text-white shadow-xl transition active:scale-[0.97] hover:bg-brand-light"
          >
            Starta! 🚀
          </button>

          {/* Subtle invite button */}
          {user && (
            <button
              onClick={() => setPhase('inviting')}
              className="text-sm text-text-muted underline underline-offset-4 hover:text-brand-light transition"
            >
              👥 Bjud in vän och spela multiplayer
            </button>
          )}

          {/* Quick matchmaking button */}
          {user && (
            <button
              onClick={() => {
                setPhase('queuing');
                void handleJoinQueue();
              }}
              className="text-sm text-text-muted underline underline-offset-4 hover:text-accent transition"
            >
              🔍 Sök random match
            </button>
          )}
        </div>
      )}

      {/* ── INVITING phase: friend picker ── */}
      {phase === 'inviting' && (
        <div className="w-full max-w-sm">
          <h3 className="mb-2 text-sm font-bold uppercase text-text-muted">
            Välj vänner att bjuda in
          </h3>

          {/* Difficulty picker in invite phase too */}
          {difficulties.length > 1 && (
            <div className="mb-3 flex gap-2">
              {difficulties.map((d) => (
                <button
                  key={d.value}
                  onClick={() => setDifficulty(d.value)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    difficulty === d.value
                      ? 'bg-brand text-white'
                      : 'bg-surface-card text-text-muted ring-1 ring-white/10'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          )}

          <div className="max-h-48 space-y-2 overflow-y-auto rounded-xl bg-surface-card p-3 ring-1 ring-white/10">
            {acceptedFriends.length === 0 ? (
              <p className="py-2 text-center text-xs text-text-muted">
                Du har inga vänner ännu.{' '}
                <Link to="/friends-leaderboard" className="text-brand-light underline">
                  Lägg till vänner
                </Link>
              </p>
            ) : (
              acceptedFriends.map((f) => (
                <label
                  key={f.id}
                  className="flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 hover:bg-white/5"
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedFriends.includes(f.id)}
                      onChange={() => toggleFriend(f.id)}
                      className="accent-brand"
                    />
                    <span>{f.skin ?? '🙂'}</span>
                    <span className="text-sm">
                      {f.username}#{f.tag}
                    </span>
                    <LevelBadge level={f.level} />
                  </div>
                  <span className={`text-[11px] ${isUserOnline(f) ? 'text-green-300' : 'text-text-muted'}`}>
                    {isUserOnline(f) ? 'Online' : lastSeenLabel(f.last_seen) || 'Offline'}
                  </span>
                </label>
              ))
            )}
          </div>

          <div className="mt-3 flex gap-2">
            <button
              onClick={handleCreateMatch}
              disabled={selectedFriends.length === 0 || isCreating}
              className="flex-1 rounded-xl bg-brand px-4 py-3 text-sm font-bold text-white shadow transition active:scale-95 disabled:opacity-50"
            >
              {isCreating ? 'Skapar…' : `Bjud in (${selectedFriends.length})`}
            </button>
            <button
              onClick={() => setPhase('staging')}
              className="rounded-xl bg-surface-card px-4 py-3 text-sm font-semibold text-text-muted ring-1 ring-white/10 transition hover:ring-brand/40"
            >
              Avbryt
            </button>
          </div>
        </div>
      )}

      {/* ── QUEUING phase: searching for random match ── */}
      {phase === 'queuing' && (
        <div className="w-full max-w-sm">
          <div className="rounded-xl bg-surface-card p-6 ring-1 ring-white/10">
            <div className="flex flex-col items-center gap-4">
              {/* Animated search indicator */}
              <motion.div
                className="text-5xl"
                animate={{ rotate: [0, 360] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              >
                🔍
              </motion.div>

              <p className="text-sm font-semibold text-brand-light">
                Söker motståndare…
              </p>

              {/* Queue info */}
              <div className="flex items-center gap-4 text-xs text-text-muted">
                <span>⏱ {mm.elapsed}s</span>
                {mm.queueSize > 0 && (
                  <span>👥 {mm.queueSize} i kön</span>
                )}
              </div>

              {mm.error && (
                <p className="text-xs text-red-300">{mm.error}</p>
              )}

              <p className="text-center text-[11px] text-text-muted">
                Matchar dig automatiskt med 1–4 andra spelare.
                <br />
                Spelet startar så fort minst 2 spelare hittas.
              </p>

              <button
                onClick={handleLeaveQueue}
                className="w-full rounded-xl bg-red-500/20 px-4 py-3 text-sm font-semibold text-red-300 transition hover:bg-red-500/35 active:scale-95"
              >
                ✕ Avbryt sökning
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── WAITING phase: waiting for players ── */}
      {phase === 'waiting' && activeEntry && (
        <div className="w-full max-w-sm">
          <div className="rounded-xl bg-surface-card p-5 ring-1 ring-white/10">
            <p className="mb-3 text-center text-sm font-semibold text-brand-light">
              ⏳ Väntar på spelare…
            </p>

            {/* Player slots */}
            <div className="space-y-2">
              {activeEntry.players.map(({ player, profile }) => (
                <div
                  key={player.id}
                  className="flex items-center justify-between rounded-lg bg-black/20 px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{profile?.skin ?? '🙂'}</span>
                    <span className="text-sm">
                      {profile?.username ?? 'Spelare'}
                      <span className="text-text-muted">#{profile?.tag ?? '????'}</span>
                    </span>
                    <LevelBadge level={profile?.level} />
                  </div>
                  <span
                    className={`text-xs font-semibold ${
                      player.status === 'accepted'
                        ? 'text-green-300'
                        : player.status === 'declined'
                          ? 'text-red-300'
                          : 'text-yellow-300'
                    }`}
                  >
                    {player.status === 'accepted'
                      ? '✓ Redo'
                      : player.status === 'declined'
                        ? '✗ Nekade'
                        : '⏳ Väntar'}
                  </span>
                </div>
              ))}
            </div>

            {/* Host controls */}
            {activeEntry.match.host_id === user?.id && (
              <div className="mt-4 flex gap-2">
                <button
                  onClick={handleMultiplayerStart}
                  disabled={!activeEntry.players.every((p) => p.player.status === 'accepted')}
                  className="flex-1 rounded-xl bg-brand px-4 py-3 text-sm font-bold text-white shadow transition active:scale-95 disabled:opacity-50"
                >
                  Starta match! 🚀
                </button>
                <button
                  onClick={handleCancelMatch}
                  className="rounded-xl bg-red-500/20 px-4 py-3 text-sm font-semibold text-red-300 transition hover:bg-red-500/35"
                >
                  Avbryt
                </button>
              </div>
            )}

            {/* Non-host waiting message */}
            {activeEntry.match.host_id !== user?.id && (
              <p className="mt-3 text-center text-xs text-text-muted">
                Väntar på att hosten startar…
              </p>
            )}
          </div>
        </div>
      )}

      {/* Waiting but match not loaded yet */}
      {phase === 'waiting' && !activeEntry && (
        <p className="text-sm text-text-muted">Laddar match…</p>
      )}
    </div>
  );
}
