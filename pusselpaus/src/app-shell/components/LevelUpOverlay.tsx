/* ── LevelUpOverlay – celebration when the player levels up ──
 *
 *  Listens for the global `pusselpaus:level-up` event emitted by awardXp().
 *  Shows a full-screen overlay with:
 *   • Animated level number with spring entrance
 *   • Particle burst via canvas-confetti
 *   • Coin bonus display
 *   • Celebratory sound (Tone.js)
 *   • Auto-dismiss after ~4 s or tap to close
 *
 *  Mount once at the app shell level (e.g. in App.tsx).
 */

import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import * as Tone from 'tone';
import { Star, Coins, PartyPopper, Sparkles, Check } from 'lucide-react';
import { levelUpCoinBonus } from '../../core/xp';

/* ── Constants ── */

const LEVEL_UP_EVENT = 'pusselpaus:level-up';
const AUTO_DISMISS_MS = 5000;

/* ── Sound ── */

let synth: Tone.PolySynth | null = null;

function getSynth(): Tone.PolySynth {
  if (synth) return synth;
  synth = new Tone.PolySynth(Tone.FMSynth, {
    harmonicity: 3.5,
    modulationIndex: 2,
    oscillator: { type: 'sine' },
    modulation: { type: 'triangle' },
    envelope: { attack: 0.005, decay: 0.4, sustain: 0.08, release: 0.5 },
    modulationEnvelope: { attack: 0.002, decay: 0.1, sustain: 0, release: 0.06 },
  });
  synth.maxPolyphony = 10;
  const reverb = new Tone.Reverb({ decay: 1.8, wet: 0.3 }).toDestination();
  synth.connect(reverb);
  return synth;
}

async function playLevelUpSound(): Promise<void> {
  try {
    await Tone.start();
  } catch {
    return;
  }
  const s = getSynth();
  const now = Tone.now();

  // Triumphant ascending fanfare: C5 → E5 → G5 → C6 (hold)
  const notes = [
    { note: 'C5',  t: 0,    dur: '16n', vel: 0.5 },
    { note: 'E5',  t: 0.1,  dur: '16n', vel: 0.55 },
    { note: 'G5',  t: 0.2,  dur: '16n', vel: 0.6 },
    { note: 'C6',  t: 0.35, dur: '8n',  vel: 0.7 },
    // Chord shimmer
    { note: 'E5',  t: 0.5,  dur: '8n',  vel: 0.4 },
    { note: 'G5',  t: 0.5,  dur: '8n',  vel: 0.4 },
    { note: 'C6',  t: 0.5,  dur: '4n',  vel: 0.55 },
    // High sparkle
    { note: 'E6',  t: 0.7,  dur: '16n', vel: 0.35 },
    { note: 'G6',  t: 0.8,  dur: '8n',  vel: 0.3 },
  ];
  for (const { note, t, dur, vel } of notes) {
    s.triggerAttackRelease(note, dur, now + t, vel);
  }
}

/* ── Component ── */

interface LevelUpData {
  oldLevel: number;
  newLevel: number;
  coinBonus: number;
}

export default function LevelUpOverlay() {
  const [data, setData] = useState<LevelUpData | null>(null);
  const [visible, setVisible] = useState(false);

  /* ── Listen for level-up events ── */
  useEffect(() => {
    const handler = (e: Event) => {
      const { oldLevel, newLevel } = (e as CustomEvent<{ oldLevel: number; newLevel: number }>).detail;
      const coinBonus = levelUpCoinBonus(newLevel);
      setData({ oldLevel, newLevel, coinBonus });
      setVisible(true);

      void playLevelUpSound();

      // Confetti burst
      setTimeout(() => {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.45 },
          colors: ['#6366f1', '#818cf8', '#38bdf8', '#fbbf24', '#22c55e'],
        });
      }, 200);

      // Second burst
      setTimeout(() => {
        confetti({
          particleCount: 50,
          spread: 100,
          origin: { y: 0.5, x: 0.3 },
          colors: ['#fbbf24', '#f59e0b', '#eab308'],
        });
        confetti({
          particleCount: 50,
          spread: 100,
          origin: { y: 0.5, x: 0.7 },
          colors: ['#fbbf24', '#f59e0b', '#eab308'],
        });
      }, 700);
    };

    window.addEventListener(LEVEL_UP_EVENT, handler);
    return () => window.removeEventListener(LEVEL_UP_EVENT, handler);
  }, []);

  /* ── Auto-dismiss ── */
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => setVisible(false), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [visible]);

  const dismiss = useCallback(() => setVisible(false), []);

  return (
    <AnimatePresence>
      {visible && data && (
        <motion.div
          className="fixed inset-0 z-[9999] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          onClick={dismiss}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-surface/85 backdrop-blur-md" />

          {/* Radial glow */}
          <motion.div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(circle at 50% 45%, rgba(251,191,36,0.2) 0%, transparent 60%)',
            }}
            animate={{ opacity: [0.3, 0.7, 0.3] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          />

          {/* Content card */}
          <motion.div
            className="relative z-10 flex flex-col items-center gap-4 rounded-3xl bg-surface-card/90 px-8 py-10 shadow-2xl ring-1 ring-yellow-400/20"
            initial={{ scale: 0.5, y: 40, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.8, y: 20, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 18, delay: 0.1 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Star decoration */}
            <motion.div
              className="text-5xl"
              animate={{ rotate: [0, 8, -8, 0], scale: [1, 1.15, 1] }}
              transition={{ duration: 1.2, repeat: Infinity, repeatDelay: 0.8 }}
            >
              <Star className="h-12 w-12 text-yellow-400 fill-yellow-400" />
            </motion.div>

            {/* Title */}
            <motion.p
              className="text-sm font-bold uppercase tracking-widest text-yellow-300"
              initial={{ y: -10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              Level Up!
            </motion.p>

            {/* Level number */}
            <motion.div
              className="flex items-center gap-3"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 250, damping: 12, delay: 0.3 }}
            >
              <span className="text-2xl text-text-muted">Lv {data.oldLevel}</span>
              <motion.span
                className="text-2xl text-yellow-400"
                animate={{ x: [0, 4, 0] }}
                transition={{ duration: 0.6, repeat: Infinity }}
              >
                →
              </motion.span>
              <span className="text-5xl font-extrabold text-yellow-300 drop-shadow-lg">
                {data.newLevel}
              </span>
            </motion.div>

            {/* Coin bonus */}
            <motion.div
              className="flex items-center gap-2 rounded-xl bg-yellow-500/15 px-4 py-2 ring-1 ring-yellow-400/30"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              <Coins className="h-5 w-5 text-yellow-400" />
              <span className="text-sm font-bold text-yellow-200">
                +{data.coinBonus} coins bonus
              </span>
            </motion.div>

            {/* Milestone bonus callout */}
            {data.newLevel % 10 === 0 && (
              <motion.p
                className="flex items-center gap-1 text-xs font-semibold text-yellow-400/80"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.7 }}
              >
                <PartyPopper className="h-3.5 w-3.5" /> Milstolpe! Extra bonus för Level {data.newLevel}!
              </motion.p>
            )}
            {data.newLevel % 5 === 0 && data.newLevel % 10 !== 0 && (
              <motion.p
                className="flex items-center gap-1 text-xs font-semibold text-yellow-400/80"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.7 }}
              >
                <Sparkles className="h-3.5 w-3.5" /> Bonus för Level {data.newLevel}!
              </motion.p>
            )}

            {/* Dismiss hint */}
            <motion.p
              className="mt-2 text-[11px] text-text-muted"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              transition={{ delay: 1 }}
            >
              Tryck för att stänga
            </motion.p>

            {/* Close button */}
            <motion.button
              onClick={dismiss}
              className="mt-1 rounded-xl bg-success/20 px-6 py-2.5 text-sm font-semibold text-success transition hover:bg-success/30"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Check className="h-4 w-4" /> OK
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
