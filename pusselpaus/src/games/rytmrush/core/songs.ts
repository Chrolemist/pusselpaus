/* ── RytmRush – Built-in song charts ── */

import type { Song } from './types';

/**
 * "Stjärnklart" - an original C-major melody at 120 BPM.
 * Mix of taps and holds across 4 lanes, ~30 seconds.
 * Beat = 0.5s at 120 BPM.
 */
const stjarnklart: Song = {
  id: 'stjarnklart',
  title: 'Stjärnklart',
  artist: 'PusselPaus',
  bpm: 120,
  lanes: 4,
  notes: [
    // Intro - simple taps, one per beat (bars 1-2)
    { lane: 0, time: 0.0,  note: 'C4', type: 'tap', duration: 0 },
    { lane: 1, time: 0.5,  note: 'D4', type: 'tap', duration: 0 },
    { lane: 2, time: 1.0,  note: 'E4', type: 'tap', duration: 0 },
    { lane: 3, time: 1.5,  note: 'F4', type: 'tap', duration: 0 },
    { lane: 2, time: 2.0,  note: 'G4', type: 'tap', duration: 0 },
    { lane: 1, time: 2.5,  note: 'A4', type: 'tap', duration: 0 },
    { lane: 0, time: 3.0,  note: 'B4', type: 'tap', duration: 0 },
    { lane: 1, time: 3.5,  note: 'C5', type: 'tap', duration: 0 },

    // Verse 1 - ascending with holds (bars 3-4)
    { lane: 0, time: 4.0,  note: 'C4', type: 'hold', duration: 1.0 },
    { lane: 2, time: 5.0,  note: 'E4', type: 'tap', duration: 0 },
    { lane: 3, time: 5.5,  note: 'F4', type: 'tap', duration: 0 },
    { lane: 1, time: 6.0,  note: 'D4', type: 'hold', duration: 1.0 },
    { lane: 3, time: 7.0,  note: 'G4', type: 'tap', duration: 0 },
    { lane: 0, time: 7.5,  note: 'C4', type: 'tap', duration: 0 },

    // Chorus - faster taps (bars 5-6)
    { lane: 2, time: 8.0,  note: 'E5', type: 'tap', duration: 0 },
    { lane: 3, time: 8.25, note: 'F5', type: 'tap', duration: 0 },
    { lane: 2, time: 8.5,  note: 'E5', type: 'tap', duration: 0 },
    { lane: 1, time: 8.75, note: 'D5', type: 'tap', duration: 0 },
    { lane: 0, time: 9.0,  note: 'C5', type: 'hold', duration: 0.75 },
    { lane: 3, time: 10.0, note: 'G5', type: 'tap', duration: 0 },
    { lane: 2, time: 10.5, note: 'E5', type: 'tap', duration: 0 },
    { lane: 1, time: 11.0, note: 'D5', type: 'tap', duration: 0 },
    { lane: 0, time: 11.5, note: 'C5', type: 'tap', duration: 0 },

    // Bridge - syncopation + holds (bars 7-8)
    { lane: 1, time: 12.0, note: 'D4', type: 'tap', duration: 0 },
    { lane: 3, time: 12.25, note: 'G4', type: 'tap', duration: 0 },
    { lane: 0, time: 12.5, note: 'C4', type: 'tap', duration: 0 },
    { lane: 2, time: 13.0, note: 'E4', type: 'hold', duration: 1.5 },
    { lane: 1, time: 14.5, note: 'A4', type: 'tap', duration: 0 },
    { lane: 3, time: 15.0, note: 'B4', type: 'tap', duration: 0 },
    { lane: 0, time: 15.5, note: 'C5', type: 'tap', duration: 0 },

    // Verse 2 - wider spread (bars 9-10)
    { lane: 0, time: 16.0, note: 'C4', type: 'tap', duration: 0 },
    { lane: 3, time: 16.5, note: 'G4', type: 'tap', duration: 0 },
    { lane: 0, time: 17.0, note: 'C5', type: 'tap', duration: 0 },
    { lane: 3, time: 17.5, note: 'G5', type: 'tap', duration: 0 },
    { lane: 1, time: 18.0, note: 'E4', type: 'hold', duration: 1.0 },
    { lane: 2, time: 19.0, note: 'F4', type: 'tap', duration: 0 },
    { lane: 3, time: 19.5, note: 'G4', type: 'tap', duration: 0 },

    // Final chorus - dense (bars 11-12)
    { lane: 0, time: 20.0, note: 'C5', type: 'tap', duration: 0 },
    { lane: 1, time: 20.25, note: 'D5', type: 'tap', duration: 0 },
    { lane: 2, time: 20.5, note: 'E5', type: 'tap', duration: 0 },
    { lane: 3, time: 20.75, note: 'F5', type: 'tap', duration: 0 },
    { lane: 2, time: 21.0, note: 'E5', type: 'hold', duration: 1.0 },
    { lane: 0, time: 22.0, note: 'C5', type: 'tap', duration: 0 },
    { lane: 1, time: 22.5, note: 'D5', type: 'tap', duration: 0 },
    { lane: 3, time: 23.0, note: 'G5', type: 'tap', duration: 0 },

    // Outro - descending, slower (bars 13-15)
    { lane: 3, time: 24.0, note: 'G5', type: 'tap', duration: 0 },
    { lane: 2, time: 24.5, note: 'E5', type: 'tap', duration: 0 },
    { lane: 1, time: 25.0, note: 'D5', type: 'tap', duration: 0 },
    { lane: 0, time: 25.5, note: 'C5', type: 'hold', duration: 1.5 },
    { lane: 2, time: 27.0, note: 'E4', type: 'tap', duration: 0 },
    { lane: 1, time: 27.5, note: 'D4', type: 'tap', duration: 0 },
    { lane: 0, time: 28.0, note: 'C4', type: 'hold', duration: 2.0 },
  ],
};

/**
 * "Morgondimma" – a slower, dreamy piece at 90 BPM.
 * More holds, fewer fast taps.
 */
const morgondimma: Song = {
  id: 'morgondimma',
  title: 'Morgondimma',
  artist: 'PusselPaus',
  bpm: 90,
  lanes: 4,
  notes: [
    // Slow intro
    { lane: 0, time: 0.0,   note: 'C4',  type: 'hold', duration: 1.33 },
    { lane: 2, time: 1.33,  note: 'E4',  type: 'hold', duration: 1.33 },
    { lane: 1, time: 2.67,  note: 'G4',  type: 'tap',  duration: 0 },
    { lane: 3, time: 3.33,  note: 'A4',  type: 'tap',  duration: 0 },

    // Build
    { lane: 0, time: 4.0,   note: 'C4',  type: 'tap',  duration: 0 },
    { lane: 1, time: 4.67,  note: 'D4',  type: 'tap',  duration: 0 },
    { lane: 2, time: 5.33,  note: 'E4',  type: 'tap',  duration: 0 },
    { lane: 3, time: 6.0,   note: 'F4',  type: 'hold', duration: 2.0 },
    { lane: 0, time: 8.0,   note: 'G4',  type: 'tap',  duration: 0 },
    { lane: 1, time: 8.67,  note: 'A4',  type: 'tap',  duration: 0 },

    // Melody
    { lane: 2, time: 9.33,  note: 'B4',  type: 'tap',  duration: 0 },
    { lane: 3, time: 10.0,  note: 'C5',  type: 'hold', duration: 1.33 },
    { lane: 1, time: 11.33, note: 'A4',  type: 'tap',  duration: 0 },
    { lane: 0, time: 12.0,  note: 'G4',  type: 'tap',  duration: 0 },
    { lane: 2, time: 12.67, note: 'E4',  type: 'hold', duration: 1.33 },
    { lane: 3, time: 14.0,  note: 'F4',  type: 'tap',  duration: 0 },
    { lane: 1, time: 14.67, note: 'D4',  type: 'tap',  duration: 0 },

    // Climax
    { lane: 0, time: 16.0,  note: 'C5',  type: 'tap',  duration: 0 },
    { lane: 2, time: 16.67, note: 'E5',  type: 'tap',  duration: 0 },
    { lane: 3, time: 17.33, note: 'G5',  type: 'hold', duration: 2.0 },
    { lane: 1, time: 19.33, note: 'F5',  type: 'tap',  duration: 0 },
    { lane: 0, time: 20.0,  note: 'E5',  type: 'tap',  duration: 0 },
    { lane: 2, time: 20.67, note: 'D5',  type: 'tap',  duration: 0 },
    { lane: 3, time: 21.33, note: 'C5',  type: 'hold', duration: 2.67 },
  ],
};

export const SONGS: Song[] = [stjarnklart, morgondimma];

export function getSong(id: string): Song | undefined {
  return SONGS.find((s) => s.id === id);
}
