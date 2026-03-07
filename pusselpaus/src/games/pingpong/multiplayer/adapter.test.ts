import { describe, expect, it } from 'vitest';
import { pongRealtimeAdapter } from './adapter';
import { startPongMatch } from '../core/engine';

describe('pongRealtimeAdapter', () => {
  it('round-trips input payloads', () => {
    const input = { up: true, down: false, targetY: 180, boostNonce: 3 };
    const serialized = pongRealtimeAdapter.serializeInput(input);
    expect(pongRealtimeAdapter.deserializeInput(serialized)).toEqual(input);
  });

  it('round-trips state payloads', () => {
    const state = startPongMatch('versus', 'medium');
    const serialized = pongRealtimeAdapter.serializeState(state);
    expect(pongRealtimeAdapter.deserializeState(serialized)).toEqual(state);
  });
});
