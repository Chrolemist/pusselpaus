/* ── RytmRush – Marimba audio engine (Tone.js) ── */

import * as Tone from 'tone';

let marimba: Tone.PolySynth | null = null;
let audioReady = false;

/**
 * Build a marimba-like PolySynth tuned for the rhythm game.
 * Same sound design as Sifferstigen's marimba but independently managed
 * so neither game interferes with the other.
 */
export function getMarimba(): Tone.PolySynth {
  if (marimba) return marimba;

  marimba = new Tone.PolySynth(Tone.FMSynth, {
    harmonicity: 4,
    modulationIndex: 2.5,
    oscillator: { type: 'sine' },
    modulation: { type: 'sine' },
    envelope: {
      attack: 0.001,
      decay: 0.6,
      sustain: 0.15,   // slightly sustained for holds
      release: 0.4,
    },
    modulationEnvelope: {
      attack: 0.001,
      decay: 0.15,
      sustain: 0,
      release: 0.1,
    },
  });
  marimba.maxPolyphony = 12;

  const reverb = new Tone.Reverb({ decay: 1.4, wet: 0.25 }).toDestination();
  marimba.connect(reverb);

  return marimba;
}

/** Ensure AudioContext is running (must be called from a user gesture). */
export async function ensureAudio(): Promise<void> {
  if (audioReady) return;
  await Tone.start();
  audioReady = true;
}

/** Play a quick win jingle. */
export function playWinJingle(): void {
  if (!audioReady) return;
  const synth = getMarimba();
  const now = Tone.now();
  const notes = [
    { note: 'C5', time: 0, dur: '16n' },
    { note: 'E5', time: 0.1, dur: '16n' },
    { note: 'G5', time: 0.2, dur: '16n' },
    { note: 'C6', time: 0.35, dur: '8n' },
  ];
  for (const n of notes) {
    synth.triggerAttackRelease(n.note, n.dur, now + n.time, 0.8);
  }
}

/** Clean up the synth. */
export function disposeAudio(): void {
  marimba?.dispose();
  marimba = null;
  audioReady = false;
}
