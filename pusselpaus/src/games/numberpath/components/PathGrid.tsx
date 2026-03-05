/* ── Sifferstigen – grid component with drag-to-draw ── */

import { useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { CellState } from '../hooks/useNumberPath';

interface PathGridProps {
  puzzleId: string;
  rows: number;
  cols: number;
  cellValues: number[];
  cellStates: CellState[];
  validMoves: Set<number>;
  pathCells: number[];
  total: number;
  won: boolean;
  onCellClick: (index: number) => boolean;
}

export default function PathGrid({
  puzzleId,
  rows,
  cols,
  cellValues,
  cellStates,
  validMoves,
  pathCells,
  total,
  won,
  onCellClick,
}: PathGridProps) {
  const [dragging, setDragging] = useState(false);
  const lastDragCell = useRef<number>(-1);
  const gridRef = useRef<HTMLDivElement>(null);

  const textSize = cols <= 5 ? 'text-2xl' : cols <= 6 ? 'text-xl' : 'text-lg';

  /* ── pointer helpers ── */

  const cellFromPoint = useCallback((x: number, y: number): number | null => {
    const el = document.elementFromPoint(x, y);
    const cell = el?.closest<HTMLElement>('[data-cell-index]');
    if (!cell) return null;
    const idx = parseInt(cell.dataset.cellIndex ?? '', 10);
    return isNaN(idx) ? null : idx;
  }, []);

  function handlePointerDown(e: React.PointerEvent, cellIndex: number) {
    if (won) return;
    setDragging(true);
    lastDragCell.current = cellIndex;
    onCellClick(cellIndex);
    // Prevent text selection / scroll on touch
    e.preventDefault();
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragging || won) return;
    const idx = cellFromPoint(e.clientX, e.clientY);
    if (idx === null || idx === lastDragCell.current) return;
    lastDragCell.current = idx;
    onCellClick(idx);
  }

  function handlePointerUp() {
    setDragging(false);
    lastDragCell.current = -1;
  }

  /* ── path SVG overlay ── */

  function renderPathLines() {
    if (pathCells.length < 2) return null;
    const lines: React.ReactNode[] = [];
    for (let i = 1; i < pathCells.length; i++) {
      const prev = pathCells[i - 1];
      const curr = pathCells[i];
      const x1 = (prev % cols) + 0.5;
      const y1 = Math.floor(prev / cols) + 0.5;
      const x2 = (curr % cols) + 0.5;
      const y2 = Math.floor(curr / cols) + 0.5;
      const progress = (i - 1) / Math.max(total - 2, 1);
      const h = 239 + progress * (199 - 239);
      const s = 73 + progress * (95 - 73);
      lines.push(
        <line
          key={i}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={`hsl(${h}, ${s}%, 65%)`}
          strokeWidth={0.38}
          strokeLinecap="round"
          opacity={0.55}
        />,
      );
    }
    return (
      <svg
        viewBox={`0 0 ${cols} ${rows}`}
        className="pointer-events-none absolute inset-0 h-full w-full"
        preserveAspectRatio="none"
      >
        {lines}
      </svg>
    );
  }

  /* ── cell styling ── */

  function getCellBg(cellIndex: number): React.CSSProperties {
    const state = cellStates[cellIndex];
    if (state === 'path' || state === 'head') {
      const step = pathCells.indexOf(cellIndex);
      const progress = step / Math.max(total - 1, 1);
      const h = 239 + progress * (199 - 239);
      const s = 73 + progress * (95 - 73);
      const l = state === 'head' ? 52 : 32;
      const a = state === 'head' ? 0.9 : 0.5;
      return { backgroundColor: `hsla(${h}, ${s}%, ${l}%, ${a})` };
    }
    return {};
  }

  function getCellClasses(cellIndex: number): string {
    const state = cellStates[cellIndex];
    const isValid = validMoves.has(cellIndex);
    const base = `flex items-center justify-center rounded-lg aspect-square ${textSize} font-bold select-none transition-colors duration-100`;

    switch (state) {
      case 'head':
        return `${base} text-white ring-2 ring-accent shadow-lg shadow-brand/40`;
      case 'path':
        return `${base} text-white/90`;
      case 'given':
        return `${base} bg-surface-card text-accent border border-accent/20`;
      case 'empty':
        return `${base} bg-surface-card ${isValid ? 'ring-1 ring-brand/40 cursor-pointer hover:ring-brand/70' : ''}`;
      default:
        return base;
    }
  }

  /* ── render ── */

  return (
    <div className="relative w-full max-w-sm mx-auto">
      {renderPathLines()}
      <div
        ref={gridRef}
        className="grid w-full select-none"
        style={{
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gap: '3px',
          touchAction: 'none',
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {cellValues.map((value, i) => (
          <motion.button
            key={`${puzzleId}-${i}`}
            data-cell-index={i}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.012, duration: 0.2 }}
            className={getCellClasses(i)}
            style={getCellBg(i)}
            onPointerDown={(e) => handlePointerDown(e, i)}
          >
            <AnimatePresence mode="wait">
              {value > 0 && (
                <motion.span
                  key={`v-${value}`}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                  className="pointer-events-none"
                >
                  {value}
                </motion.span>
              )}
            </AnimatePresence>

            {/* Win ripple */}
            {won && pathCells.includes(i) && (
              <motion.div
                className="pointer-events-none absolute inset-0 rounded-lg bg-success/25"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0.6, 0] }}
                transition={{
                  delay: pathCells.indexOf(i) * 0.035,
                  duration: 0.6,
                  ease: 'easeInOut',
                }}
              />
            )}
          </motion.button>
        ))}
      </div>
    </div>
  );
}
