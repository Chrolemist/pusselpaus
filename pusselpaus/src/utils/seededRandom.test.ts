/* ── Seeded random – determinism tests ──
 *
 *  If these fail, multiplayer fairness is broken (players get different puzzles).
 */

import { describe, it, expect } from 'vitest';
import { createSeededRandom, normalizeSeed } from '../utils/seededRandom';

describe('createSeededRandom', () => {
  it('produces the same sequence for the same seed', () => {
    const rng1 = createSeededRandom(42);
    const rng2 = createSeededRandom(42);
    const seq1 = Array.from({ length: 20 }, () => rng1());
    const seq2 = Array.from({ length: 20 }, () => rng2());
    expect(seq1).toEqual(seq2);
  });

  it('produces different sequences for different seeds', () => {
    const rng1 = createSeededRandom(42);
    const rng2 = createSeededRandom(99);
    const seq1 = Array.from({ length: 10 }, () => rng1());
    const seq2 = Array.from({ length: 10 }, () => rng2());
    expect(seq1).not.toEqual(seq2);
  });

  it('returns values in [0, 1) range', () => {
    const rng = createSeededRandom(123);
    for (let i = 0; i < 1000; i++) {
      const val = rng();
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    }
  });

  it('has reasonable distribution', () => {
    const rng = createSeededRandom(7);
    let low = 0;
    let high = 0;
    const N = 10_000;
    for (let i = 0; i < N; i++) {
      if (rng() < 0.5) low++;
      else high++;
    }
    // Should be roughly 50/50 (±5%)
    expect(low / N).toBeCloseTo(0.5, 1);
    expect(high / N).toBeCloseTo(0.5, 1);
  });
});

describe('normalizeSeed', () => {
  it('converts a number to a positive integer', () => {
    expect(normalizeSeed(42)).toBe(42);
  });

  it('handles negative numbers', () => {
    expect(normalizeSeed(-100)).toBeGreaterThan(0);
  });

  it('handles zero', () => {
    const result = normalizeSeed(0);
    expect(Number.isFinite(result)).toBe(true);
    expect(result).toBeGreaterThanOrEqual(0);
  });
});
