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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowLeft, Users, Search, Clock, X, Check } from 'lucide-react';
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
import { mpForfeitMatch, mpCancelMatch, mpDeclineInvite, mpForceCleanupActiveMatches } from './api';
import MatchFoundOverlay from './MatchFoundOverlay';
import type { MatchPlayer } from './MatchFoundOverlay';
import type { MatchConfig } from './types';
import { isUserOnline, lastSeenLabel } from '../core/onlineStatus';
import { displaySkin } from '../core/skin';

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
  /** True when the current match came from random matchmaking (auto-start, no overlay) */
  const [isMatchmade, setIsMatchmade] = useState(false);

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
        setIsMatchmade(false);
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
      // Find the match in the lobby data and decide the phase
      const entry = mp.matches.find((m) => m.match.id === existing.matchId);

      // Match not found in lobby data yet — wait for it to load
      if (!entry) return;

      const status = entry.match.status;
      const mePlayer = entry.players.find((p) => p.player.user_id === user?.id);
      const iForfeited = mePlayer?.player.forfeited === true;

      // Stale match: completed, cancelled, or I forfeited — clear and go to staging
      if (status === 'completed' || status === 'cancelled' || iForfeited) {
        clearActiveMatch(gameId);
        setActiveMatchId(null);
        setPhase('staging');
        return;
      }

      setActiveMatchId(existing.matchId);
      // Restore matchmade flag from persisted payload
      if (existing.matchmade) setIsMatchmade(true);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, mp.matches.length]);

  /* ── Watch match status in waiting phase ── */
  const activeEntry = useMemo(
    () => mp.matches.find((m) => m.match.id === activeMatchId),
    [mp.matches, activeMatchId],
  );

  // Stable refs to avoid re-running the countdown effect on every realtime reload
  const mpRef = useRef(mp);
  useEffect(() => { mpRef.current = mp; }, [mp]);
  const onStartRef = useRef(onStart);
  useEffect(() => { onStartRef.current = onStart; }, [onStart]);

  // Derived stable values for the effect
  const activeMatchStatus = activeEntry?.match.status;
  const activeMatchStartedAt = activeEntry?.match.started_at;
  const activeMatchMatchId = activeEntry?.match.id;
  const activeMatchConfigSeed = activeEntry?.match.config_seed;
  const activeMatchConfig = activeEntry?.match.config;
  const meForfeited = activeEntry?.players.find((p) => p.player.user_id === user?.id)?.player.forfeited === true;

  useEffect(() => {
    if (!activeMatchStatus || !activeMatchMatchId) return;

    // Match ended or I forfeited — clean up and go back to staging
    if (activeMatchStatus === 'completed' || activeMatchStatus === 'cancelled' || meForfeited) {
      clearActiveMatch(gameId);
      setActiveMatchId(null);
      setIsMatchmade(false);
      setPhase('staging');
      return;
    }

    if (activeMatchStatus === 'starting') {
      // Start the countdown
      const startedAt = activeMatchStartedAt
        ? new Date(activeMatchStartedAt).getTime()
        : null;

      if (startedAt) {
        let tickSent = false;
        const tick = () => {
          const remaining = Math.max(0, Math.ceil((startedAt - Date.now()) / 1000));
          setCountdownValue(remaining);
          if (remaining <= 0 && !tickSent) {
            tickSent = true;
            // Tick the match to in_progress — only once!
            void mpRef.current.tickMatchStart(activeMatchMatchId);
          }
        };
        tick();
        const timer = window.setInterval(tick, 500);
        setPhase('countdown');
        return () => window.clearInterval(timer);
      }
    }

    if (activeMatchStatus === 'in_progress') {
      setPhase('playing');
      onStartRef.current({
        multiplayer: true,
        difficulty,
        seed: activeMatchConfigSeed ?? undefined,
        config: (activeMatchConfig as Record<string, unknown> | null) ?? undefined,
        matchId: activeMatchMatchId,
      });
    }
  }, [activeMatchStatus, activeMatchStartedAt, activeMatchMatchId, activeMatchConfigSeed, activeMatchConfig, meForfeited, difficulty, gameId]);

  /* ── Flash message ── */
  const flash = useCallback((msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3000);
  }, []);

  /* ── Matchmaking: when matched, auto-accept & skip overlay ── */
  useEffect(() => {
    if (mm.status !== 'matched' || !mm.matchId) return;
    const matchId = mm.matchId;

    setActiveMatchPayload(gameId, {
      matchId,
      setAt: new Date().toISOString(),
      configSeed: mm.configSeed ?? undefined,
      config: { difficulty },
      matchmade: true,
    });
    setActiveMatchId(matchId);
    setIsMatchmade(true);

    // Both players already opted in by queuing — matchmake_join sets them as
    // accepted on the server. We just need to refresh lobby data so
    // activeEntry appears and the auto-start effect can fire.
    void mp.refresh();
    setPhase('waiting');
  }, [mm.status, mm.matchId, mm.configSeed, difficulty, gameId, mp]);

  /* ── Overlay: derive MatchPlayer[] from activeEntry ── */
  const overlayPlayers = useMemo<MatchPlayer[]>(() => {
    if (!activeEntry) return [];
    return activeEntry.players.map(({ player, profile }) => ({
      id: profile?.id ?? player.user_id,
      username: profile?.username ?? 'Spelare',
      tag: profile?.tag ?? '????',
      skin: displaySkin(profile?.skin),
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
    setIsMatchmade(false);
    setPhase('staging');
  }, [activeMatchId, gameId, mp]);

  /* ── Auto-start when all players accept ── */
  useEffect(() => {
    if (!activeEntry) return;
    // For match-found overlay (friend invite): host starts when all accept
    if (phase === 'match-found') {
      const allAccepted = activeEntry.players.every((p) => p.player.status === 'accepted');
      if (allAccepted && activeEntry.match.host_id === user?.id) {
        void mp.startMatch(activeEntry.match.id, 5);
      }
    }
    // For matchmade (random queue): auto-start as soon as all accepted, shorter countdown
    if (phase === 'waiting' && isMatchmade && activeEntry.match.status === 'waiting') {
      const allAccepted = activeEntry.players.every((p) => p.player.status === 'accepted');
      if (allAccepted && activeEntry.match.host_id === user?.id) {
        void mp.startMatch(activeEntry.match.id, 3);
      }
    }
  }, [phase, activeEntry, user?.id, mp, isMatchmade]);

  /* ── Matchmaking: join queue handler ── */
  const handleJoinQueue = useCallback(async () => {
    // Nuclear cleanup: find ALL active matches in the DB for this user
    // and force-clean them (tries RPCs, falls back to direct table updates).
    // This handles the edge case where a matchmade match is stuck in
    // 'waiting' with both players 'accepted' and no RPC can un-stuck it.
    const cleaned = await mpForceCleanupActiveMatches();
    if (cleaned > 0) {
      // Also clear all game localStorage entries
      for (const g of games) clearActiveMatch(g.id);
      await mp.refresh();
    }

    await mm.join(difficulty);
  }, [mm, difficulty, mp, user?.id]);

  /* ── Matchmaking: leave queue handler ── */
  const handleLeaveQueue = useCallback(async () => {
    await mm.leave();
    setPhase('staging');
  }, [mm]);

  /* ── Sync phase back to staging if queue join fails ── */
  useEffect(() => {
    if (phase === 'queuing' && mm.status === 'idle' && mm.error) {
      // Queue join failed (e.g. server rejected) — go back to staging after a brief delay
      const timer = setTimeout(() => setPhase('staging'), 3000);
      return () => clearTimeout(timer);
    }
  }, [phase, mm.status, mm.error]);

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

  /* ── Refs for auto-forfeit (need current values in event listeners) ── */
  const activeMatchIdRef = useRef(activeMatchId);
  const isMatchmadeRef = useRef(isMatchmade);
  const phaseRef = useRef(phase);
  useEffect(() => { activeMatchIdRef.current = activeMatchId; }, [activeMatchId]);
  useEffect(() => { isMatchmadeRef.current = isMatchmade; }, [isMatchmade]);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  /**
   * Leave / forfeit + clean, called from event handlers.
   * Tries the right API per phase, with fallbacks:
   *  - waiting → cancel → decline → forfeit
   *  - starting/playing → forfeit
   */
  const forfeitNow = useCallback(() => {
    const matchId = activeMatchIdRef.current;
    if (!matchId) return;
    const p = phaseRef.current;
    if (p !== 'waiting' && p !== 'countdown' && p !== 'playing') return;

    if (p === 'waiting') {
      // Try all three in order until one succeeds
      void (async () => {
        const e1 = await mpCancelMatch(matchId);
        if (e1) {
          const e2 = await mpDeclineInvite(matchId);
          if (e2) await mpForfeitMatch(matchId);
        }
      })();
    } else {
      void mpForfeitMatch(matchId);
    }
    clearActiveMatch(gameId);
  }, [gameId]);

  /* ── Auto-forfeit on component unmount (navigation away) ── */
  useEffect(() => {
    return () => {
      const matchId = activeMatchIdRef.current;
      const p = phaseRef.current;
      if (!matchId) return;
      if (p !== 'waiting' && p !== 'countdown' && p !== 'playing') return;

      // Try all three APIs in order — one should work regardless of match state
      if (p === 'waiting') {
        void (async () => {
          const e1 = await mpCancelMatch(matchId);
          if (e1) {
            const e2 = await mpDeclineInvite(matchId);
            if (e2) await mpForfeitMatch(matchId);
          }
        })();
      } else {
        void mpForfeitMatch(matchId);
      }
      clearActiveMatch(gameId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  /* ── Auto-forfeit on tab close / refresh (beforeunload) ── */
  useEffect(() => {
    const onBeforeUnload = () => {
      forfeitNow();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [forfeitNow]);

  /* ── Auto-forfeit on tab hidden (mobile tab switch / app minimize) ──
   *  Random matches: forfeit after 5s hidden
   *  Friend matches: forfeit after 30s hidden (more forgiving)
   */
  useEffect(() => {
    let hiddenTimer: ReturnType<typeof setTimeout> | null = null;

    const onVisibility = () => {
      if (document.hidden) {
        const delay = isMatchmadeRef.current ? 5_000 : 30_000;
        hiddenTimer = setTimeout(() => {
          forfeitNow();
        }, delay);
      } else {
        if (hiddenTimer) { clearTimeout(hiddenTimer); hiddenTimer = null; }
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (hiddenTimer) clearTimeout(hiddenTimer);
    };
  }, [forfeitNow]);

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
                <span className="text-2xl">{displaySkin(profile?.skin)}</span>
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
      <Link to="/" className="flex items-center gap-1 self-start text-sm text-text-muted hover:text-brand-light">
        <ArrowLeft className="h-3.5 w-3.5" /> Tillbaka
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
          <motion.button
            onClick={handleSoloStart}
            className="group relative w-full overflow-hidden rounded-2xl px-8 py-4 text-xl font-bold text-white shadow-xl"
            style={{ background: 'linear-gradient(135deg, #6366f1 0%, #818cf8 50%, #6366f1 100%)' }}
            whileHover={{ scale: 1.03, boxShadow: '0 0 32px rgba(99,102,241,0.5)' }}
            whileTap={{ scale: 0.96 }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 18 }}
          >
            {/* Shimmer sweep */}
            <motion.div
              className="pointer-events-none absolute inset-0"
              style={{
                background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.18) 50%, transparent 60%)',
              }}
              animate={{ x: ['-100%', '200%'] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut', repeatDelay: 1.5 }}
            />
            {/* Ambient glow pulse */}
            <motion.div
              className="pointer-events-none absolute -inset-1 rounded-2xl"
              style={{ background: 'radial-gradient(circle at 50% 50%, rgba(129,140,248,0.3) 0%, transparent 70%)' }}
              animate={{ opacity: [0.4, 0.8, 0.4] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            />
            {/* Floating micro-particles */}
            {[0, 1, 2, 3, 4].map((i) => (
              <motion.span
                key={i}
                className="pointer-events-none absolute rounded-full"
                style={{
                  width: 3 + (i % 3),
                  height: 3 + (i % 3),
                  background: ['#c7d2fe', '#a5b4fc', '#e0e7ff', '#38bdf8', '#818cf8'][i],
                  left: `${15 + i * 17}%`,
                  bottom: '20%',
                }}
                animate={{ y: [0, -18 - i * 4, 0], opacity: [0, 0.9, 0] }}
                transition={{ duration: 2 + i * 0.3, repeat: Infinity, delay: i * 0.5, ease: 'easeInOut' }}
              />
            ))}
            <span className="relative z-10">Starta</span>
          </motion.button>

          {user && (
            <button
              onClick={() => setPhase('inviting')}
              className="flex items-center gap-1.5 text-sm text-text-muted underline underline-offset-4 hover:text-brand-light transition"
            >
              <Users className="h-3.5 w-3.5" /> Bjud in vän och spela multiplayer
            </button>
          )}

          {/* Quick matchmaking button */}
          {user && (
            <button
              onClick={() => {
                setPhase('queuing');
                void handleJoinQueue();
              }}
              className="flex items-center gap-1.5 text-sm text-text-muted underline underline-offset-4 hover:text-accent transition"
            >
              <Search className="h-3.5 w-3.5" /> Sök random match
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
                    <span>{displaySkin(f.skin)}</span>
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
              {/* Animated search visualization */}
              <div className="relative flex h-28 w-28 items-center justify-center">
                {/* Outer pulsing ring */}
                <motion.div
                  className="absolute inset-0 rounded-full border-2 border-brand/30"
                  animate={{ scale: [1, 1.35, 1], opacity: [0.5, 0, 0.5] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                />
                {/* Second pulsing ring (delayed) */}
                <motion.div
                  className="absolute inset-0 rounded-full border-2 border-accent/25"
                  animate={{ scale: [1, 1.25, 1], opacity: [0.4, 0, 0.4] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut', delay: 0.8 }}
                />

                {/* Spinning dashed ring */}
                <motion.div
                  className="absolute inset-2 rounded-full"
                  style={{ border: '2px dashed rgba(99,102,241,0.35)' }}
                  animate={{ rotate: 360 }}
                  transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
                />

                {/* Counter-spinning dotted ring */}
                <motion.div
                  className="absolute inset-5 rounded-full"
                  style={{ border: '1.5px dotted rgba(56,189,248,0.3)' }}
                  animate={{ rotate: -360 }}
                  transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
                />

                {/* Orbiting dots */}
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <motion.div
                    key={i}
                    className="absolute"
                    style={{ width: 112, height: 112 }}
                    animate={{ rotate: 360 }}
                    transition={{
                      duration: 3 + i * 0.4,
                      repeat: Infinity,
                      ease: 'linear',
                      delay: i * 0.3,
                    }}
                  >
                    <motion.div
                      className="absolute rounded-full"
                      style={{
                        width: i % 2 === 0 ? 6 : 4,
                        height: i % 2 === 0 ? 6 : 4,
                        top: 0,
                        left: '50%',
                        marginLeft: i % 2 === 0 ? -3 : -2,
                        background: ['#6366f1', '#38bdf8', '#818cf8', '#22c55e', '#f59e0b', '#a78bfa'][i],
                      }}
                      animate={{ opacity: [0.4, 1, 0.4], scale: [0.8, 1.3, 0.8] }}
                      transition={{ duration: 1.5 + i * 0.2, repeat: Infinity, ease: 'easeInOut' }}
                    />
                  </motion.div>
                ))}

                {/* Center glow */}
                <motion.div
                  className="absolute h-10 w-10 rounded-full"
                  style={{
                    background: 'radial-gradient(circle, rgba(99,102,241,0.25) 0%, transparent 70%)',
                  }}
                  animate={{ scale: [1, 1.4, 1], opacity: [0.6, 1, 0.6] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                />

                {/* Center bouncing dots */}
                <div className="relative z-10 flex items-center gap-1.5">
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      className="h-2.5 w-2.5 rounded-full bg-brand-light"
                      animate={{ y: [0, -8, 0], opacity: [0.5, 1, 0.5] }}
                      transition={{
                        duration: 0.8,
                        repeat: Infinity,
                        ease: 'easeInOut',
                        delay: i * 0.2,
                      }}
                    />
                  ))}
                </div>
              </div>

              <p className="text-sm font-semibold text-brand-light">
                Söker motståndare…
              </p>

              {/* Queue info */}
              <div className="flex items-center gap-4 text-xs text-text-muted">
                <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {mm.elapsed}s</span>
                {mm.queueSize > 0 && (
                  <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {mm.queueSize} i kön</span>
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
                className="flex items-center justify-center gap-1.5 w-full rounded-xl bg-red-500/20 px-4 py-3 text-sm font-semibold text-red-300 transition hover:bg-red-500/35 active:scale-95"
              >
                <X className="h-3.5 w-3.5" /> Avbryt sökning
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── WAITING phase: waiting for players ── */}
      {phase === 'waiting' && activeEntry && (
        <div className="w-full max-w-sm">
          <div className="rounded-xl bg-surface-card p-5 ring-1 ring-white/10">
            <p className="mb-3 flex items-center justify-center gap-1.5 text-sm font-semibold text-brand-light">
              <Clock className="h-4 w-4" /> Väntar på spelare…
            </p>

            {/* Player slots */}
            <div className="space-y-2">
              {activeEntry.players.map(({ player, profile }) => (
                <div
                  key={player.id}
                  className="flex items-center justify-between rounded-lg bg-black/20 px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{displaySkin(profile?.skin)}</span>
                    <span className="text-sm">
                      {profile?.username ?? 'Spelare'}
                      <span className="text-text-muted">#{profile?.tag ?? '????'}</span>
                    </span>
                    <LevelBadge level={profile?.level} />
                  </div>
                  <span
                    className={`flex items-center gap-0.5 text-xs font-semibold ${
                      player.status === 'accepted'
                        ? 'text-green-300'
                        : player.status === 'declined'
                          ? 'text-red-300'
                          : 'text-yellow-300'
                    }`}
                  >
                    {player.status === 'accepted'
                      ? <><Check className="h-3 w-3" /> Redo</>
                      : player.status === 'declined'
                        ? <><X className="h-3 w-3" /> Nekade</>
                        : <><Clock className="h-3 w-3" /> Väntar</>}
                  </span>
                </div>
              ))}
            </div>

            {/* Host controls */}
            {activeEntry.match.host_id === user?.id && (
              <div className="mt-4 flex gap-2">
                <motion.button
                  onClick={handleMultiplayerStart}
                  disabled={!activeEntry.players.every((p) => p.player.status === 'accepted')}
                  className="relative flex-1 overflow-hidden rounded-xl px-4 py-3 text-sm font-bold text-white shadow disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #6366f1 0%, #818cf8 50%, #6366f1 100%)' }}
                  whileHover={{ scale: 1.04, boxShadow: '0 0 24px rgba(99,102,241,0.45)' }}
                  whileTap={{ scale: 0.95 }}
                >
                  {/* Shimmer */}
                  <motion.div
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.15) 50%, transparent 60%)',
                    }}
                    animate={{ x: ['-100%', '200%'] }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut', repeatDelay: 2 }}
                  />
                  <span className="relative z-10">Starta match</span>
                </motion.button>
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
