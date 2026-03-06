/* ── API module – unit tests ──
 *
 *  Tests that the RPC wrapper functions call supabase correctly.
 *  We mock supabase to avoid hitting a real database.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoist mock fns so they're available when vi.mock factory runs
const { mockRpc, mockSelect, mockEq, mockMaybeSingle, mockIn, mockReturns } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockSelect: vi.fn(),
  mockEq: vi.fn(),
  mockMaybeSingle: vi.fn(),
  mockIn: vi.fn(),
  mockReturns: vi.fn(),
}));

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    rpc: mockRpc,
    from: vi.fn(() => ({
      select: mockSelect.mockReturnValue({
        eq: mockEq.mockReturnValue({
          maybeSingle: mockMaybeSingle,
          returns: mockReturns,
        }),
        in: mockIn.mockReturnValue({
          returns: mockReturns,
        }),
      }),
    })),
  },
}));

import {
  mpCreateMatch,
  mpAcceptInvite,
  mpDeclineInvite,
  mpStartIfReady,
  mpTickMatchStart,
  mpForfeitMatch,
  mpCancelMatch,
  mpSubmitResult,
  mpTryResolveTimeout,
} from '../multiplayer/api';
import { setActiveMatchPayload } from '../multiplayer/activeMatch';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('mpCreateMatch', () => {
  it('calls rpc with correct params', async () => {
    mockRpc.mockResolvedValue({ error: null });

    const err = await mpCreateMatch('sudoku', 25, ['user-1'], { difficulty: 'hard' }, 42);

    expect(err).toBeNull();
    expect(mockRpc).toHaveBeenCalledWith('mp_create_match', {
      p_game_id: 'sudoku',
      p_stake: 25,
      p_invited_ids: ['user-1'],
      p_config: { difficulty: 'hard' },
      p_config_seed: 42,
    });
  });

  it('returns error message on failure', async () => {
    mockRpc.mockResolvedValue({ error: { message: 'DB error' } });

    const err = await mpCreateMatch('sudoku', 0, ['user-1'], {});
    expect(err).toBe('DB error');
  });
});

describe('mpAcceptInvite', () => {
  it('returns null on success', async () => {
    mockRpc.mockResolvedValue({ error: null });
    expect(await mpAcceptInvite('match-1')).toBeNull();
    expect(mockRpc).toHaveBeenCalledWith('mp_accept_invite', { p_match_id: 'match-1' });
  });
});

describe('mpDeclineInvite', () => {
  it('returns null on success', async () => {
    mockRpc.mockResolvedValue({ error: null });
    expect(await mpDeclineInvite('match-1')).toBeNull();
  });
});

describe('mpStartIfReady', () => {
  it('passes countdown seconds', async () => {
    mockRpc.mockResolvedValue({ error: null });
    await mpStartIfReady('match-1', 10);
    expect(mockRpc).toHaveBeenCalledWith('mp_start_if_ready', {
      p_match_id: 'match-1',
      p_countdown_seconds: 10,
    });
  });

  it('defaults countdown to 5', async () => {
    mockRpc.mockResolvedValue({ error: null });
    await mpStartIfReady('match-1');
    expect(mockRpc).toHaveBeenCalledWith('mp_start_if_ready', {
      p_match_id: 'match-1',
      p_countdown_seconds: 5,
    });
  });
});

describe('mpTickMatchStart', () => {
  it('returns data string on success', async () => {
    mockRpc.mockResolvedValue({ data: 'started', error: null });
    expect(await mpTickMatchStart('match-1')).toBe('started');
  });
});

describe('mpForfeitMatch', () => {
  it('returns null on success', async () => {
    mockRpc.mockResolvedValue({ error: null });
    expect(await mpForfeitMatch('match-1')).toBeNull();
  });
});

describe('mpCancelMatch', () => {
  it('calls the cancel RPC', async () => {
    mockRpc.mockResolvedValue({ error: null });
    expect(await mpCancelMatch('match-1')).toBeNull();
    expect(mockRpc).toHaveBeenCalledWith('mp_cancel_match', { p_match_id: 'match-1' });
  });
});

describe('mpSubmitResult', () => {
  it('reads matchId from localStorage and submits', async () => {
    mockRpc.mockResolvedValue({ error: null });

    setActiveMatchPayload('sudoku', { matchId: 'match-xyz', setAt: 'now' });
    await mpSubmitResult('sudoku', 'user-1', { elapsedSeconds: 120 });

    expect(mockRpc).toHaveBeenCalledWith('mp_submit_result', {
      p_match_id: 'match-xyz',
      p_elapsed_seconds: 120,
      p_score: null,
      p_survived_seconds: null,
    });
  });

  it('does nothing when no active match', async () => {
    await mpSubmitResult('sudoku', 'user-1', { elapsedSeconds: 120 });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('does nothing when no userId', async () => {
    setActiveMatchPayload('sudoku', { matchId: 'match-xyz', setAt: 'now' });
    await mpSubmitResult('sudoku', undefined, { elapsedSeconds: 120 });
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe('mpTryResolveTimeout', () => {
  it('returns resolve state string', async () => {
    mockRpc.mockResolvedValue({ data: 'resolved:timeout', error: null });
    expect(await mpTryResolveTimeout('match-1', 180)).toBe('resolved:timeout');
  });

  it('returns null on error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'fail' } });
    expect(await mpTryResolveTimeout('match-1')).toBeNull();
  });
});
