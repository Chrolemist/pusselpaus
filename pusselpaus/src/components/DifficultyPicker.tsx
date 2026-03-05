import type { Difficulty } from '../core/types';

interface Props {
  current: Difficulty;
  onSelect: (d: Difficulty) => void;
}

const LEVELS: { key: Difficulty; label: string }[] = [
  { key: 'easy', label: 'Lätt' },
  { key: 'medium', label: 'Medel' },
  { key: 'hard', label: 'Svår' },
  { key: 'expert', label: 'Expert' },
];

export default function DifficultyPicker({ current, onSelect }: Props) {
  return (
    <div className="flex gap-2">
      {LEVELS.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => onSelect(key)}
          className={`rounded-full px-3 py-1 text-xs font-semibold transition active:scale-95 ${
            current === key
              ? 'bg-brand text-white shadow-md'
              : 'bg-surface-card text-text-muted hover:text-text'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
