// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUseAuth = vi.hoisted(() => vi.fn());

vi.mock('../auth', () => ({
  useAuth: mockUseAuth,
}));

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
    channel: vi.fn(),
    removeChannel: vi.fn(),
  },
}));

import { useActiveMatchPayload } from './useActiveMatchPayload';
import { useMultiplayer } from './useMultiplayer';

describe('useMultiplayer setActiveMatch', () => {
  beforeEach(() => {
    localStorage.clear();
    mockUseAuth.mockReturnValue({ user: null });
  });

  it('updates active match payload in the same tab', async () => {
    const gameId = 'sudoku';
    const payloadHook = renderHook(() => useActiveMatchPayload(gameId));
    const multiplayerHook = renderHook(() => useMultiplayer());

    expect(payloadHook.result.current).toBeNull();

    act(() => {
      multiplayerHook.result.current.setActiveMatch(gameId, 'match-2', {
        config: { difficulty: 'hard' },
        configSeed: 42,
      });
    });

    await waitFor(() => {
      expect(payloadHook.result.current?.matchId).toBe('match-2');
    });

    expect(payloadHook.result.current?.configSeed).toBe(42);
    expect(payloadHook.result.current?.config).toEqual({ difficulty: 'hard' });
  });
});