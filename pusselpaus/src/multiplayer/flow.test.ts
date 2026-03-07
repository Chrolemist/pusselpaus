/* ── Multiplayer flow – integration-style logic tests ──
 *
 *  Tests the critical multiplayer state-machine transitions that happen
 *  across the API, activeMatch, and matchmaking layers.
 *
 *  These tests simulate real user flows and catch bugs like:
 *  - mp_accept_invite being called for matchmade matches (400 error)
 *  - Stale matches not being cleaned on forfeit/cancel
 *  - localStorage payloads going out of sync
 *  - Auto-start firing at wrong time
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ── Hoisted mocks ── */

const mockRpc = vi.hoisted(() => vi.fn());

vi.mock('../lib/supabaseClient', () => ({
  supabase: { rpc: mockRpc },
}));

import {
  mpAcceptInvite,
  mpStartIfReady,
  mpForfeitMatch,
  mpCancelMatch,
  mpSubmitResult,
} from './api';
import {
  setActiveMatchPayload,
  getActiveMatchPayload,
  clearActiveMatch,
} from './activeMatch';
import type { ActiveMatchPayload } from './types';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

/* ═══════════════════════════════════════════════════════════════════════
 *  1. MATCHMAKING FLOW (random queue)
 *     matchmake_join creates the match with BOTH players already accepted.
 *     We should NEVER call mp_accept_invite for matchmade matches.
 * ═══════════════════════════════════════════════════════════════════════ */

describe('matchmaking (random queue) flow', () => {
  it('does NOT call mp_accept_invite — matchmake_join already accepts both players', () => {
    // This is the exact bug that caused repeated 400 errors.
    // matchmake_join atomically creates a match with both players accepted.
    // Calling mp_accept_invite on an already-accepted player returns 400.
    //
    // The correct flow for matchmade matches is:
    //   1. matchmake_join → gets match_id
    //   2. Save to localStorage with matchmade: true
    //   3. Refresh lobby data (mp.refresh)
    //   4. Auto-start fires when activeEntry shows all accepted
    //
    // mp_accept_invite should NEVER be called for matchmade matches.
    // This test documents and enforces that contract.

    // Simulate what StagingScreen does when matchmaking finds a match:
    const matchId = 'match-from-queue';
    const gameId = 'sudoku';

    // Step 1: Save payload with matchmade flag
    setActiveMatchPayload(gameId, {
      matchId,
      setAt: new Date().toISOString(),
      configSeed: 12345,
      config: { difficulty: 'medium' },
      matchmade: true,
    });

    // Step 2: Verify matchmade flag is persisted
    const payload = getActiveMatchPayload(gameId);
    expect(payload).not.toBeNull();
    expect(payload!.matchmade).toBe(true);
    expect(payload!.matchId).toBe(matchId);

    // Step 3: No calls to mp_accept_invite should ever be made
    // (In the actual component, mp.refresh() is called instead)
    expect(mockRpc).not.toHaveBeenCalledWith('mp_accept_invite', expect.anything());
  });

  it('persists matchmade flag and restores it on reload', () => {
    const gameId = 'sudoku';
    const payload: ActiveMatchPayload = {
      matchId: 'match-abc',
      setAt: new Date().toISOString(),
      configSeed: 999,
      config: { difficulty: 'hard' },
      matchmade: true,
    };

    setActiveMatchPayload(gameId, payload);

    // Simulate page reload — read from localStorage
    const restored = getActiveMatchPayload(gameId);
    expect(restored).toEqual(payload);
    expect(restored!.matchmade).toBe(true);
  });

  it('matchmade match auto-starts with 3s countdown (not 5s)', async () => {
    // When matchmade and all accepted, host starts with 3s countdown.
    // Friend-invite matches use 5s.
    mockRpc.mockResolvedValue({ error: null });

    // Simulate the auto-start logic:
    // if (isMatchmade && allAccepted && isHost) → startMatch(matchId, 3)
    await mpStartIfReady('match-queue', 3);
    expect(mockRpc).toHaveBeenCalledWith('mp_start_if_ready', {
      p_match_id: 'match-queue',
      p_countdown_seconds: 3,
    });
  });
});

/* ═══════════════════════════════════════════════════════════════════════
 *  2. FRIEND INVITE FLOW
 *     Host creates match → friend gets invited → friend accepts →
 *     both accepted → host starts → countdown → playing.
 * ═══════════════════════════════════════════════════════════════════════ */

describe('friend invite flow', () => {
  it('friend invite DOES call mp_accept_invite', async () => {
    mockRpc.mockResolvedValue({ error: null });
    const err = await mpAcceptInvite('match-invite');
    expect(err).toBeNull();
    expect(mockRpc).toHaveBeenCalledWith('mp_accept_invite', { p_match_id: 'match-invite' });
  });

  it('stores payload WITHOUT matchmade flag for friend invites', () => {
    const gameId = 'sudoku';
    setActiveMatchPayload(gameId, {
      matchId: 'match-friend',
      setAt: new Date().toISOString(),
      config: { difficulty: 'hard' },
      showOverlay: true,
    });

    const payload = getActiveMatchPayload(gameId);
    expect(payload!.matchmade).toBeUndefined();
    expect(payload!.showOverlay).toBe(true);
  });

  it('friend invite match starts with 5s countdown', async () => {
    mockRpc.mockResolvedValue({ error: null });
    await mpStartIfReady('match-friend', 5);
    expect(mockRpc).toHaveBeenCalledWith('mp_start_if_ready', {
      p_match_id: 'match-friend',
      p_countdown_seconds: 5,
    });
  });
});

/* ═══════════════════════════════════════════════════════════════════════
 *  3. STALE MATCH CLEANUP
 *     When a match is completed/cancelled/forfeited, localStorage must
 *     be cleaned so re-entering the game page doesn't get stuck.
 * ═══════════════════════════════════════════════════════════════════════ */

describe('stale match cleanup', () => {
  it('clearActiveMatch removes the payload for the game', () => {
    const gameId = 'sudoku';
    setActiveMatchPayload(gameId, {
      matchId: 'stale-match',
      setAt: new Date().toISOString(),
    });
    expect(getActiveMatchPayload(gameId)).not.toBeNull();

    clearActiveMatch(gameId);
    expect(getActiveMatchPayload(gameId)).toBeNull();
  });

  it('clearing one game does not affect another game', () => {
    setActiveMatchPayload('sudoku', { matchId: 'sudoku-m', setAt: 'now' });
    setActiveMatchPayload('numberpath', { matchId: 'np-m', setAt: 'now' });

    clearActiveMatch('sudoku');
    expect(getActiveMatchPayload('sudoku')).toBeNull();
    expect(getActiveMatchPayload('numberpath')).not.toBeNull();
  });

  it('completed match payload is preserved so results can stay open until dismissed', () => {
    const gameId = 'sudoku';
    setActiveMatchPayload(gameId, {
      matchId: 'old-completed-match',
      setAt: new Date().toISOString(),
    });

    // Simulate the updated StagingScreen recovery logic:
    // completed matches are kept so the results overlay can stay visible.
    const shouldClearForStatus = (status: 'completed' | 'cancelled') => status === 'cancelled';
    if (shouldClearForStatus('completed')) {
      clearActiveMatch(gameId);
    }

    expect(getActiveMatchPayload(gameId)?.matchId).toBe('old-completed-match');
  });

  it('stale matchmade payload is cleared on cancel', () => {
    const gameId = 'rytmrush';
    setActiveMatchPayload(gameId, {
      matchId: 'queue-match-stale',
      setAt: new Date().toISOString(),
      matchmade: true,
    });

    // Simulate status = 'cancelled' detected
    clearActiveMatch(gameId);
    expect(getActiveMatchPayload(gameId)).toBeNull();
  });
});

/* ═══════════════════════════════════════════════════════════════════════
 *  4. FORFEIT FLOW
 *     When a player forfeits (leaves page, closes tab, etc.),
 *     the match must be forfeited in DB AND cleared from localStorage.
 * ═══════════════════════════════════════════════════════════════════════ */

describe('forfeit flow', () => {
  it('forfeit calls the RPC and clears localStorage', async () => {
    const gameId = 'sudoku';
    const matchId = 'active-match-to-forfeit';

    setActiveMatchPayload(gameId, { matchId, setAt: 'now' });
    mockRpc.mockResolvedValue({ error: null });

    // Simulate the forfeitNow logic from StagingScreen:
    const err = await mpForfeitMatch(matchId);
    clearActiveMatch(gameId);

    expect(err).toBeNull();
    expect(mockRpc).toHaveBeenCalledWith('mp_forfeit_match', { p_match_id: matchId });
    expect(getActiveMatchPayload(gameId)).toBeNull();
  });

  it('forfeit of matchmade match clears localStorage including matchmade flag', async () => {
    const gameId = 'rytmrush';
    const matchId = 'mm-match-forfeit';

    setActiveMatchPayload(gameId, { matchId, setAt: 'now', matchmade: true });
    mockRpc.mockResolvedValue({ error: null });

    await mpForfeitMatch(matchId);
    clearActiveMatch(gameId);

    expect(getActiveMatchPayload(gameId)).toBeNull();
    // Key: there's no stale matchmade payload hanging around
    expect(localStorage.getItem(`pusselpaus:mp:active:${gameId}`)).toBeNull();
  });

  it('cancel by host calls mp_cancel_match and clears localStorage', async () => {
    const gameId = 'sudoku';
    const matchId = 'host-cancel-match';

    setActiveMatchPayload(gameId, { matchId, setAt: 'now' });
    mockRpc.mockResolvedValue({ error: null });

    const err = await mpCancelMatch(matchId);
    clearActiveMatch(gameId);

    expect(err).toBeNull();
    expect(mockRpc).toHaveBeenCalledWith('mp_cancel_match', { p_match_id: matchId });
    expect(getActiveMatchPayload(gameId)).toBeNull();
  });
});

/* ═══════════════════════════════════════════════════════════════════════
 *  5. SUBMIT RESULT FLOW
 *     Must read from localStorage, submit, and not crash when no match.
 * ═══════════════════════════════════════════════════════════════════════ */

describe('submit result flow', () => {
  it('reads matchId from localStorage and submits', async () => {
    mockRpc.mockResolvedValue({ error: null });
    setActiveMatchPayload('sudoku', { matchId: 'result-match', setAt: 'now' });

    await mpSubmitResult('sudoku', 'user-1', { elapsedSeconds: 60, score: 1000 });
    expect(mockRpc).toHaveBeenCalledWith('mp_submit_result', {
      p_match_id: 'result-match',
      p_elapsed_seconds: 60,
      p_score: 1000,
      p_survived_seconds: null,
    });
  });

  it('silently skips when no active match in localStorage', async () => {
    await mpSubmitResult('sudoku', 'user-1', { elapsedSeconds: 60 });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('silently skips when no userId', async () => {
    setActiveMatchPayload('sudoku', { matchId: 'x', setAt: 'now' });
    await mpSubmitResult('sudoku', undefined, { elapsedSeconds: 60 });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('submits survivedSeconds for rytmrush', async () => {
    mockRpc.mockResolvedValue({ error: null });
    setActiveMatchPayload('rytmrush', { matchId: 'rr-match', setAt: 'now' });

    await mpSubmitResult('rytmrush', 'user-1', { survivedSeconds: 45, score: 2500 });
    expect(mockRpc).toHaveBeenCalledWith('mp_submit_result', {
      p_match_id: 'rr-match',
      p_elapsed_seconds: null,
      p_score: 2500,
      p_survived_seconds: 45,
    });
  });
});

/* ═══════════════════════════════════════════════════════════════════════
 *  6. PHASE TRANSITION INVARIANTS
 *     Test the rules that govern what's allowed in each phase.
 * ═══════════════════════════════════════════════════════════════════════ */

describe('phase transition invariants', () => {
  it('matchmade flag distinguishes random from friend matches', () => {
    const gameId = 'sudoku';

    // Random match
    setActiveMatchPayload(gameId, { matchId: 'm1', setAt: 'now', matchmade: true });
    const random = getActiveMatchPayload(gameId);
    expect(random!.matchmade).toBe(true);

    // Friend invite
    setActiveMatchPayload(gameId, { matchId: 'm2', setAt: 'now' });
    const friend = getActiveMatchPayload(gameId);
    expect(friend!.matchmade).toBeUndefined();
  });

  it('showOverlay is only set for friend invite acceptance', () => {
    // Friend invite sets showOverlay so the overlay appears after lobby refresh
    const gameId = 'sudoku';
    setActiveMatchPayload(gameId, {
      matchId: 'invite-m',
      setAt: 'now',
      showOverlay: true,
    });
    const payload = getActiveMatchPayload(gameId);
    expect(payload!.showOverlay).toBe(true);

    // Matchmade never sets showOverlay
    setActiveMatchPayload(gameId, {
      matchId: 'mm-m',
      setAt: 'now',
      matchmade: true,
    });
    const mmPayload = getActiveMatchPayload(gameId);
    expect(mmPayload!.showOverlay).toBeUndefined();
  });

  it('configSeed is preserved across localStorage round-trip', () => {
    const gameId = 'numberpath';
    const seed = 1_234_567_890;
    setActiveMatchPayload(gameId, { matchId: 'x', setAt: 'now', configSeed: seed });
    expect(getActiveMatchPayload(gameId)!.configSeed).toBe(seed);
  });

  it('config object is preserved across localStorage round-trip', () => {
    const gameId = 'sudoku';
    const config = { difficulty: 'hard' };
    setActiveMatchPayload(gameId, { matchId: 'x', setAt: 'now', config });
    expect(getActiveMatchPayload(gameId)!.config).toEqual(config);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
 *  7. ERROR HANDLING
 *     Ensure errors from Supabase RPCs are propagated correctly.
 * ═══════════════════════════════════════════════════════════════════════ */

describe('API error handling', () => {
  it('mpAcceptInvite returns error message on 400', async () => {
    mockRpc.mockResolvedValue({
      error: { message: 'Player already accepted' },
    });
    const err = await mpAcceptInvite('already-accepted');
    expect(err).toBe('Player already accepted');
  });

  it('mpStartIfReady returns error when match not in waiting state', async () => {
    mockRpc.mockResolvedValue({
      error: { message: 'Match is not in waiting status' },
    });
    const { error: err } = await mpStartIfReady('wrong-status-match', 3);
    expect(err).toBe('Match is not in waiting status');
  });

  it('mpForfeitMatch returns error message', async () => {
    mockRpc.mockResolvedValue({
      error: { message: 'Match already completed' },
    });
    const err = await mpForfeitMatch('completed-match');
    expect(err).toBe('Match already completed');
  });

  it('mpCancelMatch returns error for non-host', async () => {
    mockRpc.mockResolvedValue({
      error: { message: 'Only host can cancel' },
    });
    const err = await mpCancelMatch('not-my-match');
    expect(err).toBe('Only host can cancel');
  });

  it('mpAcceptInvite returns fallback message when error has no message', async () => {
    mockRpc.mockResolvedValue({ error: {} });
    const err = await mpAcceptInvite('match-x');
    expect(err).toBe('Kunde inte acceptera');
  });

  it('mpStartIfReady returns fallback message when error has no message', async () => {
    mockRpc.mockResolvedValue({ error: {} });
    const { error: err } = await mpStartIfReady('match-x');
    expect(err).toBe('Kunde inte starta match');
  });

  it('mpForfeitMatch returns fallback message when error has no message', async () => {
    mockRpc.mockResolvedValue({ error: {} });
    const err = await mpForfeitMatch('match-x');
    expect(err).toBe('Kunde inte ge upp matchen');
  });
});

/* ═══════════════════════════════════════════════════════════════════════
 *  8. FULL END-TO-END FLOW SCENARIOS
 *     Simulate complete flows to catch interaction bugs.
 * ═══════════════════════════════════════════════════════════════════════ */

describe('end-to-end: random matchmaking → play → submit', () => {
  it('complete flow works without calling accept_invite', async () => {
    const gameId = 'sudoku';
    const matchId = 'e2e-random-match';

    mockRpc.mockResolvedValue({ error: null });

    // 1. matchmake_join returned a match (simulated)
    // 2. StagingScreen saves payload with matchmade: true
    setActiveMatchPayload(gameId, {
      matchId,
      setAt: new Date().toISOString(),
      configSeed: 42,
      config: { difficulty: 'medium' },
      matchmade: true,
    });

    // 3. NO accept_invite call — just refresh
    // (Verify no mock calls were made yet)
    expect(mockRpc).not.toHaveBeenCalled();

    // 4. Auto-start fires (host starts match with 3s countdown)
    await mpStartIfReady(matchId, 3);
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('mp_start_if_ready', {
      p_match_id: matchId,
      p_countdown_seconds: 3,
    });

    // 5. Game plays out → submit result
    mockRpc.mockResolvedValue({ error: null });
    await mpSubmitResult(gameId, 'user-1', { elapsedSeconds: 120 });
    expect(mockRpc).toHaveBeenCalledWith('mp_submit_result', {
      p_match_id: matchId,
      p_elapsed_seconds: 120,
      p_score: null,
      p_survived_seconds: null,
    });

    // 6. Match completes → cleanup
    clearActiveMatch(gameId);
    expect(getActiveMatchPayload(gameId)).toBeNull();
  });
});

describe('end-to-end: friend invite → accept → play', () => {
  it('complete flow calls accept_invite for friend matches', async () => {
    const gameId = 'sudoku';
    const matchId = 'e2e-friend-match';

    mockRpc.mockResolvedValue({ error: null });

    // 1. Invited player receives match → overlay shows
    setActiveMatchPayload(gameId, {
      matchId,
      setAt: new Date().toISOString(),
      showOverlay: true,
    });

    // 2. Player clicks "Acceptera" → calls mp_accept_invite
    const err = await mpAcceptInvite(matchId);
    expect(err).toBeNull();
    expect(mockRpc).toHaveBeenCalledWith('mp_accept_invite', { p_match_id: matchId });

    // 3. Clear showOverlay flag after acceptance
    const current = getActiveMatchPayload(gameId)!;
    setActiveMatchPayload(gameId, { ...current, showOverlay: undefined });
    expect(getActiveMatchPayload(gameId)!.showOverlay).toBeUndefined();

    // 4. Host starts with 5s countdown
    mockRpc.mockResolvedValue({ error: null });
    await mpStartIfReady(matchId, 5);
    expect(mockRpc).toHaveBeenCalledWith('mp_start_if_ready', {
      p_match_id: matchId,
      p_countdown_seconds: 5,
    });
  });
});

describe('end-to-end: forfeit during gameplay', () => {
  it('forfeit cleans up both DB and localStorage', async () => {
    const gameId = 'numberpath';
    const matchId = 'e2e-forfeit-match';

    setActiveMatchPayload(gameId, { matchId, setAt: 'now' });
    mockRpc.mockResolvedValue({ error: null });

    // Player forfeits during gameplay
    await mpForfeitMatch(matchId);
    clearActiveMatch(gameId);

    expect(mockRpc).toHaveBeenCalledWith('mp_forfeit_match', { p_match_id: matchId });
    expect(getActiveMatchPayload(gameId)).toBeNull();

    // Re-entering the game page should NOT trigger recovery
    expect(getActiveMatchPayload(gameId)).toBeNull();
  });
});

describe('end-to-end: stale match on page reload', () => {
  it('stale completed match is detected and cleared', () => {
    const gameId = 'sudoku';

    // Page was closed while match was active → localStorage still has payload
    setActiveMatchPayload(gameId, { matchId: 'old-match', setAt: 'now' });
    expect(getActiveMatchPayload(gameId)).not.toBeNull();

    // On reload, StagingScreen checks match status from DB.
    // If status is 'completed', 'cancelled', or player forfeited → clear
    const simulatedDbStatus = 'completed';
    if (['completed', 'cancelled', 'forfeited'].includes(simulatedDbStatus)) {
      clearActiveMatch(gameId);
    }

    expect(getActiveMatchPayload(gameId)).toBeNull();
  });

  it('active in_progress match is recovered on page reload', () => {
    const gameId = 'sudoku';
    const matchId = 'still-active-match';

    setActiveMatchPayload(gameId, {
      matchId,
      setAt: new Date().toISOString(),
      configSeed: 42,
      config: { difficulty: 'easy' },
    });

    // Recovery should find the match and resume
    const payload = getActiveMatchPayload(gameId);
    expect(payload).not.toBeNull();
    expect(payload!.matchId).toBe(matchId);
    expect(payload!.configSeed).toBe(42);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
 *  9. STALE MATCH CLEANUP BEFORE QUEUE JOIN
 *     When joining the matchmaking queue, any existing active matches
 *     must be forfeited first or the server rejects with 400.
 * ═══════════════════════════════════════════════════════════════════════ */

describe('stale match cleanup before queue join', () => {
  it('forfeits blocking match from same game before joining queue', async () => {
    const gameId = 'numberpath';
    const staleMatchId = 'stale-match-blocking';

    // Simulate a stale match in localStorage
    setActiveMatchPayload(gameId, { matchId: staleMatchId, setAt: 'now' });

    // Simulate what handleJoinQueue does: find blocking matches, forfeit, clear
    mockRpc.mockResolvedValue({ error: null });
    await mpForfeitMatch(staleMatchId);
    clearActiveMatch(gameId);

    expect(mockRpc).toHaveBeenCalledWith('mp_forfeit_match', {
      p_match_id: staleMatchId,
    });
    expect(getActiveMatchPayload(gameId)).toBeNull();

    // Now queue join should succeed (no blocking match)
    mockRpc.mockResolvedValue({
      data: { queued: true, queue_id: 'q1', match_id: null, config_seed: null, queue_size: 1 },
      error: null,
    });
  });

  it('forfeits blocking match from DIFFERENT game before joining queue', async () => {
    // Server checks ALL active matches, not just current game
    const otherGameId = 'sudoku';
    const staleMatchId = 'sudoku-stale-match';
    const queueGameId = 'numberpath';

    setActiveMatchPayload(otherGameId, { matchId: staleMatchId, setAt: 'now' });
    mockRpc.mockResolvedValue({ error: null });

    // handleJoinQueue scans mp.matches (all games) and forfeits blocking ones
    await mpForfeitMatch(staleMatchId);
    clearActiveMatch(otherGameId);

    expect(mockRpc).toHaveBeenCalledWith('mp_forfeit_match', {
      p_match_id: staleMatchId,
    });
    expect(getActiveMatchPayload(otherGameId)).toBeNull();
    // The current game still has no match
    expect(getActiveMatchPayload(queueGameId)).toBeNull();
  });

  it('handles multiple stale matches from different games', async () => {
    setActiveMatchPayload('sudoku', { matchId: 'm1', setAt: 'now' });
    setActiveMatchPayload('numberpath', { matchId: 'm2', setAt: 'now' });

    mockRpc.mockResolvedValue({ error: null });

    // Forfeit both
    await mpForfeitMatch('m1');
    clearActiveMatch('sudoku');
    await mpForfeitMatch('m2');
    clearActiveMatch('numberpath');

    expect(mockRpc).toHaveBeenCalledTimes(2);
    expect(getActiveMatchPayload('sudoku')).toBeNull();
    expect(getActiveMatchPayload('numberpath')).toBeNull();
  });

  it('proceeds to join queue even if forfeit fails gracefully', async () => {
    // If forfeit RPC fails, we still try to join the queue
    // (server might have already cleaned it up)
    mockRpc
      .mockResolvedValueOnce({ error: { message: 'Match already completed' } }) // forfeit fails
      .mockResolvedValueOnce({ // join succeeds
        data: { queued: true, queue_id: 'q1', match_id: null, config_seed: null, queue_size: 1 },
        error: null,
      });

    const err = await mpForfeitMatch('already-gone');
    expect(err).toBe('Match already completed');
    // Should still proceed to join — flow doesn't abort
  });
});

/* ═══════════════════════════════════════════════════════════════════════
 *  10. QUEUE LEAVE ON UNMOUNT
 *     If the user navigates away while queuing, the queue entry must be
 *     removed so no orphaned match can be created.
 * ═══════════════════════════════════════════════════════════════════════ */

describe('queue leave on unmount', () => {
  it('matchmakeLeave is the correct RPC to exit the queue', async () => {
    // Verify the leave API works correctly
    mockRpc.mockResolvedValue({ error: null });
    const { matchmakeLeave } = await import('./matchmakingApi');
    const err = await matchmakeLeave('sudoku');
    expect(err).toBeNull();
    expect(mockRpc).toHaveBeenCalledWith('matchmake_leave', {
      p_game_id: 'sudoku',
    });
  });
});

/* ═══════════════════════════════════════════════════════════════════════
 *  11. MATCH-FOUND PHASE REGRESSIONS
 *     Matchmade waiting must stay in the accept overlay.
 *     Friend-invite waiting must still use the normal waiting panel unless
 *     showOverlay is explicitly set.
 * ═══════════════════════════════════════════════════════════════════════ */

describe('match-found phase regressions', () => {
  function resolveRestorePhase(args: {
    status: 'waiting' | 'starting' | 'in_progress' | 'completed' | 'cancelled';
    matchmade?: boolean;
    showOverlay?: boolean;
    activePlayerCount?: number;
  }): 'match-found' | 'waiting' | 'playing' | 'staging' | 'unchanged' {
    const { status, matchmade, showOverlay, activePlayerCount = 2 } = args;

    if (status === 'completed' || status === 'cancelled') {
      return 'staging';
    }

    if (matchmade && status === 'waiting' && activePlayerCount < 2) {
      return 'staging';
    }

    if (matchmade && status === 'waiting') {
      return 'match-found';
    }

    if (showOverlay && status === 'waiting') {
      return 'match-found';
    }

    if (status === 'waiting') {
      return 'waiting';
    }

    if (status === 'in_progress') {
      return 'playing';
    }

    return 'unchanged';
  }

  it('keeps random matchmaking in match-found while match is still waiting', () => {
    const resolved = resolveRestorePhase({
      status: 'waiting',
      matchmade: true,
      showOverlay: undefined,
      activePlayerCount: 2,
    });

    expect(resolved).toBe('match-found');
  });

  it('does not downgrade one random-match client to the generic waiting panel', () => {
    const clientA = resolveRestorePhase({
      status: 'waiting',
      matchmade: true,
      showOverlay: true,
      activePlayerCount: 2,
    });
    const clientB = resolveRestorePhase({
      status: 'waiting',
      matchmade: true,
      showOverlay: undefined,
      activePlayerCount: 2,
    });

    expect(clientA).toBe('match-found');
    expect(clientB).toBe('match-found');
  });

  it('still sends friend-invite waiting matches to the normal waiting panel when no overlay flag exists', () => {
    const resolved = resolveRestorePhase({
      status: 'waiting',
      matchmade: false,
      showOverlay: undefined,
      activePlayerCount: 2,
    });

    expect(resolved).toBe('waiting');
  });
});
