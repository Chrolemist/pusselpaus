import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSend = vi.hoisted(() => vi.fn(async () => 'ok'));
const mockTrack = vi.hoisted(() => vi.fn(async () => null));
const mockUntrack = vi.hoisted(() => vi.fn(async () => null));
const mockPresenceState = vi.hoisted(() => vi.fn(() => ({})));
const mockSubscribe = vi.hoisted(() => vi.fn());
const mockOn = vi.hoisted(() => vi.fn());
const mockRemoveChannel = vi.hoisted(() => vi.fn(async () => 'ok'));

let subscribeHandler: ((status: string) => void | Promise<void>) | null = null;

const mockChannel = vi.hoisted(() => ({
  on: mockOn,
  subscribe: mockSubscribe,
  track: mockTrack,
  untrack: mockUntrack,
  presenceState: mockPresenceState,
  send: mockSend,
}));

const mockChannelFactory = vi.hoisted(() => vi.fn(() => mockChannel));

vi.mock('../../lib/supabaseClient', () => ({
  supabase: {
    channel: mockChannelFactory,
    removeChannel: mockRemoveChannel,
  },
}));

import { createSupabaseBroadcastTransport } from './supabaseBroadcastTransport';

describe('createSupabaseBroadcastTransport', () => {
  beforeEach(() => {
    subscribeHandler = null;
    vi.clearAllMocks();

    mockOn.mockImplementation(() => mockChannel);
    mockSubscribe.mockImplementation((handler?: (status: string) => void | Promise<void>) => {
      subscribeHandler = handler ?? null;
      return mockChannel;
    });
  });

  it('queues outgoing messages until the channel is subscribed', async () => {
    const transport = createSupabaseBroadcastTransport<Record<string, unknown>, Record<string, unknown>>();

    await transport.connect({ gameId: 'pingpong', matchId: 'match-1', userId: 'user-1' });
    await transport.sendInput({
      matchId: 'match-1',
      userId: 'user-1',
      tick: 1,
      sentAt: 123,
      input: { paddleY: 42 },
    });

    expect(mockSend).not.toHaveBeenCalled();

    await subscribeHandler?.('SUBSCRIBED');

    expect(mockTrack).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith({
      type: 'broadcast',
      event: 'input',
      payload: {
        matchId: 'match-1',
        userId: 'user-1',
        tick: 1,
        sentAt: 123,
        input: { paddleY: 42 },
      },
    });
  });

  it('queues messages again while reconnecting and flushes them after resubscribe', async () => {
    const transport = createSupabaseBroadcastTransport<Record<string, unknown>, Record<string, unknown>>();

    await transport.connect({ gameId: 'pingpong', matchId: 'match-2', userId: 'user-1' });
    await subscribeHandler?.('SUBSCRIBED');

    mockSend.mockClear();
    await subscribeHandler?.('TIMED_OUT');

    await transport.sendSnapshot!({
      matchId: 'match-2',
      tick: 2,
      sentAt: 456,
      authoritativeUserId: 'user-1',
      state: { ballX: 12 },
    });

    expect(mockSend).not.toHaveBeenCalled();

    await subscribeHandler?.('SUBSCRIBED');

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith({
      type: 'broadcast',
      event: 'snapshot',
      payload: {
        matchId: 'match-2',
        tick: 2,
        sentAt: 456,
        authoritativeUserId: 'user-1',
        state: { ballX: 12 },
      },
    });
  });
});