/* ── useMatchmaking – matchmaking queue hook ──
 *
 *  Manages the lifecycle of joining, polling, and leaving
 *  the random-match queue.
 *
 *  Usage:
 *    const mm = useMatchmaking('sudoku');
 *    mm.join('medium');     // enter queue
 *    mm.leave();            // cancel
 *    // mm.status: 'idle' | 'queuing' | 'matched'
 *    // mm.matchId: string when matched
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { matchmakeJoin, matchmakeLeave, matchmakePoll } from './matchmakingApi';
import type { MatchmakeResult } from './matchmakingApi';

export type MatchmakingStatus = 'idle' | 'queuing' | 'matched';

export interface MatchmakingState {
  status: MatchmakingStatus;
  /** match id once matched */
  matchId: string | null;
  /** config seed for the matched game */
  configSeed: number | null;
  /** Number of players currently waiting in queue */
  queueSize: number;
  /** Seconds spent in queue */
  elapsed: number;
  /** Error from last operation */
  error: string | null;
  /** Join the queue */
  join: (difficulty: string | null) => Promise<void>;
  /** Leave the queue */
  leave: () => Promise<void>;
  /** Reset local matchmaking state without touching the server */
  reset: () => void;
}

const POLL_INTERVAL = 2000; // 2s

export function useMatchmaking(gameId: string): MatchmakingState {
  const [status, setStatus] = useState<MatchmakingStatus>('idle');
  const [matchId, setMatchId] = useState<string | null>(null);
  const [configSeed, setConfigSeed] = useState<number | null>(null);
  const [queueSize, setQueueSize] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const clearLocalState = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }

    if (!mountedRef.current) return;
    setStatus('idle');
    setMatchId(null);
    setConfigSeed(null);
    setQueueSize(0);
    setElapsed(0);
    setError(null);
  }, []);

  // Track status for unmount cleanup
  const statusRef = useRef(status);
  useEffect(() => { statusRef.current = status; }, [status]);

  // Cleanup on unmount — leave the queue if still queuing
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pollRef.current) clearInterval(pollRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
      // If still queuing when unmounting, leave the queue so no orphaned match is created
      if (statusRef.current === 'queuing') {
        void matchmakeLeave(gameId);
      }
    };
  }, [gameId]);

  const handleResult = useCallback((result: MatchmakeResult) => {
    if (!mountedRef.current) return;
    setQueueSize(result.queue_size);

    if (result.match_id) {
      // Matched!
      setStatus('matched');
      setMatchId(result.match_id);
      setConfigSeed(result.config_seed);
      setError(null);
      // Stop polling
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
  }, []);

  const startPolling = useCallback(() => {
    // Poll periodically to see if another player's join created the match
    pollRef.current = setInterval(async () => {
      const { data, error: pollError } = await matchmakePoll(gameId);
      if (!mountedRef.current) return;
      if (pollError) {
        setError(pollError);
        return;
      }
      if (data) handleResult(data);
    }, POLL_INTERVAL);

    // Elapsed timer
    const startTime = Date.now();
    timerRef.current = setInterval(() => {
      if (!mountedRef.current) return;
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
  }, [gameId, handleResult]);

  const join = useCallback(async (difficulty: string | null) => {
    clearLocalState();
    setError(null);
    setElapsed(0);
    setStatus('queuing');

    const { data, error: joinError } = await matchmakeJoin(gameId, difficulty);

    if (!mountedRef.current) return;

    if (joinError || !data) {
      setError(joinError ?? 'Okänt fel');
      setStatus('idle');
      return;
    }

    handleResult(data);

    // If still queued (not immediately matched), start polling
    if (data.queued) {
      startPolling();
    }
  }, [clearLocalState, gameId, handleResult, startPolling]);

  const leave = useCallback(async () => {
    clearLocalState();
    await matchmakeLeave(gameId);
  }, [clearLocalState, gameId]);

  const reset = useCallback(() => {
    clearLocalState();
  }, [clearLocalState]);

  return {
    status,
    matchId,
    configSeed,
    queueSize,
    elapsed,
    error,
    join,
    leave,
    reset,
  };
}
