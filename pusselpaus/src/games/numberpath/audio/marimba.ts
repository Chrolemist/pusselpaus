/* ── Sifferstigen – adaptive marimba audio (Tone.js) ── */

import * as Tone from 'tone';

/* ── C major scale notes spanning multiple octaves ── */
const C_MAJOR = [
  'C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4',
  'C5', 'D5', 'E5', 'F5', 'G5', 'A5', 'B5',
  'C6', 'D6', 'E6', 'F6', 'G6', 'A6', 'B6',
  'C7',
];

/* ── Victory melody ── */
const WIN_MELODY: { note: string; duration: string; time: number }[] = [
  { note: 'C5', duration: '16n', time: 0 },
  { note: 'E5', duration: '16n', time: 0.1 },
  { note: 'G5', duration: '16n', time: 0.2 },
  { note: 'C6', duration: '8n', time: 0.35 },
  { note: 'G5', duration: '16n', time: 0.55 },
  { note: 'C6', duration: '4n', time: 0.7 },
];

let marimba: Tone.PolySynth | null = null;
let audioReady = false;

/**
 * Build a marimba-like PolySynth.
 * Uses FMSynth with short envelope + quick modulation decay
 * to emulate the percussive, bright tone of a marimba bar.
 */
function getMarimba(): Tone.PolySynth {
  if (marimba) return marimba;

  marimba = new Tone.PolySynth(Tone.FMSynth, {
    harmonicity: 4,
    modulationIndex: 2.5,
    oscillator: { type: 'sine' },
    modulation: { type: 'sine' },
    envelope: {
      attack: 0.001,
      decay: 0.6,
      sustain: 0,
      release: 0.4,
    },
    modulationEnvelope: {
      attack: 0.001,
      decay: 0.15,
      sustain: 0,
      release: 0.1,
    },
  });
  marimba.maxPolyphony = 8;

  // Slight reverb for warmth
  const reverb = new Tone.Reverb({ decay: 1.2, wet: 0.2 }).toDestination();
  marimba.connect(reverb);

  return marimba;
}

/** Ensure AudioContext is running (must be called from a user gesture). */
export async function ensureAudio(): Promise<void> {
  if (audioReady) return;
  await Tone.start();
  audioReady = true;
}

/**
 * Play the scale note for the given step.
 * Steps wrap through C major across octaves.
 */
export function playStepNote(step: number): void {
  if (!audioReady) return;
  const synth = getMarimba();
  const note = C_MAJOR[step % C_MAJOR.length];
  synth.triggerAttackRelease(note, '16n', Tone.now(), 0.7);
}

/**
 * Play the undo sound – a soft descending tone.
 */
export function playUndoNote(step: number): void {
  if (!audioReady) return;
  const synth = getMarimba();
  const note = C_MAJOR[Math.max(0, step) % C_MAJOR.length];
  synth.triggerAttackRelease(note, '32n', Tone.now(), 0.3);
}

/**
 * Play a short, happy victory melody.
 */
export function playWinMelody(): void {
  if (!audioReady) return;
  const synth = getMarimba();
  const now = Tone.now();
  for (const { note, duration, time } of WIN_MELODY) {
    synth.triggerAttackRelease(note, duration, now + time, 0.8);
  }
}

/** Clean up the synth (e.g. on unmount). */
export function disposeAudio(): void {
  marimba?.dispose();
  marimba = null;
  audioReady = false;
}
