/* ── Realtime multiplayer – contracts for future live games ── */

export type {
  RealtimeAuthorityMode,
  RealtimeParticipant,
  RealtimeConnectionState,
  RealtimeInputEnvelope,
  RealtimeSnapshotEnvelope,
  RealtimeEventEnvelope,
  RealtimeTransport,
  RealtimeGameAdapter,
} from './types';

export { createSupabaseBroadcastTransport } from './supabaseBroadcastTransport';