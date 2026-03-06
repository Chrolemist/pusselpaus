/* ── Matchmaking API – Supabase RPC wrappers ──
 *
 *  matchmake_join  → enters the queue, atomically matches if 2+ waiting
 *  matchmake_leave → exits the queue
 *  matchmake_poll  → checks if you've been matched by someone else
 */

import { supabase } from '../lib/supabaseClient';

export interface MatchmakeResult {
  /** true if still in queue waiting */
  queued: boolean;
  /** The queue entry id */
  queue_id: string | null;
  /** Set when matched → the multiplayer_matches.id */
  match_id: string | null;
  /** Config seed for the created match */
  config_seed: number | null;
  /** Number of players in the queue right now (including you) */
  queue_size: number;
}

/** Join the matchmaking queue for a game.
 *  The RPC atomically checks for other waiting players and creates a match
 *  if 2+ are found (up to 5). */
export async function matchmakeJoin(
  gameId: string,
  difficulty: string | null,
): Promise<{ data: MatchmakeResult | null; error: string | null }> {
  const { data, error } = await supabase.rpc('matchmake_join', {
    p_game_id: gameId,
    p_difficulty: difficulty,
  });

  if (error) {
    console.error('[matchmaking] join failed:', error);
    return { data: null, error: error.message || 'Kunde inte gå med i kön' };
  }

  return { data: data as unknown as MatchmakeResult, error: null };
}

/** Leave the matchmaking queue. */
export async function matchmakeLeave(gameId: string): Promise<string | null> {
  const { error } = await supabase.rpc('matchmake_leave', {
    p_game_id: gameId,
  });

  if (error) {
    console.error('[matchmaking] leave failed:', error);
    return error.message || 'Kunde inte lämna kön';
  }
  return null;
}

/** Poll the queue to check if you've been matched.
 *  Called when another player's join triggered the match creation. */
export async function matchmakePoll(
  gameId: string,
): Promise<{ data: MatchmakeResult | null; error: string | null }> {
  const { data, error } = await supabase.rpc('matchmake_poll', {
    p_game_id: gameId,
  });

  if (error) {
    console.error('[matchmaking] poll failed:', error);
    return { data: null, error: error.message || 'Kunde inte hämta köstatus' };
  }

  return { data: data as unknown as MatchmakeResult, error: null };
}
