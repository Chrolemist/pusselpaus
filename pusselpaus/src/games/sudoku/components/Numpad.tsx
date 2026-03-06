import { Delete, PenLine } from 'lucide-react';

interface Props {
  onNumber: (n: number) => void;
  onErase: () => void;
  onToggleNotes: () => void;
  noteMode: boolean;
  disabled: boolean;
}

export default function Numpad({
  onNumber,
  onErase,
  onToggleNotes,
  noteMode,
  disabled,
}: Props) {
  return (
    <div className="flex w-full max-w-[min(90vw,400px)] flex-col gap-2">
      <div className="grid grid-cols-9 gap-1.5">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <button
            key={n}
            data-tour={`numpad-${n}`}
            disabled={disabled}
            onClick={() => onNumber(n)}
            className="flex aspect-square items-center justify-center rounded-lg bg-surface-card text-lg font-bold text-text shadow transition active:scale-95 disabled:opacity-30"
          >
            {n}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          disabled={disabled}
          onClick={onErase}
          className="flex items-center justify-center gap-2 rounded-lg bg-surface-card py-3 text-sm font-medium text-text-muted shadow transition active:scale-95 disabled:opacity-30"
        >
          <Delete className="h-4 w-4" /> Sudda
        </button>
        <button
          disabled={disabled}
          onClick={onToggleNotes}
          className={`flex items-center justify-center gap-2 rounded-lg py-3 text-sm font-medium shadow transition active:scale-95 disabled:opacity-30 ${
            noteMode
              ? 'bg-brand text-white'
              : 'bg-surface-card text-text-muted'
          }`}
        >
          <PenLine className="h-4 w-4" /> Anteckna {noteMode ? 'PÅ' : 'AV'}
        </button>
      </div>
    </div>
  );
}
