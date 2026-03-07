let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtor) return null;
  if (!audioContext) audioContext = new AudioCtor();
  return audioContext;
}

function playTone(options: {
  frequency: number;
  durationMs: number;
  type?: OscillatorType;
  gain?: number;
  rampTo?: number;
}) {
  const ctx = getAudioContext();
  if (!ctx) return;
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();
  const now = ctx.currentTime;

  oscillator.type = options.type ?? 'sine';
  oscillator.frequency.setValueAtTime(options.frequency, now);
  if (options.rampTo != null) {
    oscillator.frequency.exponentialRampToValueAtTime(options.rampTo, now + options.durationMs / 1000);
  }

  gainNode.gain.setValueAtTime(0.0001, now);
  gainNode.gain.exponentialRampToValueAtTime(options.gain ?? 0.05, now + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + options.durationMs / 1000);

  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);
  oscillator.start(now);
  oscillator.stop(now + options.durationMs / 1000 + 0.03);
}

export function playPaddleHit(): void {
  playTone({ frequency: 540, rampTo: 760, durationMs: 70, type: 'triangle', gain: 0.045 });
}

export function playWallBounce(): void {
  playTone({ frequency: 300, rampTo: 220, durationMs: 50, type: 'sine', gain: 0.025 });
}

export function playScoreBurst(): void {
  playTone({ frequency: 420, rampTo: 880, durationMs: 140, type: 'square', gain: 0.05 });
  window.setTimeout(() => {
    playTone({ frequency: 660, rampTo: 1180, durationMs: 130, type: 'triangle', gain: 0.035 });
  }, 60);
}

export function playServePulse(): void {
  playTone({ frequency: 460, rampTo: 520, durationMs: 65, type: 'sine', gain: 0.03 });
}

export function playVictoryFanfare(): void {
  playTone({ frequency: 523, rampTo: 784, durationMs: 180, type: 'triangle', gain: 0.05 });
  window.setTimeout(() => playTone({ frequency: 659, rampTo: 988, durationMs: 200, type: 'triangle', gain: 0.05 }), 90);
  window.setTimeout(() => playTone({ frequency: 784, rampTo: 1174, durationMs: 240, type: 'triangle', gain: 0.055 }), 180);
}