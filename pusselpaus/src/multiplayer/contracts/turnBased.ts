import type { PlatformContractContext, PlatformResultBase } from './shared';

export interface TurnBasedMoveEnvelope<TMove extends object> {
  matchId: string;
  turnNumber: number;
  playerId: string;
  submittedAt: number;
  move: TMove;
}

export interface TurnBasedStateEnvelope<TState extends object> {
  matchId: string;
  turnNumber: number;
  updatedAt: number;
  state: TState;
}

export interface TurnBasedTransport<TMove extends object, TState extends object> {
  loadInitialState(matchId: string): Promise<TState | null>;
  sendMove(envelope: TurnBasedMoveEnvelope<TMove>): Promise<void>;
  onMove(handler: (envelope: TurnBasedMoveEnvelope<TMove>) => void): () => void;
  syncState?(envelope: TurnBasedStateEnvelope<TState>): Promise<void>;
  onStateSync?(handler: (envelope: TurnBasedStateEnvelope<TState>) => void): () => void;
}

export interface TurnBasedValidationResult {
  ok: boolean;
  reason?: string;
}

export interface TurnBasedGameContract<
  TConfig,
  TMove extends object,
  TState extends object,
  TResult extends PlatformResultBase,
> {
  kind: 'turn-based';
  createInitialState(context: PlatformContractContext<TConfig>): TState;
  getActiveParticipantId(state: TState, context: PlatformContractContext<TConfig>): string | null;
  validateMove(state: TState, move: TMove, context: PlatformContractContext<TConfig>): TurnBasedValidationResult;
  applyMove(state: TState, move: TMove, context: PlatformContractContext<TConfig>): TState;
  serializeMove(move: TMove): Record<string, unknown>;
  deserializeMove(payload: Record<string, unknown>): TMove;
  serializeState(state: TState): Record<string, unknown>;
  deserializeState(payload: Record<string, unknown>): TState;
  deriveResult(state: TState, context: PlatformContractContext<TConfig>): TResult | null;
}