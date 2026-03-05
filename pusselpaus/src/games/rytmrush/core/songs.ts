/* ── RytmRush – Progressive endurance track ── */

import type { ChartNote, Song } from './types';

const LANE_NOTES = ['C4', 'D4', 'E4', 'G4'] as const;

function makeRng(seed = 1337) {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0xffffffff;
  };
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function createProgressiveNotes(durationSec = 210): ChartNote[] {
  const rng = makeRng();
  const notes: ChartNote[] = [];
  let time = 0;
  let lastLane = 0;

  while (time < durationSec) {
    const t = Math.min(time / durationSec, 1);

    const interval = lerp(0.72, 0.14, t);
    const holdChance = lerp(0.20, 0.03, t);
    const chordChance = t > 0.35 ? lerp(0.02, 0.34, (t - 0.35) / 0.65) : 0;

    let lane = Math.floor(rng() * 4);
    if (lane === lastLane && rng() < 0.7) {
      lane = (lane + 1 + Math.floor(rng() * 3)) % 4;
    }
    lastLane = lane;

    const isHold = rng() < holdChance;
    const holdDuration = isHold ? lerp(0.85, 0.28, t) : 0;

    notes.push({
      lane,
      time,
      note: LANE_NOTES[lane],
      type: isHold ? 'hold' : 'tap',
      duration: holdDuration,
    });

    if (rng() < chordChance) {
      let secondLane = Math.floor(rng() * 4);
      while (secondLane === lane) secondLane = Math.floor(rng() * 4);
      notes.push({
        lane: secondLane,
        time,
        note: LANE_NOTES[secondLane],
        type: 'tap',
        duration: 0,
      });
    }

    time += interval;
  }

  return notes.sort((a, b) => a.time - b.time);
}

const enduranceRush: Song = {
  id: 'endurance-rush',
  title: 'Endurance Rush',
  artist: 'PusselPaus',
  bpm: 126,
  lanes: 4,
  notes: createProgressiveNotes(210),
};

export const SONGS: Song[] = [enduranceRush];

export function getSong(id: string): Song | undefined {
  return SONGS.find((s) => s.id === id);
}
