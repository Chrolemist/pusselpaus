import type { Board as BoardType } from '../core/types';
import { row, col, box } from '../core/types';

interface Props {
  board: BoardType;
  selectedIndex: number | null;
  conflicts: Set<number>;
  paused: boolean;
  onSelect: (index: number) => void;
}

export default function SudokuBoard({
  board,
  selectedIndex,
  conflicts,
  paused,
  onSelect,
}: Props) {
  if (paused) {
    return (
      <div className="flex aspect-square w-full max-w-[min(90vw,400px)] items-center justify-center rounded-xl bg-surface-card text-2xl font-semibold text-text-muted">
        ⏸️ Pausat
      </div>
    );
  }

  const selectedRow = selectedIndex !== null ? row(selectedIndex) : -1;
  const selectedCol = selectedIndex !== null ? col(selectedIndex) : -1;
  const selectedBox = selectedIndex !== null ? box(selectedIndex) : -1;
  const selectedValue =
    selectedIndex !== null ? board[selectedIndex].value : 0;

  return (
    <div
      data-tour="sudoku-board"
      className="grid aspect-square w-full max-w-[min(90vw,400px)] grid-cols-9 grid-rows-9 gap-0 overflow-hidden rounded-xl border-2 border-brand/60"
      role="grid"
      aria-label="Sudoku-bräde"
    >
      {board.map((cell, i) => {
        const r = row(i);
        const c = col(i);
        const b = box(i);
        const isSelected = i === selectedIndex;
        const isHighlighted =
          !isSelected && (r === selectedRow || c === selectedCol || b === selectedBox);
        const isSameValue =
          !isSelected && selectedValue !== 0 && cell.value === selectedValue;
        const isConflict = conflicts.has(i);

        const borderR = c === 2 || c === 5 ? 'border-r-2 border-r-brand/40' : 'border-r border-r-white/10';
        const borderB = r === 2 || r === 5 ? 'border-b-2 border-b-brand/40' : 'border-b border-b-white/10';

        let bg = 'bg-surface-light';
        if (isSelected) bg = 'bg-brand/30';
        else if (isSameValue) bg = 'bg-brand/15';
        else if (isHighlighted) bg = 'bg-white/5';

        const textColor = isConflict
          ? 'text-error'
          : cell.given
            ? 'text-text'
            : 'text-accent';

        return (
          <button
            key={i}
            data-tour={`cell-${i}`}
            className={`relative flex items-center justify-center ${borderR} ${borderB} ${bg} ${textColor} transition-colors duration-100 focus:outline-none`}
            style={{ fontSize: 'clamp(1rem, 4.5vw, 1.5rem)' }}
            onClick={() => onSelect(i)}
            aria-label={`Rad ${r + 1}, kolumn ${c + 1}${cell.value ? `, värde ${cell.value}` : ', tom'}`}
          >
            {cell.value !== 0 ? (
              <span className={`font-bold ${cell.given ? '' : 'font-semibold'}`}>
                {cell.value}
              </span>
            ) : cell.notes.size > 0 ? (
              <div className="grid grid-cols-3 grid-rows-3 gap-0 w-full h-full p-[2px]">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                  <span
                    key={n}
                    className="flex items-center justify-center text-text-muted"
                    style={{ fontSize: 'clamp(0.4rem, 1.8vw, 0.6rem)' }}
                  >
                    {cell.notes.has(n) ? n : ''}
                  </span>
                ))}
              </div>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
