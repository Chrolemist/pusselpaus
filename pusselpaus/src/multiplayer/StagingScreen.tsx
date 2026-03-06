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
import { mpForceCleanupActiveMatches } from './api';
import MatchFoundOverlay from './MatchFoundOverlay';
import type { MatchPlayer } from './MatchFoundOverlay';
import type { MatchConfig } from './types';
import { isUserOnline, lastSeenLabel } from '../core/onlineStatus';
import { displaySkin } from '../core/skin';
import { mpDebug } from './debug';

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
  /** Local ready/accept click for the match-found overlay (used for matchmade flow UX) */
  const [matchFoundAcceptedLocal, setMatchFoundAcceptedLocal] = useState(false);

  useEffect(() => {
    mpDebug('StagingScreen', 'phase:changed', {
      gameId,
      phase,
      activeMatchId,
      isMatchmade,
      isInviteOverlay,
    });
  }, [gameId, phase, activeMatchId, isMatchmade, isInviteOverlay]);

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
        setMatchFoundAcceptedLocal(false);
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

      mpDebug('StagingScreen', 'restore:found_local_payload', {
        gameId,
        matchId: existing.matchId,
        showOverlay: existing.showOverlay === true,
        matchmade: existing.matchmade === true,
        entryFound: Boolean(entry),
      });

      // Match not found in lobby data yet — wait for it to load
      if (!entry) return;

      const status = entry.match.status;
      const mePlayer = entry.players.find((p) => p.player.user_id === user?.id);
      const iForfeited = mePlayer?.player.forfeited === true;

      // Stale match: completed, cancelled, or I forfeited — clear and go to staging
      if (status === 'completed' || status === 'cancelled' || iForfeited) {
        mpDebug('StagingScreen', 'restore:stale_match_cleanup', {
          gameId,
          matchId: existing.matchId,
          status,
          iForfeited,
        });
        clearActiveMatch(gameId);
        setActiveMatchId(null);
        setMatchFoundAcceptedLocal(false);
        setPhase('staging');
        return;
      }

      setActiveMatchId(existing.matchId);
      // Restore matchmade flag from persisted payload
      if (existing.matchmade) setIsMatchmade(true);

      // Show match-found overlay if flagged (friend invite just accepted)
      if (existing.showOverlay && status === 'waiting') {
        mpDebug('StagingScreen', 'restore:show_overlay', {
          gameId,
          matchId: existing.matchId,
          status,
        });
        setIsInviteOverlay(true);
        setMatchFoundAcceptedLocal(false);
        setPhase('match-found');
        // Clear the flag so a page refresh goes to normal waiting
        setActiveMatchPayload(gameId, { ...existing, showOverlay: undefined });
        return;
      }

      if (status === 'waiting') {
        mpDebug('StagingScreen', 'restore:set_waiting', { gameId, matchId: existing.matchId });
        setPhase('waiting');
      } else if (status === 'starting') {
        // Don't show waiting phase — let the countdown effect handle it
        // (avoids showing "Starta match" button for an already-started match)
        mpDebug('StagingScreen', 'restore:status_starting_skip_waiting_phase', {
          gameId,
          matchId: existing.matchId,
        });
      } else if (status === 'in_progress') {
        // Already in progress — go straight to game
        mpDebug('StagingScreen', 'restore:set_playing', { gameId, matchId: existing.matchId });
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

  // Guard: prevent auto-start from calling startMatchIfReady multiple times
  const startSentRef = useRef(false);
  // Guard: local accept click required before auto-start
  const localAcceptMatchIdRef = useRef<string | null>(null);
  // Guard: prevent countdown tick RPC from firing repeatedly for same match
  const tickStartSentForMatchRef = useRef<string | null>(null);
  // Guard: ensure game onStart is invoked only once per match
  const gameStartedForMatchRef = useRef<string | null>(null);
  // Guard: prevent countdown interval recreation spam for same match
  const countdownTimerRef = useRef<number | null>(null);
  const countdownRunningForMatchRef = useRef<string | null>(null);
  const countdownFallbackRefreshAtRef = useRef<number>(0);
  // Reset startSent when match changes (new match or match cleared)
  useEffect(() => {
    startSentRef.current = false;
    localAcceptMatchIdRef.current = null;
    tickStartSentForMatchRef.current = null;
    gameStartedForMatchRef.current = null;
    setMatchFoundAcceptedLocal(false);
    if (countdownTimerRef.current) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    countdownRunningForMatchRef.current = null;
    countdownFallbackRefreshAtRef.current = 0;
  }, [activeMatchId]);

  // Derived stable values for the effect
  const activeMatchStatus = activeEntry?.match.status;
  const activeMatchStartedAt = activeEntry?.match.started_at;
  const activeMatchMatchId = activeEntry?.match.id;
  const activeMatchConfigSeed = activeEntry?.match.config_seed;
  const activeMatchConfig = activeEntry?.match.config;
  const activeMatchHostId = activeEntry?.match.host_id;
  const isHostForActiveMatch = activeMatchHostId === user?.id;
  const activeNonForfeitedPlayers = activeEntry?.players.filter((p) => p.player.forfeited !== true) ?? [];
  const meForfeited = activeEntry?.players.find((p) => p.player.user_id === user?.id)?.player.forfeited === true;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const meReadyFromServer = (activeEntry?.players.find((p) => p.player.user_id === user?.id)?.player as any)?.ready === true;
  const meReadyForActiveMatch = matchFoundAcceptedLocal || meReadyFromServer;

  useEffect(() => {
    if (!activeMatchMatchId) return;
    mpDebug('StagingScreen', 'active_match:snapshot', {
      gameId,
      matchId: activeMatchMatchId,
      status: activeMatchStatus,
      startedAt: activeMatchStartedAt ?? null,
      meForfeited,
      players: activeEntry?.players.map((p) => ({
        userId: p.player.user_id,
        status: p.player.status,
        forfeited: p.player.forfeited,
      })) ?? [],
    });
  }, [gameId, activeMatchMatchId, activeMatchStatus, activeMatchStartedAt, meForfeited, activeEntry]);

  const startGameOnce = useCallback(
    (matchId: string, source: 'in_progress') => {
      if (gameStartedForMatchRef.current === matchId) return;
      gameStartedForMatchRef.current = matchId;

      mpDebug('StagingScreen', 'game_start:trigger', {
        gameId,
        matchId,
        source,
      });

      setPhase('playing');
      onStartRef.current({
        multiplayer: true,
        difficulty,
        seed: activeMatchConfigSeed ?? undefined,
        config: (activeMatchConfig as Record<string, unknown> | null) ?? undefined,
        matchId,
      });
    },
    [gameId, difficulty, activeMatchConfigSeed, activeMatchConfig],
  );

  useEffect(() => {
    if (!activeMatchStatus || !activeMatchMatchId) return;

    // Match ended or I forfeited — clean up and go back to staging
    if (activeMatchStatus === 'completed' || activeMatchStatus === 'cancelled' || meForfeited) {
      mpDebug('StagingScreen', 'status_effect:cleanup_to_staging', {
        gameId,
        matchId: activeMatchMatchId,
        status: activeMatchStatus,
        meForfeited,
      });
      clearActiveMatch(gameId);
      setActiveMatchId(null);
      setIsMatchmade(false);
      setPhase('staging');
      return;
    }

    if (activeMatchStatus === 'starting') {
      if (gameStartedForMatchRef.current === activeMatchMatchId) return;

      if (isMatchmade && !meReadyForActiveMatch) {
        setPhase('match-found');
        return;
      }

      // Start the countdown
      const startedAt = activeMatchStartedAt
        ? new Date(activeMatchStartedAt).getTime()
        : null;

      mpDebug('StagingScreen', 'status_effect:starting', {
        gameId,
        matchId: activeMatchMatchId,
        startedAt: activeMatchStartedAt ?? null,
      });

      if (startedAt) {
        // Already running for this match — don't recreate timer on rerenders
        if (countdownRunningForMatchRef.current === activeMatchMatchId && countdownTimerRef.current) {
          return;
        }

        // Match changed while timer exists: clear old timer before starting a new one
        if (countdownTimerRef.current) {
          window.clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
        }

        countdownRunningForMatchRef.current = activeMatchMatchId;
        const tick = () => {
          const remainingMs = startedAt - Date.now();
          const remaining = Math.max(0, Math.ceil(remainingMs / 1000));
          setCountdownValue(remaining);
          if (remaining <= 3) {
            mpDebug('StagingScreen', 'countdown:tick', {
              gameId,
              matchId: activeMatchMatchId,
              remaining,
              tickSentForMatch: tickStartSentForMatchRef.current,
              isHost: isHostForActiveMatch,
            });
          }

          if (
            remaining <= 0 &&
            tickStartSentForMatchRef.current !== activeMatchMatchId
          ) {
            tickStartSentForMatchRef.current = activeMatchMatchId;
            // Tick the match to in_progress — only once per client.
            // Server-side function should be idempotent; this avoids single-host dependency.
            mpDebug('StagingScreen', 'countdown:tick_match_start', {
              gameId,
              matchId: activeMatchMatchId,
              isHost: isHostForActiveMatch,
            });
            void mpRef.current.tickMatchStart(activeMatchMatchId);
          } else if (remaining <= 0) {
            // Fallback: if status update is delayed/missed on this client,
            // keep forcing refresh while we're still in `starting`.
            const now = Date.now();
            if (now - countdownFallbackRefreshAtRef.current >= 1000) {
              countdownFallbackRefreshAtRef.current = now;
              mpDebug('StagingScreen', 'countdown:fallback_refresh', {
                gameId,
                matchId: activeMatchMatchId,
              });
              void mpRef.current.refresh();
            }
          }
        };
        tick();
        countdownTimerRef.current = window.setInterval(tick, 100);
        setPhase('countdown');
        return;
      }
    }

    if (activeMatchStatus === 'in_progress') {
      if (isMatchmade && !meReadyForActiveMatch) {
        setPhase('match-found');
        return;
      }

      if (countdownTimerRef.current) {
        window.clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
      countdownRunningForMatchRef.current = null;

      if (gameStartedForMatchRef.current === activeMatchMatchId) {
        return;
      }
      mpDebug('StagingScreen', 'status_effect:in_progress_onStart', {
        gameId,
        matchId: activeMatchMatchId,
      });
      startGameOnce(activeMatchMatchId, 'in_progress');
    }
  }, [activeMatchStatus, activeMatchStartedAt, activeMatchMatchId, activeMatchHostId, isHostForActiveMatch, meForfeited, gameId, isMatchmade, meReadyForActiveMatch, startGameOnce]);

  useEffect(() => {
    return () => {
      if (countdownTimerRef.current) {
        window.clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
      countdownRunningForMatchRef.current = null;
    };
  }, []);

  /* ── Flash message ── */
  const flash = useCallback((msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3000);
  }, []);

  /* ── Matchmaking: when matched, show match-found overlay ── */
  const handledMatchmakeMatchIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (mm.status !== 'matched') {
      handledMatchmakeMatchIdRef.current = null;
    }
  }, [mm.status]);

  useEffect(() => {
    if (mm.status !== 'matched' || !mm.matchId) return;
    const matchId = mm.matchId;

    if (handledMatchmakeMatchIdRef.current === matchId) {
      return;
    }
    handledMatchmakeMatchIdRef.current = matchId;

    setActiveMatchPayload(gameId, {
      matchId,
      setAt: new Date().toISOString(),
      configSeed: mm.configSeed ?? undefined,
      config: { difficulty },
      matchmade: true,
      showOverlay: true,
    });
    setActiveMatchId(matchId);
    setIsMatchmade(true);
    setIsInviteOverlay(false);
    setMatchFoundAcceptedLocal(false);

    // Refresh so activeEntry appears in overlay immediately.
    void mpRef.current.refresh();
    setPhase('match-found');
  }, [mm.status, mm.matchId, mm.configSeed, difficulty, gameId]);

  /* ── Recovery: if queue UI is stuck but match already exists, adopt it ── */
  useEffect(() => {
    if (phase !== 'queuing') return;
    if (activeMatchId) return;

    const existingMatch = mp.matches.find((entry) => {
      if (entry.match.game_id !== gameId) return false;
      const status = entry.match.status;
      if (status !== 'waiting' && status !== 'starting' && status !== 'in_progress') return false;
      const nonForfeitedPlayers = entry.players.filter((p) => p.player.forfeited !== true);
      if (nonForfeitedPlayers.length < 2) return false;
      return entry.me?.status === 'accepted';
    });

    if (!existingMatch) return;

    mpDebug('StagingScreen', 'queue_recovery:adopt_existing_match', {
      gameId,
      matchId: existingMatch.match.id,
      status: existingMatch.match.status,
      mmStatus: mm.status,
    });

    setActiveMatchPayload(gameId, {
      matchId: existingMatch.match.id,
      setAt: new Date().toISOString(),
      configSeed: existingMatch.match.config_seed ?? undefined,
      config: (existingMatch.match.config as Record<string, unknown> | null) ?? undefined,
      matchmade: true,
      showOverlay: existingMatch.match.status === 'waiting' ? true : undefined,
    });

    setActiveMatchId(existingMatch.match.id);
    setIsMatchmade(true);
    setIsInviteOverlay(false);
    setMatchFoundAcceptedLocal(false);

    if (existingMatch.match.status === 'waiting') {
      setPhase('match-found');
      return;
    }
    if (existingMatch.match.status === 'starting') {
      setPhase(matchFoundAcceptedLocal ? 'countdown' : 'match-found');
      return;
    }
    if (existingMatch.match.status === 'in_progress') {
      setPhase(matchFoundAcceptedLocal ? 'playing' : 'match-found');
    }
  }, [phase, activeMatchId, mp.matches, gameId, mm.status, matchFoundAcceptedLocal]);

  /* ── Overlay: derive MatchPlayer[] from activeEntry ── */
  const overlayPlayers = useMemo<MatchPlayer[]>(() => {
    if (!activeEntry) return [];
    return activeEntry.players.map(({ player, profile }) => ({
      id: profile?.id ?? player.user_id,
      username: profile?.username ?? 'Spelare',
      tag: profile?.tag ?? '????',
      skin: displaySkin(profile?.skin),
      level: profile?.level ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      accepted:
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (player as any).ready === true ||
        player.status === 'accepted' ||
        (isMatchmade && player.user_id === user?.id && matchFoundAcceptedLocal),
    }));
  }, [activeEntry, isMatchmade, user?.id, matchFoundAcceptedLocal]);

  /* ── Overlay: accept handler ── */
  const handleOverlayAccept = useCallback(async () => {
    if (!activeMatchId) return;
    mpDebug('StagingScreen', 'accept:click', {
      gameId,
      matchId: activeMatchId,
      isMatchmade,
    });
    localAcceptMatchIdRef.current = activeMatchId;
    const { error: err, data: readyData } = await mp.markReady(activeMatchId);
    mpDebug('StagingScreen', 'accept:mark_ready_result', {
      gameId,
      matchId: activeMatchId,
      isMatchmade,
      error: err,
      readyCount: readyData?.ready_count ?? null,
      totalCount: readyData?.total_count ?? null,
      allReady: readyData?.all_ready ?? null,
    });

    // Matchmade UI should reflect local click instantly regardless of backend timing.
    if (isMatchmade) {
      setMatchFoundAcceptedLocal(true);
      void mpRef.current.refresh();
      if (err) {
        flash('Backend saknar ready-state migration. Kör SQL-migrationen först.');
      } else if ((readyData?.all_ready === true) && ((readyData?.total_count ?? 0) >= 2)) {
        mpDebug('StagingScreen', 'accept:start_probe_request', {
          gameId,
          matchId: activeMatchId,
          phase,
          immediate: true,
        });
        const startErr = await mp.startMatchIfReady(activeMatchId, 3);
        mpDebug('StagingScreen', 'accept:start_probe_result', {
          gameId,
          matchId: activeMatchId,
          error: startErr,
          immediate: true,
        });
      }
    }
    if (err && !isMatchmade) {
      flash('Kunde inte markera redo. Försök igen.');
    }
  }, [activeMatchId, isMatchmade, mp, flash, gameId, phase]);

  /* ── Overlay: decline handler ── */
  const handleOverlayDecline = useCallback(async () => {
    if (activeMatchId) {
      if (isMatchmade) {
        await mpForceCleanupActiveMatches();
      } else {
        await mp.declineInvite(activeMatchId);
      }
    }
    clearActiveMatch(gameId);
    setActiveMatchId(null);
    setIsInviteOverlay(false);
    setIsMatchmade(false);
    setMatchFoundAcceptedLocal(false);
    setPhase('staging');
    await mp.refresh();
  }, [activeMatchId, gameId, isMatchmade, mp]);

  /* ── Auto-start when all players accept ── */
  // Derived stable primitives for the auto-start effect
  const allPlayersReady =
    activeNonForfeitedPlayers.length >= 2 &&
    activeNonForfeitedPlayers.every((p) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (p.player as any).ready === true;
    });
  const isHost = activeEntry?.match.host_id === user?.id;
  const hasLocalAcceptForActiveMatch =
    !!activeMatchMatchId && localAcceptMatchIdRef.current === activeMatchMatchId;
  const canStartMatchFoundPhase = hasLocalAcceptForActiveMatch && (!isMatchmade || meReadyForActiveMatch);

  useEffect(() => {
    mpDebug('StagingScreen', 'auto_start:evaluate', {
      gameId,
      phase,
      matchId: activeMatchMatchId ?? null,
      matchStatus: activeMatchStatus ?? null,
      allPlayersReady,
      isHost,
      isMatchmade,
      hasLocalAcceptForActiveMatch,
      meReadyForActiveMatch,
      startSent: startSentRef.current,
    });
    if (!activeMatchMatchId || !allPlayersReady || !isHost) return;
    if (startSentRef.current) return; // Already sent — don't call again

    // For match-found overlay (friend invite): host starts when all accept
    if (phase === 'match-found' && canStartMatchFoundPhase) {
      startSentRef.current = true;
      mpDebug('StagingScreen', 'auto_start:trigger_friend_invite', {
        gameId,
        matchId: activeMatchMatchId,
        countdownSeconds: isMatchmade ? 3 : 5,
      });
      void mpRef.current.startMatchIfReady(activeMatchMatchId, isMatchmade ? 3 : 5);
    }
    // Matchmade flow should start from match-found overlay only, never directly from waiting.
  }, [phase, activeMatchMatchId, activeMatchStatus, allPlayersReady, isHost, isMatchmade, hasLocalAcceptForActiveMatch, meReadyForActiveMatch, canStartMatchFoundPhase]);

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
  }, [mm, difficulty, mp]);

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

  // Safety net: after accepting in matchmade flow, keep probing
  // server-authoritative start until backend transitions.
  // Any client can probe; backend enforces host/all-ready rules.
  useEffect(() => {
    if (!activeMatchId) return;
    if (!isMatchmade) return;
    if (phase !== 'match-found' && phase !== 'waiting') return;
    if (!meReadyForActiveMatch) return;
    if (activeNonForfeitedPlayers.length < 2) return;
    if (activeMatchStatus === 'starting' || activeMatchStatus === 'in_progress') return;

    const timer = window.setInterval(async () => {
      mpDebug('StagingScreen', 'accept:start_probe_request', {
        gameId,
        matchId: activeMatchId,
        phase,
      });
      const err = await mpRef.current.startMatchIfReady(activeMatchId, 3);
      mpDebug('StagingScreen', 'accept:start_probe_result', {
        gameId,
        matchId: activeMatchId,
        error: err,
      });
    }, 1200);

    return () => window.clearInterval(timer);
  }, [activeMatchId, activeMatchStatus, gameId, isMatchmade, meReadyForActiveMatch, phase, activeNonForfeitedPlayers.length]);

  // Safety net: keep pre-game state in sync even if realtime updates are delayed.
  useEffect(() => {
    if (!activeMatchId) return;
    if (phase !== 'match-found' && phase !== 'waiting' && phase !== 'countdown') return;

    const timer = window.setInterval(() => {
      void mpRef.current.refresh();
    }, 1200);

    return () => window.clearInterval(timer);
  }, [activeMatchId, phase]);

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
    mpDebug('StagingScreen', 'manual_start:clicked', {
      gameId,
      matchId: activeMatchId,
      matchStatus: activeEntry?.match.status ?? null,
      startSent: startSentRef.current,
      allPlayersReady: allPlayersReady,
      isHost: activeEntry?.match.host_id === user?.id,
    });
    if (!activeMatchId) return;
    // Guard: don't call if auto-start already fired or match already left 'waiting'
    if (startSentRef.current) {
      mpDebug('StagingScreen', 'manual_start:ignored_start_already_sent', {
        gameId,
        matchId: activeMatchId,
      });
      return;
    }
    if (activeEntry?.match.status !== 'waiting') {
      mpDebug('StagingScreen', 'manual_start:ignored_not_waiting', {
        gameId,
        matchId: activeMatchId,
        matchStatus: activeEntry?.match.status ?? null,
      });
      flash('Matchen är inte i vänteläge längre.');
      return;
    }
    startSentRef.current = true;
    mpDebug('StagingScreen', 'manual_start:request', {
      gameId,
      matchId: activeMatchId,
    });
    const err = await mp.startMatchIfReady(activeMatchId, 5);
    if (err) {
      startSentRef.current = false; // Reset so user can retry
      mpDebug('StagingScreen', 'manual_start:error', {
        gameId,
        matchId: activeMatchId,
        error: err,
      });
      flash(err);
      return;
    }
    mpDebug('StagingScreen', 'manual_start:ok', {
      gameId,
      matchId: activeMatchId,
    });
  }, [activeMatchId, activeEntry, gameId, mp, flash, allPlayersReady]);

  /* ── Cancel match ── */
  const handleCancelMatch = useCallback(async () => {
    if (!activeMatchId) return;
    if (!window.confirm('Avbryta matchen?')) return;

    mpDebug('StagingScreen', 'cancel:request_force_cleanup', {
      gameId,
      matchId: activeMatchId,
    });
    await mpForceCleanupActiveMatches();
    clearActiveMatch(gameId);
    setActiveMatchId(null);
    setIsMatchmade(false);
    startSentRef.current = false;
    setPhase('staging');
    await mp.refresh();
  }, [activeMatchId, gameId, mp]);

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
   * Uses server-side force cleanup to avoid status-dependent 400 chains.
   */
  const forfeitNow = useCallback(() => {
    const matchId = activeMatchIdRef.current;
    if (!matchId) return;
    const p = phaseRef.current;
    // Only auto-forfeit while actively playing.
    // Pre-game phases (match-found/waiting/countdown) must not be cleaned up
    // just because the user switches tab/window.
    if (p !== 'playing') return;

    void (async () => {
      mpDebug('StagingScreen', 'forfeitNow:request_force_cleanup', {
        gameId,
        matchId,
        phase: p,
      });
      await mpForceCleanupActiveMatches();
      clearActiveMatch(gameId);
      setActiveMatchId(null);
      setIsMatchmade(false);
      startSentRef.current = false;
      await mp.refresh();
    })();
  }, [gameId]);

  /* ── Auto-forfeit on component unmount (navigation away) ── */
  useEffect(() => {
    return () => {
      forfeitNow();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forfeitNow]);

  /* ── Auto-forfeit on tab close / refresh (beforeunload) ── */
  useEffect(() => {
    const onBeforeUnload = () => {
      forfeitNow();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
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
    const acceptDeadlineAt = activeEntry?.match.created_at
      ? new Date(new Date(activeEntry.match.created_at).getTime() + 15_000).toISOString()
      : null;

    return (
      <MatchFoundOverlay
        visible
        players={overlayPlayers}
        timeLimit={15}
        deadlineAt={acceptDeadlineAt}
        myId={user?.id ?? ''}
        onAccept={handleOverlayAccept}
        onDecline={handleOverlayDecline}
        noTimeout={isInviteOverlay}
        enableSounds={!isMatchmade}
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
                      player.ready
                        ? 'text-green-300'
                        : player.status === 'declined'
                          ? 'text-red-300'
                          : 'text-yellow-300'
                    }`}
                  >
                    {player.ready
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
                  disabled={!allPlayersReady}
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
