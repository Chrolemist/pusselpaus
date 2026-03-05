interface Props {
  elapsed: number;
  paused: boolean;
  onTogglePause: () => void;
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export default function Timer({ elapsed, paused, onTogglePause }: Props) {
  return (
    <button
      onClick={onTogglePause}
      className="flex items-center gap-2 rounded-lg bg-surface-card px-4 py-2 text-sm font-mono text-text-muted shadow transition active:scale-95"
      aria-label={paused ? 'Fortsätt' : 'Pausa'}
    >
      <span>{paused ? '▶️' : '⏸️'}</span>
      <span>{formatTime(elapsed)}</span>
    </button>
  );
}
