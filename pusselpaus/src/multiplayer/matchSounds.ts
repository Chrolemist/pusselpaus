/* ── matchSounds – audio feedback for match events ──
 *
 *  Uses Tone.js (already present in the project) with lazy
 *  initialisation so we never create a synth until needed.
 *
 *  playMatchFound()  – dramatic ascending arpeggio (match accept screen)
 *  playAcceptTick()  – soft positive blip (player accepted)
 *  playCountdownTick() – subtle metronome tick (countdown timer)
 */

import * as Tone from 'tone';

/* ── Lazy singleton synth ── */

let synth: Tone.PolySynth | null = null;

function getSynth(): Tone.PolySynth {
  if (synth) return synth;

  synth = new Tone.PolySynth(Tone.FMSynth, {
    harmonicity: 3,
    modulationIndex: 2,
    oscillator: { type: 'sine' },
    modulation: { type: 'sine' },
    envelope: {
      attack: 0.005,
      decay: 0.5,
      sustain: 0.05,
      release: 0.6,
    },
    modulationEnvelope: {
      attack: 0.002,
      decay: 0.12,
      sustain: 0,
      release: 0.08,
    },
  });
  synth.maxPolyphony = 12;

  const reverb = new Tone.Reverb({ decay: 1.5, wet: 0.25 }).toDestination();
  synth.connect(reverb);

  return synth;
}

/* ── Ensure AudioContext ── */
let audioReady = false;

async function ensureAudio(): Promise<boolean> {
  if (audioReady) return true;
  try {
    await Tone.start();
    audioReady = true;
    return true;
  } catch {
    return false;
  }
}

/* ── Public API ── */

/**
 * Dramatic rising arpeggio played when a match is found.
 * C5 → E5 → G5 → B5 → C6  (ascending major 7th)
 */
export async function playMatchFound(): Promise<void> {
  if (!(await ensureAudio())) return;
  const s = getSynth();
  const now = Tone.now();

  const notes: { note: string; time: number; dur: string; vel: number }[] = [
    { note: 'C5',  time: 0,    dur: '16n', vel: 0.5 },
    { note: 'E5',  time: 0.08, dur: '16n', vel: 0.55 },
    { note: 'G5',  time: 0.16, dur: '16n', vel: 0.6 },
    { note: 'B5',  time: 0.26, dur: '16n', vel: 0.65 },
    { note: 'C6',  time: 0.38, dur: '8n',  vel: 0.75 },
    // Chord flourish
    { note: 'E5',  time: 0.55, dur: '8n',  vel: 0.5 },
    { note: 'G5',  time: 0.55, dur: '8n',  vel: 0.5 },
    { note: 'C6',  time: 0.55, dur: '4n',  vel: 0.65 },
  ];

  for (const { note, time, dur, vel } of notes) {
    s.triggerAttackRelease(note, dur, now + time, vel);
  }
}

/**
 * Soft positive blip when a player clicks accept.
 */
export async function playAcceptTick(): Promise<void> {
  if (!(await ensureAudio())) return;
  const s = getSynth();
  s.triggerAttackRelease('G5', '32n', Tone.now(), 0.35);
}

/**
 * Subtle low tick for the countdown timer.
 */
export async function playCountdownTick(): Promise<void> {
  if (!(await ensureAudio())) return;
  const s = getSynth();
  s.triggerAttackRelease('C4', '32n', Tone.now(), 0.2);
}

/**
 * Bright confirm sting when both players are locked for a rematch.
 */
export async function playRematchStart(): Promise<void> {
  if (!(await ensureAudio())) return;
  const s = getSynth();
  const now = Tone.now();

  s.triggerAttackRelease('G4', '16n', now, 0.32);
  s.triggerAttackRelease('B4', '16n', now + 0.08, 0.38);
  s.triggerAttackRelease(['D5', 'G5'], '8n', now + 0.18, 0.46);
}

/** Clean up synth (call on unmount if desired). */
export function disposeMatchSounds(): void {
  synth?.dispose();
  synth = null;
  audioReady = false;
}
