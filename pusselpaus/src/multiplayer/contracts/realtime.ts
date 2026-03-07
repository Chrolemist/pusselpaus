import type { RealtimeAuthorityMode, RealtimeEventEnvelope, RealtimeTransport } from '../realtime/types';
import type { PlatformContractContext, PlatformResultBase } from './shared';

export interface RealtimeFrameContext<TConfig> extends PlatformContractContext<TConfig> {
  dtMs: number;
  tick: number;
}

export interface RealtimeInputApplyContext<TConfig, TInput extends object> extends PlatformContractContext<TConfig> {
  playerId: string;
  tick: number;
  previousInput?: TInput;
}

export type RealtimeTransportContract<TEvent = Record<string, unknown>> =
  RealtimeTransport<Record<string, unknown>, Record<string, unknown>, TEvent>;

export interface RealtimeGameContract<
  TConfig,
  TInput extends object,
  TState extends object,
  TResult extends PlatformResultBase,
  TEvent = Record<string, unknown>,
> {
  kind: 'realtime';
  authority: RealtimeAuthorityMode;
  tickRate: number;
  maxPlayers: number;
  createInitialState(context: PlatformContractContext<TConfig>): TState;
  step(state: TState, inputsByParticipant: Map<string, TInput>, context: RealtimeFrameContext<TConfig>): TState;
  applyInput?(state: TState, input: TInput, context: RealtimeInputApplyContext<TConfig, TInput>): TState;
  applyEvent?(state: TState, event: RealtimeEventEnvelope<TEvent>, context: PlatformContractContext<TConfig>): TState;
  serializeInput(input: TInput): Record<string, unknown>;
  deserializeInput(payload: Record<string, unknown>): TInput;
  serializeState(state: TState): Record<string, unknown>;
  deserializeState(payload: Record<string, unknown>): TState;
  deriveResult(state: TState, context: PlatformContractContext<TConfig>): TResult | null;
}