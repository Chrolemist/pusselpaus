import { useMemo, useState } from 'react';
import {
  applyTemplateTurnBasedMove,
  createTemplateTurnBasedState,
  deriveTemplateTurnBasedResult,
  templateTurnBasedContract,
  type TemplateMark,
  type TemplateTurnBasedMove,
  type TemplateTurnBasedState,
} from '../core/game';

const templatePlayers = [
  { participantId: 'local-x', seat: 0, isHost: true },
  { participantId: 'local-o', seat: 1, isHost: false },
] as const;

export default function TemplateTurnBasedPage() {
  const context = useMemo(() => ({
    config: { boardSize: 3 },
    players: [...templatePlayers],
  }), []);
  const [state, setState] = useState<TemplateTurnBasedState>(() => createTemplateTurnBasedState(context));

  const result = deriveTemplateTurnBasedResult(state, context);
  const activePlayer = templateTurnBasedContract.getActiveParticipantId(state, context);

  const handleCellClick = (row: number, col: number) => {
    if (!activePlayer) return;

    const move: TemplateTurnBasedMove = {
      kind: 'place-mark',
      actorId: activePlayer,
      row,
      col,
      mark: state.marksByParticipantId[activePlayer] as TemplateMark,
    };

    const validation = templateTurnBasedContract.validateMove(state, move, context);
    if (!validation.ok) return;

    setState((current) => applyTemplateTurnBasedMove(current, move, context));
  };

  return (
    <div className="flex min-h-full flex-col items-center gap-6 px-4 py-8">
      <div className="max-w-xl text-center">
        <h1 className="text-3xl font-extrabold text-white">Turn-Based Template</h1>
        <p className="mt-2 text-sm text-text-muted">
          This page demonstrates how a small drag-based game can stay local first and still follow the multiplayer platform contract.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 rounded-[28px] border border-white/10 bg-white/5 p-4">
        {state.board.map((row, rowIndex) => row.map((cell, colIndex) => (
          <button
            key={`${rowIndex}-${colIndex}`}
            type="button"
            onClick={() => handleCellClick(rowIndex, colIndex)}
            className="flex h-24 w-24 items-center justify-center rounded-2xl bg-slate-950/70 text-3xl font-extrabold text-white ring-1 ring-white/10 transition hover:ring-brand/50"
          >
            {cell ?? ''}
          </button>
        )))}
      </div>

      <div className="w-full max-w-xl rounded-[24px] bg-white/5 p-4 text-sm text-text-muted ring-1 ring-white/10">
        <p className="font-semibold text-white">
          {result
            ? (result.winnerParticipantId ? `Winner: ${result.winnerParticipantId}` : 'Draw')
            : `Current turn: ${activePlayer ?? 'none'}`}
        </p>
        <p className="mt-2">Revision: {state.revision}</p>
        <p className="mt-1">Turn number: {state.turnNumber}</p>
      </div>
    </div>
  );
}