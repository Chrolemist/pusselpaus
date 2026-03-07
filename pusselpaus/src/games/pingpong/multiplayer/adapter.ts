import { startPongMatch } from '../core/engine';
import type { PongState } from '../core/types';
import type { RealtimeGameAdapter, RealtimeParticipant } from '../../../multiplayer';
import type { PongRealtimeConfig, PongRealtimeInput, PongRealtimeSerializedState } from './types';

function normalizeBoolean(value: unknown): boolean {
  return value === true;
}

export const pongRealtimeAdapter: RealtimeGameAdapter<PongRealtimeConfig, PongRealtimeInput, PongState> = {
  authority: 'host-authoritative',
  tickRate: 60,
  maxPlayers: 2,
  createInitialState(args: { config: PongRealtimeConfig; seed?: number; participants: RealtimeParticipant[] }): PongState {
    void args;
    return startPongMatch('versus', 'medium');
  },
  serializeInput(input: PongRealtimeInput): Record<string, unknown> {
    return {
      up: input.up,
      down: input.down,
      boostNonce: input.boostNonce,
    };
  },
  deserializeInput(payload: Record<string, unknown>): PongRealtimeInput {
    return {
      up: normalizeBoolean(payload.up),
      down: normalizeBoolean(payload.down),
      boostNonce: typeof payload.boostNonce === 'number' ? payload.boostNonce : 0,
    };
  },
  serializeState(state: PongState): Record<string, unknown> {
    return state as unknown as PongRealtimeSerializedState;
  },
  deserializeState(payload: Record<string, unknown>): PongState {
    return payload as unknown as PongState;
  },
};
