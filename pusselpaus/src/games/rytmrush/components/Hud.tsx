/* ── RytmRush – HUD overlay (score, combo, grade flash) ── */

import { motion, AnimatePresence } from 'motion/react';
import type { HitGrade } from '../core/types';

interface HudProps {
  score: number;
  combo: number;
  lastGrade: HitGrade | null;
  /** Monotonically increasing number that changes each time a grade is judged */
  gradeSeq: number;
}

const GRADE_CONFIG: Record<HitGrade, { label: string; color: string }> = {
  perfect: { label: 'PERFEKT!', color: '#22c55e' },
  great:   { label: 'BRA!', color: '#38bdf8' },
  good:    { label: 'OK', color: '#facc15' },
  miss:    { label: 'MISS', color: '#ef4444' },
};

export default function Hud({ score, combo, lastGrade, gradeSeq }: HudProps) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-between py-4">
      {/* Top: score */}
      <div className="text-center">
        <p className="font-mono text-2xl font-bold text-white drop-shadow-lg">
          {Math.round(score).toLocaleString('sv-SE')}
        </p>
      </div>

      {/* Center: grade flash + combo */}
      <div className="flex flex-col items-center gap-1">
        <AnimatePresence mode="wait">
          {lastGrade && (
            <motion.p
              key={`${lastGrade}-${gradeSeq}`}
              className="text-3xl font-extrabold drop-shadow-lg"
              style={{ color: GRADE_CONFIG[lastGrade].color }}
              initial={{ scale: 0.5, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
            >
              {GRADE_CONFIG[lastGrade].label}
            </motion.p>
          )}
        </AnimatePresence>

        {combo > 1 && (
          <motion.p
            key={combo}
            className="text-lg font-bold text-brand-light drop-shadow"
            initial={{ scale: 1.3 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 15 }}
          >
            {combo}x COMBO
          </motion.p>
        )}
      </div>

      {/* Spacer */}
      <div />
    </div>
  );
}
