import { useState } from 'react';
import { BookOpen } from 'lucide-react';

interface TutorialStep {
  id: number;
  target: number;
  prompt: string;
  reason: string;
  row: string;
  column: string;
  box: string;
}

const STEPS: TutorialStep[] = [
  {
    id: 1,
    target: 1,
    prompt: 'Som du ser i den markerade rutan kan bara en siffra passa. Vilken väljer du?',
    reason: 'Raden har redan 2–9, och både kolumn och 3×3-ruta tillåter bara 1.',
    row: '2 3 4 5 6 7 8 9 ·',
    column: '6 8 2 4 9 7 5 3 ·',
    box: '2 8 4 / 7 · 3 / 6 9 5',
  },
  {
    id: 2,
    target: 7,
    prompt: 'Bra! Ny ruta: testa igen och välj den enda siffran som fungerar.',
    reason: 'Här saknas 7 i raden och den bryter inte mot kolumn eller 3×3-ruta.',
    row: '1 2 3 4 5 6 · 8 9',
    column: '1 3 5 9 2 4 8 6 ·',
    box: '5 6 1 / 2 · 8 / 3 9 4',
  },
];

export default function SudokuGuide() {
  const [stepIndex, setStepIndex] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const step = STEPS[stepIndex];

  function onPickNumber(num: number) {
    if (done) return;

    if (num !== step.target) {
      setFeedback(`Inte riktigt. Titta på ledtråden: ${step.reason}`);
      return;
    }

    if (stepIndex === STEPS.length - 1) {
      setDone(true);
      setFeedback('Snyggt! Du löste båda exemplen. Börja nu ett riktigt Sudoku 🎉');
      return;
    }

    setFeedback(`Rätt! ${step.reason}`);
    setTimeout(() => {
      setStepIndex((prev) => prev + 1);
      setFeedback(null);
    }, 900);
  }

  function restart() {
    setStepIndex(0);
    setFeedback(null);
    setDone(false);
  }

  return (
    <section className="w-full max-w-[min(90vw,400px)] space-y-3 rounded-xl bg-surface-card p-4 shadow ring-1 ring-white/10">
      <h3 className="flex items-center gap-1.5 text-sm font-bold text-brand-light">
        <BookOpen className="h-4 w-4" /> Interaktiv Sudoku-guide
      </h3>
      <p className="text-xs text-text-muted">Steg {Math.min(stepIndex + 1, STEPS.length)} av {STEPS.length}</p>

      <div className="rounded-lg bg-brand/15 p-3 text-xs text-text">
        {!done ? step.prompt : 'Guiden är klar. Du kan köra igen om du vill.'}
      </div>

      {!done && (
        <div className="space-y-2 rounded-lg bg-surface-light p-3 text-xs text-text-muted">
          <p><span className="font-semibold text-text">Rad:</span> {step.row}</p>
          <p><span className="font-semibold text-text">Kolumn:</span> {step.column}</p>
          <p><span className="font-semibold text-text">3×3-ruta:</span> {step.box}</p>
        </div>
      )}

      <div className="grid grid-cols-9 gap-1.5">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <button
            key={n}
            onClick={() => onPickNumber(n)}
            className="flex aspect-square items-center justify-center rounded-lg bg-surface-light text-sm font-bold text-text shadow transition active:scale-95"
          >
            {n}
          </button>
        ))}
      </div>

      {feedback && (
        <p className="rounded-lg bg-surface-light px-3 py-2 text-xs text-text-muted">
          {feedback}
        </p>
      )}

      {done && (
        <button
          onClick={restart}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white"
        >
          Kör guiden igen
        </button>
      )}
    </section>
  );
}
