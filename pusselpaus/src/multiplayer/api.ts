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
