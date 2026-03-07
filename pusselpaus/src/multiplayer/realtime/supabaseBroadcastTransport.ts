import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabaseClient';
import type {
  RealtimeConnectionState,
  RealtimeEventEnvelope,
  RealtimeInputEnvelope,
  RealtimeParticipant,
  RealtimeSnapshotEnvelope,
  RealtimeTransport,
} from './types';

interface BroadcastPayload<TPayload> {
  payload?: TPayload;
}

type ChannelStatus = 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR' | string;

type BroadcastEnabledChannel = {
  on(type: 'broadcast', filter: { event: string }, callback: (payload: BroadcastPayload<unknown>) => void): BroadcastEnabledChannel;
  on(type: 'presence', filter: { event: 'sync' }, callback: () => void): BroadcastEnabledChannel;
  subscribe(callback?: (status: ChannelStatus) => void): BroadcastEnabledChannel;
  track(payload: Record<string, unknown>): Promise<unknown>;
  untrack(): Promise<unknown>;
  presenceState<TPresence extends Record<string, unknown> = Record<string, unknown>>(): Record<string, TPresence[]>;
  send(payload: { type: 'broadcast'; event: string; payload: unknown }): Promise<unknown>;
};

type PendingBroadcastMessage = {
  event: 'input' | 'snapshot' | 'event';
  payload: unknown;
};

function nowMs(): number {
  return Date.now();
}

export function createSupabaseBroadcastTransport<TInput extends Record<string, unknown>, TState extends Record<string, unknown>, TEvent extends Record<string, unknown> = Record<string, unknown>>(): RealtimeTransport<TInput, TState, TEvent> {
  let channel: RealtimeChannel | null = null;
  let isSubscribed = false;
  const pendingMessages: PendingBroadcastMessage[] = [];
  const inputHandlers = new Set<(envelope: RealtimeInputEnvelope<TInput>) => void>();
  const snapshotHandlers = new Set<(snapshot: RealtimeSnapshotEnvelope<TState>) => void>();
  const eventHandlers = new Set<(event: RealtimeEventEnvelope<TEvent>) => void>();
  const presenceHandlers = new Set<(participants: RealtimeParticipant[]) => void>();
  let connectionState: RealtimeConnectionState = {
    connected: false,
    reconnecting: false,
    latencyMs: null,
    lastMessageAt: null,
  };

  const emitPresence = () => {
    if (!channel || presenceHandlers.size === 0) return;
    const rawPresence = channel.presenceState<Record<string, unknown>>();
    const participants = Object.keys(rawPresence).map((userId, index) => ({
      userId,
      seat: index,
      isHost: false,
      connected: true,
    } satisfies RealtimeParticipant));
    for (const handler of presenceHandlers) {
      handler(participants);
    }
  };

  const flushPendingMessages = async () => {
    if (!channel || !isSubscribed || pendingMessages.length === 0) return;

    const messages = pendingMessages.splice(0, pendingMessages.length);
    for (const message of messages) {
      await channel.send({
        type: 'broadcast',
        event: message.event,
        payload: message.payload,
      });
    }
  };

  const sendOrQueue = async (event: PendingBroadcastMessage['event'], payload: unknown) => {
    if (!channel) return;

    if (!isSubscribed) {
      pendingMessages.push({ event, payload });
      return;
    }

    await channel.send({
      type: 'broadcast',
      event,
      payload,
    });
  };

  return {
    async connect(args) {
      if (channel) {
        await supabase.removeChannel(channel);
      }

      isSubscribed = false;
      pendingMessages.length = 0;

      connectionState = {
        connected: false,
        reconnecting: false,
        latencyMs: null,
        lastMessageAt: null,
      };

      channel = supabase.channel(`realtime:${args.gameId}:${args.matchId}`, {
        config: {
          broadcast: { self: true },
          presence: { key: args.userId },
        },
      });

      const broadcastChannel = channel as unknown as BroadcastEnabledChannel;

      broadcastChannel
        .on('broadcast', { event: 'input' }, ({ payload }) => {
          const envelope = payload as RealtimeInputEnvelope<TInput> | undefined;
          if (!envelope) return;
          connectionState = {
            ...connectionState,
            lastMessageAt: nowMs(),
          };
          for (const handler of inputHandlers) {
            handler(envelope);
          }
        })
        .on('broadcast', { event: 'snapshot' }, ({ payload }) => {
          const snapshot = payload as RealtimeSnapshotEnvelope<TState> | undefined;
          if (!snapshot) return;
          connectionState = {
            ...connectionState,
            lastMessageAt: nowMs(),
          };
          for (const handler of snapshotHandlers) {
            handler(snapshot);
          }
        })
        .on('broadcast', { event: 'event' }, ({ payload }) => {
          const event = payload as RealtimeEventEnvelope<TEvent> | undefined;
          if (!event) return;
          connectionState = {
            ...connectionState,
            lastMessageAt: nowMs(),
          };
          for (const handler of eventHandlers) {
            handler(event);
          }
        })
        .on('presence', { event: 'sync' }, () => {
          emitPresence();
        })
        .subscribe(async (status: ChannelStatus) => {
          if (status === 'SUBSCRIBED') {
            isSubscribed = true;
            connectionState = {
              ...connectionState,
              connected: true,
              reconnecting: false,
              lastMessageAt: nowMs(),
            };
            await channel?.track({ userId: args.userId, connectedAt: new Date().toISOString() });
            emitPresence();
            await flushPendingMessages();
            return;
          }

          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            isSubscribed = false;
            connectionState = {
              ...connectionState,
              connected: false,
              reconnecting: true,
            };
          }

          if (status === 'CLOSED') {
            isSubscribed = false;
            connectionState = {
              ...connectionState,
              connected: false,
              reconnecting: false,
            };
          }
        });
    },

    async disconnect() {
      if (!channel) return;
      isSubscribed = false;
      pendingMessages.length = 0;
      await channel.untrack();
      await supabase.removeChannel(channel);
      channel = null;
      connectionState = {
        connected: false,
        reconnecting: false,
        latencyMs: null,
        lastMessageAt: null,
      };
    },

    async sendInput(envelope) {
      await sendOrQueue('input', envelope);
    },

    async sendSnapshot(snapshot) {
      await sendOrQueue('snapshot', snapshot);
    },

    async sendEvent(envelope) {
      await sendOrQueue('event', envelope);
    },

    onInput(handler) {
      inputHandlers.add(handler);
      return () => {
        inputHandlers.delete(handler);
      };
    },

    onSnapshot(handler) {
      snapshotHandlers.add(handler);
      return () => {
        snapshotHandlers.delete(handler);
      };
    },

    onEvent(handler) {
      eventHandlers.add(handler);
      return () => {
        eventHandlers.delete(handler);
      };
    },

    onPresence(handler) {
      presenceHandlers.add(handler);
      emitPresence();
      return () => {
        presenceHandlers.delete(handler);
      };
    },

    getConnectionState() {
      return connectionState;
    },
  };
}
