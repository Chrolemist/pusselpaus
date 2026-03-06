/* ── Matchmaking API – unit tests ──
 *
 *  Tests that the matchmaking RPC wrappers call supabase correctly
 *  and handle all return shapes.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRpc = vi.hoisted(() => vi.fn());

vi.mock('../lib/supabaseClient', () => ({
  supabase: { rpc: mockRpc },
}));

import { matchmakeJoin, matchmakeLeave, matchmakePoll } from './matchmakingApi';

beforeEach(() => vi.clearAllMocks());

/* ── matchmakeJoin ── */

describe('matchmakeJoin', () => {
  it('calls rpc with correct params', async () => {
    mockRpc.mockResolvedValue({ data: { queued: true, queue_id: 'q1', match_id: null, config_seed: null, queue_size: 1 }, error: null });
    const { data, error } = await matchmakeJoin('sudoku', 'hard');
    expect(error).toBeNull();
    expect(mockRpc).toHaveBeenCalledWith('matchmake_join', { p_game_id: 'sudoku', p_difficulty: 'hard' });
    expect(data?.queued).toBe(true);
    expect(data?.queue_size).toBe(1);
  });

  it('returns match_id when instantly matched', async () => {
    mockRpc.mockResolvedValue({
      data: { queued: false, queue_id: null, match_id: 'match-42', config_seed: 12345, queue_size: 0 },
      error: null,
    });
    const { data } = await matchmakeJoin('sudoku', 'medium');
    expect(data?.match_id).toBe('match-42');
    expect(data?.config_seed).toBe(12345);
    expect(data?.queued).toBe(false);
  });

  it('returns error string on RPC failure', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Queue full' } });
    const { data, error } = await matchmakeJoin('sudoku', null);
    expect(error).toBe('Queue full');
    expect(data).toBeNull();
  });

  it('handles null difficulty', async () => {
    mockRpc.mockResolvedValue({ data: { queued: true, queue_id: 'q2', match_id: null, config_seed: null, queue_size: 1 }, error: null });
    await matchmakeJoin('rytmrush', null);
    expect(mockRpc).toHaveBeenCalledWith('matchmake_join', { p_game_id: 'rytmrush', p_difficulty: null });
  });
});

/* ── matchmakeLeave ── */

describe('matchmakeLeave', () => {
  it('calls rpc with correct game_id', async () => {
    mockRpc.mockResolvedValue({ error: null });
    const err = await matchmakeLeave('sudoku');
    expect(err).toBeNull();
    expect(mockRpc).toHaveBeenCalledWith('matchmake_leave', { p_game_id: 'sudoku' });
  });

  it('returns error on failure', async () => {
    mockRpc.mockResolvedValue({ error: { message: 'Not in queue' } });
    const err = await matchmakeLeave('sudoku');
    expect(err).toBe('Not in queue');
  });
});

/* ── matchmakePoll ── */

describe('matchmakePoll', () => {
  it('returns queued result when still waiting', async () => {
    mockRpc.mockResolvedValue({
      data: { queued: true, queue_id: 'q3', match_id: null, config_seed: null, queue_size: 1 },
      error: null,
    });
    const { data, error } = await matchmakePoll('sudoku');
    expect(error).toBeNull();
    expect(data?.queued).toBe(true);
    expect(data?.match_id).toBeNull();
  });

  it('returns match_id when matched by another player', async () => {
    mockRpc.mockResolvedValue({
      data: { queued: false, queue_id: null, match_id: 'match-99', config_seed: 555, queue_size: 0 },
      error: null,
    });
    const { data } = await matchmakePoll('sudoku');
    expect(data?.match_id).toBe('match-99');
    expect(data?.config_seed).toBe(555);
  });

  it('returns error on failure', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'DB error' } });
    const { error } = await matchmakePoll('sudoku');
    expect(error).toBe('DB error');
  });
});
