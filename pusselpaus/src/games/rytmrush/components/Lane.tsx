/* ── RytmRush – Lane display with scrolling blocks ── */

import { motion, AnimatePresence } from 'motion/react';
import type { BlockState } from '../core/types';
import { SCROLL_TIME, LANE_COLORS, HIT_ZONE_BOTTOM } from '../core/types';

interface LaneProps {
  laneIndex: number;
  blocks: BlockState[];
  transportTime: number;
  active: boolean;            // key is held down
  laneCount: number;
  onPointerDown?: () => void;
  onPointerUp?: () => void;
}

/**
 * Scroll-zone scale factor.
 * The visible travel distance (top → hit-zone) occupies
 * (100 - HIT_ZONE_BOTTOM)% of the lane height.
 */
const SCALE = (100 - HIT_ZONE_BOTTOM) / 100;

/**
 * Block position: 0 = top (spawn), 100 = hit zone.
 * Values > 100 mean the block has passed the hit zone.
 */
function getPositionPercent(noteTime: number, transportTime: number): number {
  const elapsed = transportTime - (noteTime - SCROLL_TIME);
  return (elapsed / SCROLL_TIME) * 100;
}

/* ── Deterministic per-block wave parameters ── */
const WAVE_SEEDS = [
  { amp: 18, freq: 2.6, phase: 0 },
  { amp: 14, freq: 3.2, phase: 1.8 },
  { amp: 20, freq: 2.0, phase: 3.5 },
  { amp: 12, freq: 3.8, phase: 0.9 },
  { amp: 16, freq: 2.4, phase: 5.1 },
  { amp: 22, freq: 1.7, phase: 2.4 },
  { amp: 10, freq: 4.0, phase: 4.2 },
  { amp: 19, freq: 2.9, phase: 1.1 },
] as const;

/**
 * Wavy horizontal offset (px) for a block.
 * Uses a sine wave that dampens to 0 when the block is near
 * the hit zone (pos ≥ 80) so it doesn't interfere with accuracy.
 * Every ~3rd block is straight (no wave) for variety.
 */
function getWaveOffsetX(blockIndex: number, pos: number): number {
  // Every 3rd block is straight
  if (blockIndex % 3 === 0) return 0;
  const seed = WAVE_SEEDS[blockIndex % WAVE_SEEDS.length];
  // Dampen near hit zone: full wave until pos 60, fades to 0 at pos 95
  const dampen = pos > 60 ? Math.max(0, 1 - (pos - 60) / 35) : 1;
  return Math.sin(pos * 0.06 * seed.freq + seed.phase) * seed.amp * dampen;
}

export default function Lane({ laneIndex, blocks, transportTime, active, laneCount, onPointerDown, onPointerUp }: LaneProps) {
  const color = LANE_COLORS[laneIndex];
  const laneWidth = `${100 / laneCount}%`;

  return (
    <div
      className="relative h-full overflow-hidden"
      style={{ width: laneWidth, touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      {/* Lane background line */}
      <div
        className="absolute inset-0 border-x border-white/5"
      />

      {/* Dark fade below the hit zone */}
      <div
        className="absolute left-0 right-0 bottom-0 z-[5]"
        style={{
          height: `${HIT_ZONE_BOTTOM}%`,
          background: 'linear-gradient(to bottom, transparent, rgba(0,0,0,0.5))',
        }}
      />

      {/* Hit zone glow */}
      <div
        className="absolute left-0 right-0 h-20 z-10"
        style={{
          bottom: `${HIT_ZONE_BOTTOM - 4}%`,
          background: active
            ? `linear-gradient(to top, ${color}44, transparent)`
            : 'linear-gradient(to top, rgba(255,255,255,0.05), transparent)',
          transition: 'background 0.1s',
        }}
      />

      {/* Hit zone marker */}
      <div
        className="absolute left-1 right-1 h-1 rounded-full z-10"
        style={{
          bottom: `${HIT_ZONE_BOTTOM}%`,
          backgroundColor: active ? color : 'rgba(255,255,255,0.2)',
          boxShadow: active ? `0 0 12px ${color}` : 'none',
          transition: 'all 0.1s',
        }}
      />

      {/* Blocks */}
      <AnimatePresence>
        {blocks.map((block) => {
          const pos = getPositionPercent(block.chartNote.time, transportTime);

          // Off-screen: not spawned yet or way past
          if (pos < -10 || pos > 140) return null;

          const isHold = block.chartNote.type === 'hold';
          const holdHeightPercent = isHold
            ? ((block.chartNote.duration / SCROLL_TIME) * 100) * SCALE
            : 0;

          // Grade-based styling
          const isPerfect = block.grade === 'perfect';
          const isGreat = block.grade === 'great';
          const isGood = block.grade === 'good';
          const isMiss = block.grade === 'miss';
          const isHit = isPerfect || isGreat || isGood;

          /** Scaled bottom-% so pos 100 → HIT_ZONE_BOTTOM% from bottom */
          const bottomPct = 100 - pos * SCALE;

          // Wavy x-offset for unjudged blocks
          const blockIdx = blocks.indexOf(block);
          const waveX = getWaveOffsetX(blockIdx, pos);

          if (isMiss) {
            return (
              <motion.div
                key={block.id}
                className="absolute left-1 right-1 rounded-lg"
                style={{
                  bottom: `calc(${bottomPct}%)`,
                  height: isHold ? `calc(${holdHeightPercent}% + 2.5rem)` : '2.5rem',
                  backgroundColor: `${color}33`,
                }}
                initial={{ opacity: 1 }}
                animate={{
                  opacity: 0,
                  x: [0, -6, 6, -4, 4, 0],
                }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4 }}
              />
            );
          }

          if (isHit) {
            return (
              <motion.div
                key={block.id}
                className="absolute left-1 right-1 rounded-lg"
                style={{
                  bottom: `calc(${bottomPct}%)`,
                  height: isHold ? `calc(${holdHeightPercent}% + 2.5rem)` : '2.5rem',
                  backgroundColor: color,
                }}
                initial={{ scale: 1, opacity: 0.9 }}
                animate={{
                  scale: isPerfect ? [1, 1.3, 0] : [1, 1.15, 0],
                  opacity: [0.9, 1, 0],
                  boxShadow: isPerfect
                    ? [`0 0 0px ${color}`, `0 0 30px ${color}`, `0 0 0px ${color}`]
                    : undefined,
                }}
                exit={{ opacity: 0 }}
                transition={{ duration: isPerfect ? 0.4 : 0.3 }}
              />
            );
          }

          // Unjudged block – still scrolling with wavy motion
          return (
            <motion.div
              key={block.id}
              className="absolute left-1 right-1 rounded-lg flex items-end"
              style={{
                bottom: `calc(${bottomPct}%)`,
                height: isHold ? `calc(${holdHeightPercent}% + 2.5rem)` : '2.5rem',
                backgroundColor: `${color}cc`,
                boxShadow: `0 0 8px ${color}55`,
                transform: `translateX(${waveX}px)`,
              }}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.15 }}
            >
              {/* Hold tail indicator */}
              {isHold && (
                <div
                  className="absolute top-0 left-2 right-2 bottom-10 rounded-t-lg"
                  style={{ backgroundColor: `${color}66` }}
                />
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
