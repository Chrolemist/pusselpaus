/* ── MatchFoundOverlay – LoL-style match-accept screen ──
 *
 *  Full-screen overlay with:
 *   • Backdrop blur + radial gradient pulse
 *   • "MATCH HITTAD!" title with entrance animation
 *   • Circular SVG countdown timer (ring that depletes)
 *   • Player avatar slots that light up as they accept
 *   • Accept / Decline buttons
 *   • Sound effects via matchSounds.ts
 *   • Confetti burst when all players accept
 *
 *  Reusable for:
 *   • Random matchmaking queue matches
 *   • Friend-invite match starts
 *
 *  Usage:
 *    <MatchFoundOverlay
 *      players={[{ id, username, tag, skin, level, accepted }]}
 *      timeLimit={15}
 *      onAccept={() => { ... }}
 *      onDecline={() => { ... }}
 *      myId={user.id}
 *    />
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import { Swords, Check, X, Rocket } from 'lucide-react';
import { playMatchFound, playAcceptTick, playCountdownTick } from './matchSounds';
import { displaySkin } from '../core/skin';
import { mpDebug } from './debug';

/* ── Types ── */

export interface MatchPlayer {
  id: string;
  username: string;
  tag: string;
  skin: string;
  level: number | null;
  accepted: boolean;
  declined?: boolean;
}

export interface MatchFoundOverlayProps {
  /** Players in this match */
  players: MatchPlayer[];
  /** Countdown time limit in seconds (default 15) */
  timeLimit?: number;
  /** Current user's id */
  myId: string;
  /** Called when the user clicks Accept */
  onAccept: () => void;
  /** Called when the user clicks Decline OR when time runs out */
  onDecline: () => void;
  /** Whether to show the overlay */
  visible: boolean;
  /** When true, timeout is display-only and will not auto-decline. */
  noTimeout?: boolean;
  /** Enable overlay sounds (match found / accept / countdown tick) */
  enableSounds?: boolean;
  /** Absolute server-based deadline for accept countdown (ISO timestamp) */
  deadlineAt?: string | null;
  /** Optional server-authoritative accepted count */
  acceptedCountOverride?: number | null;
  /** Optional server-authoritative total count */
  totalCountOverride?: number | null;
  /** Current database time for synced countdown rendering */
  serverNowAt?: string | null;
}

/* ── Constants ── */
const RING_SIZE = 180;
const RING_STROKE = 6;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/* ── Component ── */

export default function MatchFoundOverlay({
  players,
  timeLimit = 15,
  myId,
  onAccept,
  onDecline,
  visible,
  noTimeout = false,
  enableSounds = true,
  deadlineAt = null,
  acceptedCountOverride = null,
  totalCountOverride = null,
  serverNowAt = null,
}: MatchFoundOverlayProps) {
  const [secondsLeft, setSecondsLeft] = useState(timeLimit);
  const [hasAccepted, setHasAccepted] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevAcceptCount = useRef(0);
  const prevSecondsRef = useRef<number | null>(null);
  const declinedRef = useRef(false);
  const serverClockRef = useRef<{ serverNowMs: number; localNowMs: number } | null>(null);
  const onDeclineRef = useRef(onDecline);
  useEffect(() => { onDeclineRef.current = onDecline; }, [onDecline]);

  useEffect(() => {
    if (!serverNowAt) {
      serverClockRef.current = null;
      return;
    }
    const serverNowMs = new Date(serverNowAt).getTime();
    if (!Number.isFinite(serverNowMs)) {
      serverClockRef.current = null;
      return;
    }
    serverClockRef.current = {
      serverNowMs,
      localNowMs: Date.now(),
    };
  }, [serverNowAt]);

  const getAuthoritativeNowMs = useCallback(() => {
    const snapshot = serverClockRef.current;
    if (!snapshot) return Date.now();
    return snapshot.serverNowMs + (Date.now() - snapshot.localNowMs);
  }, []);

  const localAcceptedCount = players.filter((p) => p.accepted).length;
  const meAccepted = hasAccepted || players.find((p) => p.id === myId)?.accepted;
  const acceptedCount = Math.max(acceptedCountOverride ?? 0, localAcceptedCount);
  const totalCount = totalCountOverride ?? players.length;
  const allAccepted = totalCount > 0 && acceptedCount >= totalCount;
  const anyDeclined = players.some((p) => p.declined === true);

  /* ── Play match-found sound when overlay opens ── */
  useEffect(() => {
    if (!visible) return;
    mpDebug('MatchFoundOverlay', 'overlay:visible_play_match_found', {
      players: players.length,
      noTimeout,
      timeLimit,
    });
    if (enableSounds) void playMatchFound();
  }, [visible, players.length, noTimeout, timeLimit, enableSounds]);

  /* ── Countdown timer (resets on open) ── */
  useEffect(() => {
    if (!visible) {
      // Reset on close so next open starts fresh
      return () => {
        mpDebug('MatchFoundOverlay', 'countdown:reset_on_close');
        setHasAccepted(false);
        setSecondsLeft(timeLimit);
        prevSecondsRef.current = null;
        declinedRef.current = false;
      };
    }

    // Friend invites have no deadline. Matchmade flow may still show a synced
    // visual timer without auto-declining when `noTimeout` is true.
    if ((noTimeout && !deadlineAt) || anyDeclined) {
      mpDebug('MatchFoundOverlay', 'countdown:skipped_noTimeout');
      return;
    }

    if (totalCount < 2) {
      mpDebug('MatchFoundOverlay', 'countdown:waiting_for_players', {
        players: players.length,
        totalCount,
        required: 2,
      });
      setSecondsLeft(timeLimit);
      return;
    }

    const deadlineMs = deadlineAt ? new Date(deadlineAt).getTime() : Number.NaN;
    const hasServerDeadline = Number.isFinite(deadlineMs);
    const hasServerNow = serverClockRef.current !== null;
    const initialSeconds = hasServerDeadline
      ? Math.max(0, Math.ceil((deadlineMs - getAuthoritativeNowMs()) / 1000))
      : timeLimit;

    mpDebug('MatchFoundOverlay', 'countdown:start', {
      seconds: initialSeconds,
      timeLimit,
      deadlineAt,
      hasServerDeadline,
      hasServerNow,
      serverNowAt,
    });

    setSecondsLeft(initialSeconds);
    prevSecondsRef.current = null;

    timerRef.current = setInterval(() => {
      const seconds = hasServerDeadline
        ? Math.max(0, Math.ceil((deadlineMs - getAuthoritativeNowMs()) / 1000))
        : Math.max(0, (prevSecondsRef.current ?? timeLimit) - 1);

      if (prevSecondsRef.current !== seconds) {
        mpDebug('MatchFoundOverlay', 'countdown:tick', { seconds, deadlineAt, hasServerDeadline, hasServerNow, serverNowAt });
        if (seconds <= 5 && seconds > 0) {
          mpDebug('MatchFoundOverlay', 'countdown:play_tick_sound', { seconds });
          if (enableSounds) void playCountdownTick();
        }
      }

      prevSecondsRef.current = seconds;
      setSecondsLeft(seconds);

      if (seconds <= 0) {
        if (timerRef.current) clearInterval(timerRef.current);
        if (!noTimeout && !declinedRef.current && !allAccepted && !meAccepted) {
          declinedRef.current = true;
          mpDebug('MatchFoundOverlay', 'countdown:expired_decline');
          onDeclineRef.current();
        }
        return;
      }
    }, hasServerDeadline ? 250 : 1000);

    return () => {
      mpDebug('MatchFoundOverlay', 'countdown:cleanup_interval');
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [visible, timeLimit, noTimeout, anyDeclined, enableSounds, players.length, deadlineAt, totalCount, allAccepted, meAccepted, getAuthoritativeNowMs, serverNowAt]);

  /* ── Accept blip when new players accept ── */
  useEffect(() => {
    const count = players.filter((p) => p.accepted).length;
    if (count > prevAcceptCount.current && visible) {
      if (enableSounds) void playAcceptTick();
    }
    prevAcceptCount.current = count;
  }, [players, visible, enableSounds]);

  /* ── Confetti when everyone accepts ── */
  useEffect(() => {
    if (!visible) return;
    if (allAccepted) {
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.5 },
        colors: ['#6366f1', '#818cf8', '#38bdf8', '#22c55e'],
      });
    }
  }, [allAccepted, visible]);

  /* ── Handle accept ── */
  const handleAccept = useCallback(() => {
    if (hasAccepted) return;
    setHasAccepted(true);
    onAccept();
  }, [hasAccepted, onAccept]);

  /* ── Derived values ── */
  const progress = secondsLeft / timeLimit;          // 1 → 0
  const dashOffset = RING_CIRCUMFERENCE * (1 - progress);
  /* ── Urgency color for countdown ring ── */
  const ringColor =
    secondsLeft <= 3
      ? '#ef4444'   // red
      : secondsLeft <= 7
        ? '#f59e0b' // amber
        : '#6366f1'; // brand

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* ── Backdrop ── */}
          <div className="absolute inset-0 bg-surface/90 backdrop-blur-lg" />

          {/* ── Animated radial pulse ── */}
          <motion.div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(circle at 50% 45%, rgba(99,102,241,0.15) 0%, transparent 70%)',
            }}
            animate={{ opacity: [0.4, 0.8, 0.4] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          />

          {/* ── Content ── */}
          <div className="relative z-10 flex flex-col items-center gap-6 px-4">

            {/* ── Title ── */}
            <motion.h1
              className="text-center text-3xl font-extrabold tracking-wide text-brand-light sm:text-4xl"
              initial={{ y: -30, opacity: 0, scale: 0.8 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
            >
              MATCH HITTAD!
            </motion.h1>

            <motion.p
              className="text-sm text-text-muted"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              Acceptera för att spela
            </motion.p>

            {/* ── Countdown ring ── */}
            {(!noTimeout || !!deadlineAt) && (
            <motion.div
              className="relative flex items-center justify-center"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 180, damping: 14, delay: 0.2 }}
            >
              <svg
                width={RING_SIZE}
                height={RING_SIZE}
                className="-rotate-90"
              >
                {/* Background ring */}
                <circle
                  cx={RING_SIZE / 2}
                  cy={RING_SIZE / 2}
                  r={RING_RADIUS}
                  fill="none"
                  stroke="rgba(255,255,255,0.08)"
                  strokeWidth={RING_STROKE}
                />
                {/* Progress ring */}
                <circle
                  cx={RING_SIZE / 2}
                  cy={RING_SIZE / 2}
                  r={RING_RADIUS}
                  fill="none"
                  stroke={ringColor}
                  strokeWidth={RING_STROKE}
                  strokeLinecap="round"
                  strokeDasharray={RING_CIRCUMFERENCE}
                  strokeDashoffset={dashOffset}
                  style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.5s ease' }}
                />
              </svg>

              {/* Center text */}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <motion.span
                  key={secondsLeft}
                  className="text-5xl font-extrabold tabular-nums"
                  style={{ color: ringColor }}
                  initial={{ scale: 1.3, opacity: 0.5 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.3 }}
                >
                  {secondsLeft}
                </motion.span>
                <span className="text-[11px] text-text-muted">sekunder</span>
              </div>
            </motion.div>
            )}

            {/* ── Pulsing indicator for indefinite friend-invite wait ── */}
            {noTimeout && !deadlineAt && (
              <motion.div
                className="flex flex-col items-center gap-2"
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 180, damping: 14, delay: 0.2 }}
              >
                <motion.div
                  className="flex h-20 w-20 items-center justify-center rounded-full bg-brand/15 ring-2 ring-brand/40"
                  animate={{ scale: [1, 1.08, 1], opacity: [0.8, 1, 0.8] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <Swords className="h-8 w-8 text-brand-light" />
                </motion.div>
              </motion.div>
            )}

            {/* ── Player slots ── */}
            <motion.div
              className="flex flex-wrap justify-center gap-3"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.4 }}
            >
              {players.map((p, i) => (
                <motion.div
                  key={p.id}
                  className={`relative flex flex-col items-center gap-1 rounded-xl px-3 py-2 transition-colors duration-300 ${
                    p.declined
                      ? 'bg-red-500/15 ring-1 ring-red-500/40'
                      : p.accepted
                        ? 'bg-success/15 ring-1 ring-success/40'
                        : 'bg-white/5 ring-1 ring-white/10'
                  }`}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.5 + i * 0.1, type: 'spring', stiffness: 300, damping: 20 }}
                >
                  {/* Avatar */}
                  <span className="text-2xl">{displaySkin(p.skin)}</span>

                  {/* Name */}
                  <span className="max-w-[80px] truncate text-xs font-semibold">
                    {p.username}
                  </span>

                  {/* Tag + level */}
                  <span className="flex items-center gap-1 text-[10px] text-text-muted">
                    #{p.tag}
                    {p.level != null && (
                      <span className="rounded bg-brand/20 px-1 text-brand-light">
                        Lv {p.level}
                      </span>
                    )}
                  </span>

                  {/* Accepted indicator */}
                  <AnimatePresence>
                    {(p.accepted || p.declined) && (
                      <motion.div
                        className={`absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white shadow ${p.declined ? 'bg-red-500' : 'bg-success'}`}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        exit={{ scale: 0 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                      >
                        {p.declined ? <X className="h-3 w-3" /> : <Check className="h-3 w-3" />}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* "You" label */}
                  {p.id === myId && (
                    <span className="text-[9px] font-semibold uppercase tracking-wider text-brand-light">
                      Du
                    </span>
                  )}
                </motion.div>
              ))}
            </motion.div>

            {/* ── Accept counter ── */}
            <p className="text-xs text-text-muted">
              {acceptedCount} / {totalCount} redo
            </p>

            {/* ── Action buttons ── */}
            <motion.div
              className="flex w-full max-w-xs gap-3"
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.6, duration: 0.4 }}
            >
              {!meAccepted && !anyDeclined ? (
                <>
                  <motion.button
                    onClick={handleAccept}
                    className="flex-1 rounded-xl bg-success px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-success/30 transition"
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <Check className="h-4 w-4" /> Acceptera
                  </motion.button>
                  <motion.button
                    onClick={onDecline}
                    className="flex items-center justify-center gap-1 rounded-xl bg-white/5 px-5 py-3.5 text-sm font-semibold text-text-muted ring-1 ring-white/10 transition hover:bg-red-500/15 hover:text-red-300 hover:ring-red-500/30"
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <X className="h-4 w-4" />
                  </motion.button>
                </>
              ) : (
                <motion.div
                  className="flex w-full flex-col items-center gap-2"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  {anyDeclined ? (
                    <>
                      <div className="flex items-center gap-2 text-red-300">
                        <X className="h-5 w-5" />
                        <span className="text-sm font-semibold">En spelare nekade matchen</span>
                      </div>
                      <p className="text-xs text-text-muted">Matchen stängs…</p>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 text-success">
                        <motion.span
                          className="text-lg"
                          animate={{ scale: [1, 1.2, 1] }}
                          transition={{ duration: 0.6, repeat: Infinity, repeatDelay: 1 }}
                        >
                          <Check className="h-5 w-5" />
                        </motion.span>
                        <span className="text-sm font-semibold">Accepterat!</span>
                      </div>
                      {!allAccepted && (
                        <p className="text-xs text-text-muted">
                          Väntar på andra spelare…
                        </p>
                      )}
                    </>
                  )}
                  {/* Exit button for friend-invite flow (no timer to auto-exit) */}
                  {noTimeout && !anyDeclined && (
                    <motion.button
                      onClick={onDecline}
                      className="mt-2 flex items-center gap-1 rounded-lg bg-white/5 px-4 py-2 text-xs font-semibold text-text-muted ring-1 ring-white/10 transition hover:bg-red-500/15 hover:text-red-300 hover:ring-red-500/30"
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <X className="h-3 w-3" /> Lämna
                    </motion.button>
                  )}
                </motion.div>
              )}
            </motion.div>

            {/* ── All accepted state ── */}
            <AnimatePresence>
              {allAccepted && !anyDeclined && (
                <motion.p
                  className="text-center text-sm font-bold text-success"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                >
                  Alla redo — spelet startar! <Rocket className="inline h-4 w-4" />
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
