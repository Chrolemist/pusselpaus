// @vitest-environment jsdom

import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUseAuth = vi.hoisted(() => vi.fn());
const mockUseActiveMatchPayload = vi.hoisted(() => vi.fn());

const mockChannelOn = vi.hoisted(() => vi.fn());
const mockChannelSubscribe = vi.hoisted(() => vi.fn());
const mockRemoveChannel = vi.hoisted(() => vi.fn());
const mockChannel = vi.hoisted(() => ({
  on: mockChannelOn,
  subscribe: mockChannelSubscribe,
}));

const matchRow = {
  id: 'match-1',
  game_id: 'sudoku',
  host_id: 'user-1',
  status: 'completed',
  started_at: '2026-03-07T12:00:00.000Z',
  winner_id: null,
};

const playerRows = [
  {
    id: 'player-1',
    match_id: 'match-1',
    user_id: 'user-1',
    status: 'accepted',
    ready: true,
    submitted: true,
    forfeited: false,
    rematch_match_id: null,
  },
  {
    id: 'player-2',
    match_id: 'match-1',
    user_id: 'user-2',
    status: 'accepted',
    ready: true,
    submitted: true,
    forfeited: false,
    rematch_match_id: null,
  },
];

const profiles = [
  { id: 'user-1', username: 'Ada', tag: '0001', skin: 'cat', is_online: true, level: 4 },
  { id: 'user-2', username: 'Linus', tag: '0002', skin: 'dog', is_online: true, level: 5 },
];

const fromCalls: string[] = [];

const mockFrom = vi.hoisted(() => vi.fn((table: string) => {
  fromCalls.push(table);
  if (table === 'multiplayer_matches') {
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      maybeSingle: vi.fn(async () => ({ data: matchRow, error: null })),
    };
    return builder;
  }

  if (table === 'multiplayer_match_players') {
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      returns: vi.fn(async () => ({ data: playerRows, error: null })),
    };
    return builder;
  }

  if (table === 'profiles') {
    const builder = {
      select: vi.fn(() => builder),
      in: vi.fn(async () => ({ data: profiles, error: null })),
    };
    return builder;
  }

  throw new Error(`Unexpected table ${table}`);
}));

vi.mock('../auth', () => ({
  useAuth: mockUseAuth,
}));

vi.mock('./useActiveMatchPayload', () => ({
  useActiveMatchPayload: mockUseActiveMatchPayload,
}));

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: mockFrom,
    channel: vi.fn(() => mockChannel),
    removeChannel: mockRemoveChannel,
  },
}));

import { useLiveMatch } from './useLiveMatch';

describe('useLiveMatch', () => {
  beforeEach(() => {
    fromCalls.length = 0;
    mockUseAuth.mockReturnValue({ user: { id: 'user-1' } });
    mockUseActiveMatchPayload.mockReturnValue({ matchId: 'match-1' });
    mockChannelOn.mockReset();
    mockChannelSubscribe.mockReset();
    mockRemoveChannel.mockReset();
    mockChannelOn.mockImplementation(() => mockChannel);
    mockChannelSubscribe.mockReturnValue(mockChannel);
    mockFrom.mockClear();
  });

  it('refreshes immediately when active match rows change', async () => {
    const realtimeHandlers: Array<() => void> = [];
    mockChannelOn.mockImplementation((_event, _filter, handler) => {
      realtimeHandlers.push(handler as () => void);
      return mockChannel;
    });

    const { result, unmount } = renderHook(() => useLiveMatch('sudoku'));

    await waitFor(() => {
      expect(result.current.match?.id).toBe('match-1');
    });

    expect(realtimeHandlers).toHaveLength(2);

    const initialMatchQueries = fromCalls.filter((table) => table === 'multiplayer_matches').length;
    realtimeHandlers[0]();

    await waitFor(() => {
      expect(fromCalls.filter((table) => table === 'multiplayer_matches').length).toBeGreaterThan(initialMatchQueries);
    });

    unmount();
    expect(mockRemoveChannel).toHaveBeenCalledTimes(1);
  });
});