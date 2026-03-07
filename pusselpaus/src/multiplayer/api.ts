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

export interface MpReadyResult {
  ok?: boolean;
  all_ready?: boolean;
  allReady?: boolean;
  ready_count?: number;
  readyCount?: number;
  total_count?: number;
  totalCount?: number;
  status?: string;
  reason?: string;
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function toBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  return undefined;
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function readField(row: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (key in row) return row[key];
  }

  const normalizedMap = new Map<string, unknown>();
  for (const [rawKey, value] of Object.entries(row)) {
    normalizedMap.set(normalizeKey(rawKey), value);
  }
  for (const key of keys) {
    const normalized = normalizeKey(key);
    if (normalizedMap.has(normalized)) return normalizedMap.get(normalized);
  }
  return undefined;
}

const RPC_HINT_KEYS = [
  'ok',
  'all_ready',
  'allReady',
  'ready_count',
  'readyCount',
  'total_count',
  'totalCount',
  'me_ready',
  'meReady',
  'status',
  'reason',
  'started',
  'started_at',
  'startedAt',
] as const;

function hasRpcHints(row: Record<string, unknown>): boolean {
  return RPC_HINT_KEYS.some((key) => readField(row, [key]) !== undefined);
}

function pickRpcRow(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const row = pickRpcRow(item);
      if (row) return row;
    }
    return null;
  }
  if (typeof value === 'object') {
    const row = value as Record<string, unknown>;
    const nested = row.data ?? row.result ?? row.payload;
    if (nested !== undefined) {
      const nestedRow = pickRpcRow(nested);
      if (nestedRow) {
        return {
          ...row,
          ...nestedRow,
        };
      }
    }

    if (hasRpcHints(row)) return row;

    const objectEntries = Object.entries(row).filter(([, entryValue]) => (
      entryValue !== null && typeof entryValue === 'object'
    ));
    if (objectEntries.length === 1) {
      const [, singleNested] = objectEntries[0];
      const nestedRow = pickRpcRow(singleNested);
      if (nestedRow) {
        return {
          ...row,
          ...nestedRow,
        };
      }
    }

    for (const [, entryValue] of objectEntries) {
      const nestedRow = pickRpcRow(entryValue);
      if (nestedRow) {
        return {
          ...row,
          ...nestedRow,
        };
      }
    }
    return row;
  }
  return null;
}

function normalizeReadyResult(value: unknown): MpReadyResult | null {
  const row = pickRpcRow(value);
  if (!row) return null;
  return {
    ok: toBoolean(readField(row, ['ok'])),
    all_ready: toBoolean(readField(row, ['all_ready', 'allReady'])),
    ready_count: toNumber(readField(row, ['ready_count', 'readyCount'])),
    total_count: toNumber(readField(row, ['total_count', 'totalCount'])),
    status: typeof readField(row, ['status']) === 'string' ? (readField(row, ['status']) as string) : undefined,
    reason: typeof readField(row, ['reason']) === 'string' ? (readField(row, ['reason']) as string) : undefined,
  };
}

export async function mpMarkReady(matchId: string): Promise<{ error: string | null; data: MpReadyResult | null }> {
  mpDebug('api', 'accept:mark_ready_rpc_request', { matchId });
  const { data, error } = await supabase.rpc('mp_mark_ready', { p_match_id: matchId });
  if (error) {
    mpDebug('api', 'accept:mark_ready_rpc_error', {
      matchId,
      message: error.message ?? null,
      code: error.code ?? null,
      details: error.details ?? null,
    });
    return { error: error.message || 'Kunde inte markera redo', data: null };
  }
  mpDebug('api', 'accept:mark_ready_rpc_raw', { matchId, raw: data, type: typeof data, isArray: Array.isArray(data), keys: (data && typeof data === 'object') ? Object.keys(data) : null });
  const normalized = normalizeReadyResult(data);
  mpDebug('api', 'accept:mark_ready_rpc_ok', { matchId, data: normalized });
  return { error: null, data: normalized };
}

export async function mpDeclineInvite(matchId: string): Promise<string | null> {
  const { error } = await supabase.rpc('mp_decline_invite', { p_match_id: matchId });
  return error ? error.message || 'Kunde inte neka' : null;
}

/* ── start / tick ── */

export interface MpStartIfReadyResult {
  ok?: boolean;
  started?: boolean;
  status?: string;
  reason?: string;
  started_at?: string | null;
  ready_count?: number;
  total_count?: number;
}

function normalizeStartIfReadyResult(value: unknown): MpStartIfReadyResult | null {
  const row = pickRpcRow(value);
  if (!row) return null;
  return {
    ok: toBoolean(readField(row, ['ok'])),
    started: toBoolean(readField(row, ['started'])),
    status: typeof readField(row, ['status']) === 'string' ? (readField(row, ['status']) as string) : undefined,
    reason: typeof readField(row, ['reason']) === 'string' ? (readField(row, ['reason']) as string) : undefined,
    started_at: ((): string | null => {
      const candidate = readField(row, ['started_at', 'startedAt']);
      return typeof candidate === 'string' ? candidate : null;
    })(),
    ready_count: toNumber(readField(row, ['ready_count', 'readyCount'])),
    total_count: toNumber(readField(row, ['total_count', 'totalCount'])),
  };
}

export async function mpStartIfReady(
  matchId: string,
  countdownSeconds = 5,
): Promise<{ error: string | null; data: MpStartIfReadyResult | null }> {
  mpDebug('api', 'mp_start_if_ready:request', { matchId, countdownSeconds });
  const { data, error } = await supabase.rpc('mp_start_if_ready', {
    p_match_id: matchId,
    p_countdown_seconds: countdownSeconds,
  });

  if (error) {
    mpDebug('api', 'mp_start_if_ready:error', {
      matchId,
      countdownSeconds,
      code: error.code ?? null,
      message: error.message ?? null,
      details: error.details ?? null,
      hint: error.hint ?? null,
    });
    return { error: error.message || 'Kunde inte starta match', data: null };
  }

  mpDebug('api', 'mp_start_if_ready:ok', {
    matchId,
    countdownSeconds,
    data,
  });
  return { error: null, data: normalizeStartIfReadyResult(data) };
}

export interface MpReadyStateResult {
  ok?: boolean;
  status?: string;
  all_ready?: boolean;
  ready_count?: number;
  total_count?: number;
  me_ready?: boolean;
  started_at?: string | null;
}

function normalizeReadyStateResult(value: unknown): MpReadyStateResult | null {
  const row = pickRpcRow(value);
  if (!row) return null;
  return {
    ok: toBoolean(readField(row, ['ok'])),
    status: typeof readField(row, ['status']) === 'string' ? (readField(row, ['status']) as string) : undefined,
    all_ready: toBoolean(readField(row, ['all_ready', 'allReady'])),
    ready_count: toNumber(readField(row, ['ready_count', 'readyCount'])),
    total_count: toNumber(readField(row, ['total_count', 'totalCount'])),
    me_ready: toBoolean(readField(row, ['me_ready', 'meReady'])),
    started_at: ((): string | null => {
      const candidate = readField(row, ['started_at', 'startedAt']);
      return typeof candidate === 'string' ? candidate : null;
    })(),
  };
}

export async function mpReadyState(
  matchId: string,
): Promise<{ error: string | null; data: MpReadyStateResult | null }> {
  const { data, error } = await supabase.rpc('mp_ready_state', {
    p_match_id: matchId,
  });
  if (error) {
    mpDebug('api', 'accept:ready_state_rpc_error', { matchId, message: error.message ?? null, code: error.code ?? null });
    return { error: error.message || 'Kunde inte läsa ready-state', data: null };
  }
  mpDebug('api', 'accept:ready_state_rpc_raw', { matchId, raw: data, type: typeof data, isArray: Array.isArray(data), keys: (data && typeof data === 'object') ? Object.keys(data) : null });
  return { error: null, data: normalizeReadyStateResult(data) };
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

export interface MpRequestRematchResult {
  ok?: boolean;
  status?: string;
  reason?: string;
  requested_count?: number;
  requestedCount?: number;
  total_count?: number;
  totalCount?: number;
  rematch_match_id?: string | null;
  rematchMatchId?: string | null;
  started_at?: string | null;
  startedAt?: string | null;
  config_seed?: number | null;
  configSeed?: number | null;
  config?: MatchConfig | null;
  stake?: number | null;
}

function normalizeRematchResult(value: unknown): MpRequestRematchResult | null {
  const row = pickRpcRow(value);
  if (!row) return null;
  const startedCandidate = readField(row, ['started_at', 'startedAt']);
  const rematchIdCandidate = readField(row, ['rematch_match_id', 'rematchMatchId']);
  const configSeedCandidate = readField(row, ['config_seed', 'configSeed']);
  const configCandidate = readField(row, ['config']);
  return {
    ok: toBoolean(readField(row, ['ok'])),
    status: typeof readField(row, ['status']) === 'string' ? (readField(row, ['status']) as string) : undefined,
    reason: typeof readField(row, ['reason']) === 'string' ? (readField(row, ['reason']) as string) : undefined,
    requested_count: toNumber(readField(row, ['requested_count', 'requestedCount'])),
    total_count: toNumber(readField(row, ['total_count', 'totalCount'])),
    rematch_match_id: typeof rematchIdCandidate === 'string' ? rematchIdCandidate : null,
    started_at: typeof startedCandidate === 'string' ? startedCandidate : null,
    config_seed: toNumber(configSeedCandidate),
    config: configCandidate && typeof configCandidate === 'object' ? (configCandidate as MatchConfig) : null,
    stake: toNumber(readField(row, ['stake'])),
  };
}

export async function mpRequestRematch(matchId: string): Promise<{ error: string | null; data: MpRequestRematchResult | null }> {
  const { data, error } = await supabase.rpc('mp_request_rematch', { p_match_id: matchId });
  if (error) {
    return {
      error: error.message || 'Kunde inte starta rematch',
      data: null,
    };
  }
  return {
    error: null,
    data: normalizeRematchResult(data),
  };
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

export interface MpForceCleanupResult {
  cleaned: number;
  error: string | null;
}

export async function mpForceCleanupActiveMatches(): Promise<MpForceCleanupResult> {
  const { data, error } = await supabase.rpc('mp_force_cleanup');
  if (error) {
    console.error('[mp] Force cleanup RPC failed:', error);
    return {
      cleaned: 0,
      error: error.message || 'Kunde inte städa matchmaking',
    };
  }
  const cleaned = typeof data === 'number' ? data : 0;
  if (cleaned > 0) {
    console.log(`[mp] Force cleanup: cleaned ${cleaned} matches`);
  }
  return {
    cleaned,
    error: null,
  };
}
