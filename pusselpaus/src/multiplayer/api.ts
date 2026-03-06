/* ── Multiplayer Supabase RPC wrappers ──
 *
 *  Plain async functions — no React hooks.
 *  Easy to mock in tests and reuse from hooks or components.
 */

import { supabase } from '../lib/supabaseClient';
import type { MatchConfig } from './types';
import { getActiveMatchPayload } from './activeMatch';

/* ── create ── */

export async function mpCreateMatch(
  gameId: string,
  stake: number,
  invitedIds: string[],
  config: MatchConfig,
  configSeed?: number,
): Promise<string | null> {
  const { error } = await supabase.rpc('mp_create_match', {
    p_game_id: gameId,
    p_stake: stake,
    p_invited_ids: invitedIds,
    p_config: config,
    p_config_seed: configSeed,
  });
  if (error) {
    console.error('[mp] create failed:', error);
    return error.message || 'Kunde inte skapa match';
  }
  return null;
}

/* ── accept / decline ── */

export async function mpAcceptInvite(matchId: string): Promise<string | null> {
  const { error } = await supabase.rpc('mp_accept_invite', { p_match_id: matchId });
  return error ? error.message || 'Kunde inte acceptera' : null;
}

export async function mpDeclineInvite(matchId: string): Promise<string | null> {
  const { error } = await supabase.rpc('mp_decline_invite', { p_match_id: matchId });
  return error ? error.message || 'Kunde inte neka' : null;
}

/* ── start / tick ── */

export async function mpStartMatch(matchId: string, countdownSeconds = 5): Promise<string | null> {
  const { error } = await supabase.rpc('mp_start_match', {
    p_match_id: matchId,
    p_countdown_seconds: countdownSeconds,
  });
  return error ? error.message || 'Kunde inte starta match' : null;
}

export async function mpTickMatchStart(matchId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('mp_tick_match_start', {
    p_match_id: matchId,
  });
  if (error) return error.message || 'Kunde inte synka matchstart';
  return typeof data === 'string' ? data : null;
}

/* ── forfeit ── */

export async function mpForfeitMatch(matchId: string): Promise<string | null> {
  const { error } = await supabase.rpc('mp_forfeit_match', { p_match_id: matchId });
  return error ? error.message || 'Kunde inte ge upp matchen' : null;
}

/* ── cancel (host only, while still waiting) ── */

export async function mpCancelMatch(matchId: string): Promise<string | null> {
  const { error } = await supabase.rpc('mp_cancel_match', { p_match_id: matchId });
  return error ? error.message || 'Kunde inte avbryta matchen' : null;
}

/* ── submit result ──
 *
 *  Reads matchId from localStorage so callers only need the gameId.
 *  Returns silently if no active match – safe to call unconditionally.
 */

export async function mpSubmitResult(
  gameId: string,
  userId: string | undefined,
  params: {
    elapsedSeconds?: number;
    score?: number;
    survivedSeconds?: number;
  },
): Promise<void> {
  if (!userId) return;

  const payload = getActiveMatchPayload(gameId);
  if (!payload?.matchId) return;

  const { error } = await supabase.rpc('mp_submit_result', {
    p_match_id: payload.matchId,
    p_elapsed_seconds: params.elapsedSeconds ?? null,
    p_score: params.score ?? null,
    p_survived_seconds: params.survivedSeconds ?? null,
  });

  if (error) {
    console.error('[mp] submit failed:', error);
  }
}

/* ── timeout resolve ── */

export async function mpTryResolveTimeout(
  matchId: string,
  timeoutSeconds = 180,
): Promise<string | null> {
  const { data, error } = await supabase.rpc('mp_try_resolve_timeout', {
    p_match_id: matchId,
    p_timeout_seconds: timeoutSeconds,
  });
  if (error) {
    console.error('[mp] timeout resolve failed:', error);
    return null;
  }
  return typeof data === 'string' ? data : null;
}

/* ── nuclear cleanup ──
 *
 *  Finds ALL active matches for the current user and force-cleans them.
 *  Tries RPCs first; if ALL fail, falls back to direct table updates.
 *
 *  This handles the edge case where a matchmade match is stuck in
 *  'waiting' with both players 'accepted' — no standard RPC can
 *  un-stuck this because:
 *    - mp_cancel_match  → may require host or specific status
 *    - mp_decline_invite → player status is 'accepted', not 'invited'
 *    - mp_forfeit_match  → match not in_progress
 *
 *  The direct table update bypasses all of that.
 */

export async function mpForceCleanupActiveMatches(userId: string): Promise<number> {
  // 1. Find all match-player rows where I'm still active
  const { data: myPlayers, error: playersErr } = await supabase
    .from('multiplayer_match_players')
    .select('match_id, status')
    .eq('user_id', userId);

  if (playersErr || !myPlayers?.length) return 0;

  const activeMatchIds = myPlayers
    .filter((p) => p.status === 'accepted' || p.status === 'invited')
    .map((p) => p.match_id);

  if (activeMatchIds.length === 0) return 0;

  // 2. Find which of those matches are still live (not completed/cancelled)
  const { data: matchRows } = await supabase
    .from('multiplayer_matches')
    .select('id, status, host_id')
    .in('id', activeMatchIds)
    .in('status', ['waiting', 'starting', 'in_progress']);

  if (!matchRows?.length) return 0;

  let cleaned = 0;

  for (const match of matchRows) {
    // Try RPCs first (cancel → decline → forfeit)
    let success = false;

    if (match.host_id === userId) {
      const e = await mpCancelMatch(match.id);
      if (!e) { success = true; }
    }
    if (!success) {
      const e = await mpDeclineInvite(match.id);
      if (!e) { success = true; }
    }
    if (!success) {
      const e = await mpForfeitMatch(match.id);
      if (!e) { success = true; }
    }

    // Nuclear fallback: direct table updates
    if (!success) {
      console.warn('[mp] RPCs failed for match', match.id, '— using direct table update');

      // Mark my player row as forfeited/declined
      await supabase
        .from('multiplayer_match_players')
        .update({ status: 'declined', forfeited: true })
        .eq('match_id', match.id)
        .eq('user_id', userId);

      // If we're the host or all players have declined, cancel the match
      await supabase
        .from('multiplayer_matches')
        .update({ status: 'cancelled' })
        .eq('id', match.id)
        .in('status', ['waiting', 'starting']);

      success = true;
    }

    if (success) cleaned++;
  }

  console.log(`[mp] Force cleanup: cleaned ${cleaned}/${matchRows.length} matches`);
  return cleaned;
}
