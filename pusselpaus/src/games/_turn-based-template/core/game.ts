import type { PlatformContractContext, PlatformResultBase, TurnBasedGameContract, TurnBasedValidationResult } from '../../../multiplayer/contracts';

export type TemplateMark = 'X' | 'O';
export type TemplateCell = TemplateMark | null;

export interface TemplateTurnBasedConfig {
  boardSize: number;
}

export interface TemplateTurnBasedMove {
  kind: 'place-mark';
  actorId?: string;
  row: number;
  col: number;
  mark: TemplateMark;
}

export interface TemplateTurnBasedState {
  lifecycle: 'ready' | 'playing' | 'finished';
  revision: number;
  startedAt: number | null;
  finishedAt: number | null;
  winnerParticipantId: string | null;
  turnNumber: number;
  activeParticipantId: string | null;
  marksByParticipantId: Record<string, TemplateMark>;
  board: TemplateCell[][];
}

export interface TemplateTurnBasedResult extends PlatformResultBase<{
  boardSize: number;
  movesPlayed: number;
  winnerMark: TemplateMark | null;
}> {}

function createBoard(boardSize: number): TemplateCell[][] {
  return Array.from({ length: boardSize }, () => Array.from({ length: boardSize }, () => null));
}

function winnerOnLine(board: TemplateCell[][], line: Array<[number, number]>): TemplateMark | null {
  const [firstRow, firstCol] = line[0];
  const first = board[firstRow]?.[firstCol] ?? null;
  if (!first) return null;
  return line.every(([row, col]) => board[row]?.[col] === first) ? first : null;
}

function detectWinner(board: TemplateCell[][]): TemplateMark | null {
  const boardSize = board.length;
  const lines: Array<Array<[number, number]>> = [];

  for (let index = 0; index < boardSize; index += 1) {
    lines.push(Array.from({ length: boardSize }, (_, col) => [index, col] as [number, number]));
    lines.push(Array.from({ length: boardSize }, (_, row) => [row, index] as [number, number]));
  }

  lines.push(Array.from({ length: boardSize }, (_, index) => [index, index] as [number, number]));
  lines.push(Array.from({ length: boardSize }, (_, index) => [index, boardSize - index - 1] as [number, number]));

  for (const line of lines) {
    const winner = winnerOnLine(board, line);
    if (winner) return winner;
  }

  return null;
}

function isBoardFull(board: TemplateCell[][]): boolean {
  return board.every((row) => row.every((cell) => cell !== null));
}

function participantForMark(marksByParticipantId: Record<string, TemplateMark>, mark: TemplateMark): string | null {
  for (const [participantId, participantMark] of Object.entries(marksByParticipantId)) {
    if (participantMark === mark) return participantId;
  }
  return null;
}

function activeParticipantId(players: PlatformContractContext<TemplateTurnBasedConfig>['players'], turnNumber: number): string | null {
  if (players.length === 0) return null;
  return players[turnNumber % players.length]?.participantId ?? null;
}

export function createTemplateTurnBasedState(context: PlatformContractContext<TemplateTurnBasedConfig>): TemplateTurnBasedState {
  const firstPlayer = context.players[0]?.participantId ?? null;
  const secondPlayer = context.players[1]?.participantId ?? null;

  return {
    lifecycle: 'ready',
    revision: 0,
    startedAt: null,
    finishedAt: null,
    winnerParticipantId: null,
    turnNumber: 0,
    activeParticipantId: firstPlayer,
    marksByParticipantId: {
      ...(firstPlayer ? { [firstPlayer]: 'X' as const } : {}),
      ...(secondPlayer ? { [secondPlayer]: 'O' as const } : {}),
    },
    board: createBoard(context.config.boardSize),
  };
}

export function validateTemplateTurnBasedMove(
  state: TemplateTurnBasedState,
  move: TemplateTurnBasedMove,
  context: PlatformContractContext<TemplateTurnBasedConfig>,
): TurnBasedValidationResult {
  if (state.lifecycle === 'finished') return { ok: false, reason: 'Matchen ar redan slut' };
  if (move.actorId !== state.activeParticipantId) return { ok: false, reason: 'Det ar inte din tur' };
  if (move.row < 0 || move.row >= context.config.boardSize || move.col < 0 || move.col >= context.config.boardSize) {
    return { ok: false, reason: 'Draget ar utanfor spelplanen' };
  }
  if (state.board[move.row][move.col] !== null) return { ok: false, reason: 'Rutan ar redan upptagen' };
  if (state.marksByParticipantId[move.actorId ?? ''] !== move.mark) return { ok: false, reason: 'Fel markor for spelaren' };
  return { ok: true };
}

export function applyTemplateTurnBasedMove(
  state: TemplateTurnBasedState,
  move: TemplateTurnBasedMove,
  context: PlatformContractContext<TemplateTurnBasedConfig>,
): TemplateTurnBasedState {
  const nextBoard = state.board.map((row) => [...row]);
  nextBoard[move.row][move.col] = move.mark;
  const nextTurnNumber = state.turnNumber + 1;
  const winnerMark = detectWinner(nextBoard);
  const boardFull = isBoardFull(nextBoard);
  const winnerParticipantId = winnerMark ? participantForMark(state.marksByParticipantId, winnerMark) : null;
  const finished = winnerMark !== null || boardFull;

  return {
    ...state,
    lifecycle: finished ? 'finished' : 'playing',
    revision: state.revision + 1,
    startedAt: state.startedAt ?? Date.now(),
    finishedAt: finished ? Date.now() : null,
    winnerParticipantId,
    turnNumber: nextTurnNumber,
    activeParticipantId: finished ? null : activeParticipantId(context.players, nextTurnNumber),
    board: nextBoard,
  };
}

export function deriveTemplateTurnBasedResult(
  state: TemplateTurnBasedState,
  context: PlatformContractContext<TemplateTurnBasedConfig>,
): TemplateTurnBasedResult | null {
  if (state.lifecycle !== 'finished') return null;

  const winnerMark = state.winnerParticipantId ? state.marksByParticipantId[state.winnerParticipantId] : null;
  return {
    outcome: state.winnerParticipantId ? 'win' : 'draw',
    completed: true,
    rankBy: 'rounds',
    winnerParticipantId: state.winnerParticipantId,
    score: state.winnerParticipantId ? 1 : 0,
    elapsedMs: state.startedAt && state.finishedAt ? Math.max(0, state.finishedAt - state.startedAt) : null,
    metrics: {
      boardSize: context.config.boardSize,
      movesPlayed: state.turnNumber,
      winnerMark,
    },
  };
}

export const templateTurnBasedContract: TurnBasedGameContract<
  TemplateTurnBasedConfig,
  TemplateTurnBasedMove,
  TemplateTurnBasedState,
  TemplateTurnBasedResult
> = {
  kind: 'turn-based',
  createInitialState(context) {
    return createTemplateTurnBasedState(context);
  },
  getActiveParticipantId(state) {
    return state.activeParticipantId;
  },
  validateMove(state, move, context) {
    return validateTemplateTurnBasedMove(state, move, context);
  },
  applyMove(state, move, context) {
    return applyTemplateTurnBasedMove(state, move, context);
  },
  serializeMove(move) {
    return move as unknown as Record<string, unknown>;
  },
  deserializeMove(payload) {
    return payload as unknown as TemplateTurnBasedMove;
  },
  serializeState(state) {
    return state as unknown as Record<string, unknown>;
  },
  deserializeState(payload) {
    return payload as unknown as TemplateTurnBasedState;
  },
  deriveResult(state, context) {
    return deriveTemplateTurnBasedResult(state, context);
  },
};