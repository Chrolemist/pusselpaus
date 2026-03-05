/* ── RytmRush – Lane display with scrolling blocks ── */

import { motion, AnimatePresence } from 'motion/react';
import type { BlockState } from '../core/types';
import { SCROLL_TIME, LANE_COLORS } from '../core/types';

interface LaneProps {
  laneIndex: number;
  blocks: BlockState[];
  transportTime: number;
  active: boolean;            // key is held down
  laneCount: number;
}

/**
 * Block position: 0 = top (spawn), 1 = hit zone.
 * position = (transportTime - (noteTime - SCROLL_TIME)) / SCROLL_TIME
 */
function getPositionPercent(noteTime: number, transportTime: number): number {
  const elapsed = transportTime - (noteTime - SCROLL_TIME);
  return (elapsed / SCROLL_TIME) * 100;
}

export default function Lane({ laneIndex, blocks, transportTime, active, laneCount }: LaneProps) {
  const color = LANE_COLORS[laneIndex];
  const laneWidth = `${100 / laneCount}%`;

  return (
    <div
      className="relative h-full overflow-hidden"
      style={{ width: laneWidth }}
    >
      {/* Lane background line */}
      <div
        className="absolute inset-0 border-x border-white/5"
      />

      {/* Hit zone glow */}
      <div
        className="absolute bottom-0 left-0 right-0 h-16 z-10"
        style={{
          background: active
            ? `linear-gradient(to top, ${color}44, transparent)`
            : 'linear-gradient(to top, rgba(255,255,255,0.05), transparent)',
          transition: 'background 0.1s',
        }}
      />

      {/* Hit zone marker */}
      <div
        className="absolute bottom-14 left-1 right-1 h-1 rounded-full z-10"
        style={{
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
          if (pos < -10 || pos > 130) return null;

          const isHold = block.chartNote.type === 'hold';
          const holdHeightPercent = isHold
            ? (block.chartNote.duration / SCROLL_TIME) * 100
            : 0;

          // Grade-based styling
          const isPerfect = block.grade === 'perfect';
          const isGreat = block.grade === 'great';
          const isGood = block.grade === 'good';
          const isMiss = block.grade === 'miss';
          const isHit = isPerfect || isGreat || isGood;

          if (isMiss) {
            return (
              <motion.div
                key={block.id}
                className="absolute left-1 right-1 rounded-lg"
                style={{
                  bottom: `calc(${100 - pos}%)`,
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
                  bottom: `calc(${100 - pos}%)`,
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

          // Unjudged block – still scrolling
          return (
            <motion.div
              key={block.id}
              className="absolute left-1 right-1 rounded-lg flex items-end"
              style={{
                bottom: `calc(${100 - pos}%)`,
                height: isHold ? `calc(${holdHeightPercent}% + 2.5rem)` : '2.5rem',
                backgroundColor: `${color}cc`,
                boxShadow: `0 0 8px ${color}55`,
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
