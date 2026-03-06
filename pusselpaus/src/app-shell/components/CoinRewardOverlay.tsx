/* ── CoinRewardOverlay – dramatic celebration when coins are earned ──
 *
 *  Replaces the old minimal CoinToast.  Listens for the global
 *  `pusselpaus:coins-awarded` event emitted by addCoins() in useCoinRewards.
 *
 *  Shows a center-screen overlay with:
 *   • Golden radial backdrop glow
 *   • Bouncing / spinning 🪙 coin with shimmer ring
 *   • Count-up animation from 0 → amount
 *   • Floating coin particles rising upward
 *   • Satisfying multi-note coin chime (Web Audio)
 *   • Gold confetti burst
 *   • Auto-dismiss after ~3.5 s or tap to close
 *
 *  Mount once at the app shell level (App.tsx).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Flame } from 'lucide-react';
import confetti from 'canvas-confetti';

/* ── Constants ── */

const COIN_AWARDED_EVENT = 'pusselpaus:coins-awarded';
const AUTO_DISMISS_MS = 3500;
const COUNT_UP_DURATION_MS = 900;

/* ── Floating coin particles (pre-computed positions) ── */

const PARTICLES = Array.from({ length: 10 }, (_, i) => ({
  id: i,
  x: (Math.sin(i * 2.39) * 0.5 + 0.03 * i) * 160 - 80,   // deterministic spread
  yEnd: -180 - (i * 17) % 80,                               // deterministic rise
  delay: (i * 0.037) % 0.3,                                 // stagger entrance
  duration: 1.4 + (i * 0.13) % 0.8,                         // 1.4–2.2 s
  size: 14 + (i * 1.7) % 10,                                // 14–24 px
  rotate: (i * 41) % 360,
}));

/* ── Sound (Web Audio – lightweight, no Tone.js needed) ── */

function playCoinChime(): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const master = ctx.createGain();
    master.connect(ctx.destination);
    master.gain.setValueAtTime(0.12, now);
    master.gain.linearRampToValueAtTime(0, now + 1.0);

    // Ascending coin cascade: E5→G5→B5→E6  (major arpeggio, brighter than level-up)
    const freqs = [659.25, 783.99, 987.77, 1318.51, 1567.98];
    freqs.forEach((freq, i) => {
      const t = now + i * 0.07;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);

      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(0.18 - i * 0.015, t + 0.02);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);

      osc.connect(env).connect(master);
      osc.start(t);
      osc.stop(t + 0.4);
    });

    // Shimmer overtone
    const shimmer = ctx.createOscillator();
    shimmer.type = 'sine';
    shimmer.frequency.setValueAtTime(2637, now + 0.35);
    const shimEnv = ctx.createGain();
    shimEnv.gain.setValueAtTime(0.0001, now + 0.35);
    shimEnv.gain.exponentialRampToValueAtTime(0.06, now + 0.38);
    shimEnv.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);
    shimmer.connect(shimEnv).connect(master);
    shimmer.start(now + 0.35);
    shimmer.stop(now + 0.85);

    // Cleanup context after sound ends
    setTimeout(() => ctx.close().catch(() => {}), 1500);
  } catch {
    // Silently fail if audio blocked
  }
}

/* ── Count-up hook ── */

function useCountUp(target: number, active: boolean): number {
  const [value, setValue] = useState(0);
  const rafRef = useRef(0);
  const startRef = useRef(0);

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);

    if (!active || target <= 0) {
      // Reset via a microtask so it's not a synchronous setState in effect body
      queueMicrotask(() => setValue(0));
      return;
    }

    startRef.current = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startRef.current;
      const progress = Math.min(elapsed / COUNT_UP_DURATION_MS, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, active]);

  return value;
}

/* ── Component ── */

export default function CoinRewardOverlay() {
  const [amount, setAmount] = useState(0);
  const [visible, setVisible] = useState(false);
  const queueRef = useRef<number[]>([]);
  const displayingRef = useRef(false);

  const displayedValue = useCountUp(amount, visible);

  /* ── Process queue ── */
  const showNext = useCallback(() => {
    const next = queueRef.current.shift();
    if (next == null) {
      displayingRef.current = false;
      return;
    }

    displayingRef.current = true;
    setAmount(next);
    setVisible(true);

    playCoinChime();

    // Gold confetti burst
    setTimeout(() => {
      confetti({
        particleCount: 55,
        spread: 65,
        origin: { y: 0.42 },
        colors: ['#fbbf24', '#f59e0b', '#eab308', '#fcd34d', '#facc15'],
        ticks: 70,
        gravity: 1.1,
        scalar: 0.9,
      });
    }, 150);

    // Side sparkles
    setTimeout(() => {
      confetti({
        particleCount: 25,
        angle: 60,
        spread: 40,
        origin: { x: 0.3, y: 0.45 },
        colors: ['#fbbf24', '#fcd34d'],
        ticks: 50,
        scalar: 0.7,
      });
      confetti({
        particleCount: 25,
        angle: 120,
        spread: 40,
        origin: { x: 0.7, y: 0.45 },
        colors: ['#fbbf24', '#fcd34d'],
        ticks: 50,
        scalar: 0.7,
      });
    }, 500);
  }, []);

  /* ── Listen for coin events ── */
  useEffect(() => {
    const handler = (e: Event) => {
      const amt = (e as CustomEvent<{ amount: number }>).detail?.amount ?? 0;
      if (amt <= 0) return;

      queueRef.current.push(amt);
      if (!displayingRef.current) showNext();
    };

    window.addEventListener(COIN_AWARDED_EVENT, handler);
    return () => window.removeEventListener(COIN_AWARDED_EVENT, handler);
  }, [showNext]);

  /* ── Auto-dismiss ── */
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => {
      setVisible(false);
      // Small gap before showing next queued item
      setTimeout(showNext, 300);
    }, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [visible, showNext]);

  const dismiss = useCallback(() => {
    setVisible(false);
    setTimeout(showNext, 200);
  }, [showNext]);

  return (
    <AnimatePresence>
      {visible && amount > 0 && (
        <motion.div
          className="fixed inset-0 z-[9998] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          onClick={dismiss}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

          {/* Radial gold glow */}
          <motion.div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(circle at 50% 42%, rgba(251,191,36,0.25) 0%, rgba(245,158,11,0.08) 35%, transparent 65%)',
            }}
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
          />

          {/* Floating coin particles */}
          {PARTICLES.map((p) => (
            <motion.div
              key={p.id}
              className="absolute text-yellow-300 select-none"
              style={{ fontSize: p.size }}
              initial={{ y: 0, x: p.x, opacity: 0, rotate: p.rotate, scale: 0 }}
              animate={{
                y: p.yEnd,
                opacity: [0, 0.9, 0.9, 0],
                rotate: p.rotate + 180,
                scale: [0, 1, 1, 0.3],
              }}
              transition={{
                duration: p.duration,
                delay: 0.2 + p.delay,
                ease: 'easeOut',
              }}
            >
              🪙
            </motion.div>
          ))}

          {/* Content card */}
          <motion.div
            className="relative z-10 flex flex-col items-center gap-3 rounded-3xl bg-gradient-to-b from-surface-card/95 to-surface/90 px-10 py-8 shadow-2xl ring-1 ring-yellow-400/30"
            initial={{ scale: 0.3, y: 60, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.7, y: 30, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 220, damping: 16, delay: 0.05 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Shimmer ring behind coin */}
            <motion.div
              className="absolute top-4 h-20 w-20 rounded-full"
              style={{
                background:
                  'conic-gradient(from 0deg, transparent 0%, rgba(251,191,36,0.4) 25%, transparent 50%, rgba(250,204,21,0.3) 75%, transparent 100%)',
              }}
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            />

            {/* Secondary glow pulse */}
            <motion.div
              className="absolute top-6 h-16 w-16 rounded-full bg-yellow-400/20 blur-xl"
              animate={{ scale: [1, 1.6, 1], opacity: [0.3, 0.6, 0.3] }}
              transition={{ duration: 1.3, repeat: Infinity, ease: 'easeInOut' }}
            />

            {/* Big coin emoji */}
            <motion.div
              className="relative text-5xl select-none"
              initial={{ scale: 0, rotate: -90 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 12, delay: 0.15 }}
            >
              <motion.span
                className="inline-block"
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
              >
                🪙
              </motion.span>
            </motion.div>

            {/* Label */}
            <motion.p
              className="text-xs font-bold uppercase tracking-widest text-yellow-400/80"
              initial={{ y: -8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.25 }}
            >
              Coins intjänade!
            </motion.p>

            {/* Count-up number */}
            <motion.div
              className="flex items-baseline gap-1"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 14, delay: 0.3 }}
            >
              <span className="text-5xl font-extrabold tabular-nums text-yellow-300 drop-shadow-lg">
                +{displayedValue}
              </span>
            </motion.div>

            {/* Coin icon row */}
            <motion.div
              className="flex items-center gap-1.5 rounded-xl bg-yellow-500/15 px-4 py-1.5 ring-1 ring-yellow-400/25"
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.45 }}
            >
              <span className="text-sm">🪙</span>
              <span className="text-xs font-semibold text-yellow-200">coins</span>
            </motion.div>

            {/* Bonus callout for larger amounts */}
            {amount >= 10 && (
              <motion.p
                className="text-[11px] font-semibold text-yellow-400/70"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
              >
                                <Flame className="inline h-3 w-3" /> Bra jobbat!
              </motion.p>
            )}

            {/* Dismiss hint */}
            <motion.p
              className="mt-1 text-[10px] text-text-muted/60"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              transition={{ delay: 1.2 }}
            >
              Tryck för att stänga
            </motion.p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
