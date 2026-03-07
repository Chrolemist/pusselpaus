/* ── Realtime multiplayer contracts ──
 *
 *  This layer is intentionally transport-agnostic.
 *  Current games only need the match/session shell above, but live games
 *  such as Pong can implement these contracts without rewriting the
 *  existing invite, countdown, rematch, and result pipeline.
 */

export type RealtimeAuthorityMode = 'host-authoritative' | 'server-authoritative' | 'lockstep';

export interface RealtimeParticipant {
  userId: string;
  seat: number;
  isHost: boolean;
  connected: boolean;
}

export interface RealtimeConnectionState {
  connected: boolean;
  reconnecting: boolean;
  latencyMs: number | null;
  lastMessageAt: number | null;
}

export interface RealtimeInputEnvelope<TInput> {
  matchId: string;
  userId: string;
  tick: number;
  sentAt: number;
  input: TInput;
}

export interface RealtimeSnapshotEnvelope<TState> {
  matchId: string;
  tick: number;
  sentAt: number;
  authoritativeUserId: string | null;
  state: TState;
}

export interface RealtimeEventEnvelope<TEvent = Record<string, unknown>> {
  matchId: string;
  type: string;
  sentAt: number;
  payload: TEvent;
}

export interface RealtimeTransport<TInput, TState, TEvent = Record<string, unknown>> {
  connect(args: { matchId: string; gameId: string; userId: string }): Promise<void>;
  disconnect(): Promise<void>;
  sendInput(envelope: RealtimeInputEnvelope<TInput>): Promise<void>;
  sendSnapshot?(snapshot: RealtimeSnapshotEnvelope<TState>): Promise<void>;
  sendEvent?(envelope: RealtimeEventEnvelope<TEvent>): Promise<void>;
  onInput(handler: (envelope: RealtimeInputEnvelope<TInput>) => void): () => void;
  onSnapshot(handler: (snapshot: RealtimeSnapshotEnvelope<TState>) => void): () => void;
  onEvent?(handler: (event: RealtimeEventEnvelope<TEvent>) => void): () => void;
  onPresence?(handler: (participants: RealtimeParticipant[]) => void): () => void;
  getConnectionState?(): RealtimeConnectionState;
}

export interface RealtimeGameAdapter<TConfig, TInput, TState, TEvent = Record<string, unknown>> {
  authority: RealtimeAuthorityMode;
  tickRate: number;
  maxPlayers: number;
  createInitialState(args: {
    config: TConfig;
    seed?: number;
    participants: RealtimeParticipant[];
  }): TState;
  serializeInput(input: TInput): Record<string, unknown>;
  deserializeInput(payload: Record<string, unknown>): TInput;
  serializeState(state: TState): Record<string, unknown>;
  deserializeState(payload: Record<string, unknown>): TState;
  reduceInput?(state: TState, envelope: RealtimeInputEnvelope<TInput>): TState;
  applyEvent?(state: TState, event: RealtimeEventEnvelope<TEvent>): TState;
}