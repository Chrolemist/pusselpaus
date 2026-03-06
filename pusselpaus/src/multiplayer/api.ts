/* ── Multiplayer Supabase RPC wrappers ──
 *
 *  Plain async functions — no React hooks.
 *  Easy to mock in tests and reuse from hooks or components.
 */

import { supabase } from '../lib/supabaseClient';
import type { MatchConfig } from './types';
import { getActiveMatchPayload } from './activeMatch';
import { mpDebug } from './debug';

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
  mpDebug('api', 'mp_start_match:request', { matchId, countdownSeconds });
  const { error } = await supabase.rpc('mp_start_match', {
    p_match_id: matchId,
    p_countdown_seconds: countdownSeconds,
  });
  if (error) {
    mpDebug('api', 'mp_start_match:error', {
      matchId,
      countdownSeconds,
      code: error.code ?? null,
      message: error.message ?? null,
      details: error.details ?? null,
      hint: error.hint ?? null,
    });
  } else {
    mpDebug('api', 'mp_start_match:ok', { matchId, countdownSeconds });
  }
  return error ? error.message || 'Kunde inte starta match' : null;
}

export async function mpTickMatchStart(matchId: string): Promise<string | null> {
  mpDebug('api', 'mp_tick_match_start:request', { matchId });
  const { data, error } = await supabase.rpc('mp_tick_match_start', {
    p_match_id: matchId,
  });
  if (error) {
    mpDebug('api', 'mp_tick_match_start:error', {
      matchId,
      code: error.code ?? null,
      message: error.message ?? null,
      details: error.details ?? null,
      hint: error.hint ?? null,
    });
    return error.message || 'Kunde inte synka matchstart';
  }
  mpDebug('api', 'mp_tick_match_start:ok', {
    matchId,
    result: typeof data === 'string' ? data : null,
  });
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

    // Fallback for known backend drift:
    // mp_submit_result function references profiles.updated_at in some deployments.
    // If that column is missing, keep live multiplayer sync working by updating
    // the player's row directly.
    if (error.code === '42703' && (error.message ?? '').includes('updated_at')) {
      const { error: fallbackError } = await supabase
        .from('multiplayer_match_players')
        .update({
          submitted: true,
          elapsed_seconds: params.elapsedSeconds ?? null,
          score: params.score ?? null,
          survived_seconds: params.survivedSeconds ?? null,
          submitted_at: new Date().toISOString(),
        })
        .eq('match_id', payload.matchId)
        .eq('user_id', userId);

      if (fallbackError) {
        console.error('[mp] submit fallback failed:', fallbackError);
      } else {
        console.warn('[mp] submit fallback used due to missing profiles.updated_at');
      }
    }
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
 *  Calls the server-side mp_force_cleanup() Postgres function which
 *  runs with SECURITY DEFINER to bypass RLS.
 *
 *  This handles the edge case where a matchmade match is stuck in
 *  'waiting' with both players 'accepted' — no standard RPC can
 *  un-stuck this because:
 *    - mp_cancel_match  → may require host or specific status
 *    - mp_decline_invite → player status is 'accepted', not 'invited'
 *    - mp_forfeit_match  → match not in_progress
 *
 *  The server function bypasses all of that by using SECURITY DEFINER.
 */

export async function mpForceCleanupActiveMatches(): Promise<number> {
  const { data, error } = await supabase.rpc('mp_force_cleanup');
  if (error) {
    console.error('[mp] Force cleanup RPC failed:', error);
    return 0;
  }
  const cleaned = typeof data === 'number' ? data : 0;
  if (cleaned > 0) {
    console.log(`[mp] Force cleanup: cleaned ${cleaned} matches`);
  }
  return cleaned;
}
