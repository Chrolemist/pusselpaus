/* ── useMultiplayer – lobby-level multiplayer state ──
 *
 *  Used by MatchInboxPanel, StagingScreen and TopBar.
 *  Loads all matches the user is part of, groups them, and exposes actions.
 *
 *  Game-specific labels/paths/difficulties come from game-registry –
 *  no hardcoded game lists here.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth';
import { supabase } from '../lib/supabaseClient';
import type { MultiplayerMatch, MultiplayerMatchPlayer, Profile } from '../lib/database.types';
import { games } from '../game-registry';
import { getActiveMatchKey } from './activeMatch';
import type { MatchConfig } from './types';
import { mpDebug } from './debug';
import {
  mpCreateMatch,
  mpAcceptInvite,
  mpMarkReady,
  mpDeclineInvite,
  mpStartIfReady,
  mpReadyState,
  mpTickMatchStart,
  mpForfeitMatch,
  mpCancelMatch,
} from './api';

/* ── helpers derived from game-registry ── */

const gameMap = new Map(games.map((g) => [g.id, g]));

export function gamePath(gameId: string): string {
  return gameMap.get(gameId)?.path ?? '/';
}

export function gameLabel(gameId: string): string {
  return gameMap.get(gameId)?.name ?? gameId;
}

/** All games that support multiplayer */
export const multiplayerGames = games.filter((g) => !!g.multiplayer);

/* ── match view type ── */

export interface MultiplayerMatchView {
  match: MultiplayerMatch;
  me: MultiplayerMatchPlayer | null;
  players: Array<{
    player: MultiplayerMatchPlayer;
    profile: Pick<Profile, 'id' | 'username' | 'tag' | 'skin' | 'is_online' | 'level'> | null;
  }>;
}

/* ── hook ── */

export function useMultiplayer() {
  const { user } = useAuth();
  const [matches, setMatches] = useState<MultiplayerMatchView[]>([]);
  const [loading, setLoading] = useState(true);

  /* ── single-match enforcement ── */

  const hasBlockingMatch = useCallback(
    (exceptMatchId?: string) =>
      matches.some((entry) => {
        if (entry.me?.status !== 'accepted') return false;
        if (exceptMatchId && entry.match.id === exceptMatchId) return false;
        const s = entry.match.status;
        return s === 'waiting' || s === 'starting' || s === 'in_progress';
      }),
    [matches],
  );

  /* ── data loading (with concurrency guard) ── */

  const loadingRef = useRef(false);
  const pendingReloadRef = useRef(false);

  const loadMatches = useCallback(async () => {
    if (!user) {
      setMatches([]);
      setLoading(false);
      return;
    }

    // Concurrency guard: if already loading, just mark pending
    if (loadingRef.current) {
      pendingReloadRef.current = true;
      return;
    }
    loadingRef.current = true;
    setLoading(true);

    try {
      const { data: myPlayers, error: myPlayersError } = await supabase
        .from('multiplayer_match_players')
        .select('*')
        .eq('user_id', user.id)
        .returns<MultiplayerMatchPlayer[]>();

      if (myPlayersError) {
        console.error('[mp] failed to load player rows:', myPlayersError);
        return;
      }

      const matchIds = Array.from(new Set((myPlayers ?? []).map((p) => p.match_id)));
      if (matchIds.length === 0) {
        setMatches([]);
        return;
      }

      const [{ data: matchRows, error: matchErr }, { data: allPlayers, error: playerErr }] =
        await Promise.all([
          supabase.from('multiplayer_matches').select('*').in('id', matchIds).returns<MultiplayerMatch[]>(),
          supabase.from('multiplayer_match_players').select('*').in('match_id', matchIds).returns<MultiplayerMatchPlayer[]>(),
        ]);

      if (matchErr || playerErr) {
        console.error('[mp] load error:', matchErr ?? playerErr);
        return;
      }

      const userIds = Array.from(new Set((allPlayers ?? []).map((p) => p.user_id)));
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, tag, skin, is_online, level')
        .in('id', userIds);

      const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
      const playersByMatch = new Map<string, MultiplayerMatchPlayer[]>();
      for (const p of allPlayers ?? []) {
        playersByMatch.set(p.match_id, [...(playersByMatch.get(p.match_id) ?? []), p]);
      }

      const merged: MultiplayerMatchView[] = (matchRows ?? [])
        .map((m) => {
          const players = playersByMatch.get(m.id) ?? [];
          const me = players.find((p) => p.user_id === user.id) ?? null;
          return {
            match: m,
            me,
            players: players.map((p) => ({
              player: p,
              profile:
                (profileMap.get(p.user_id) as Pick<
                  Profile,
                  'id' | 'username' | 'tag' | 'skin' | 'is_online' | 'level'
                > | null) ?? null,
            })),
          };
        })
        .sort((a, b) => b.match.created_at.localeCompare(a.match.created_at));

      setMatches(merged);
    } finally {
      setLoading(false);
      loadingRef.current = false;

      // If a reload was requested while we were loading, do one more
      if (pendingReloadRef.current) {
        pendingReloadRef.current = false;
        void loadMatches();
      }
    }
  }, [user]);

  /* ── initial load ── */
  useEffect(() => {
    const timer = window.setTimeout(() => void loadMatches(), 0);
    return () => window.clearTimeout(timer);
  }, [loadMatches]);

  /* ── realtime (debounced + filtered to this user) ── */
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedReload = useCallback(() => {
    if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
    reloadTimerRef.current = setTimeout(() => void loadMatches(), 500);
  }, [loadMatches]);

  useEffect(() => {
    if (!user) return;

    // Reload on all match_players changes so opponent ready/submit updates are visible immediately.
    const channel = supabase
      .channel(`mp-live-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'multiplayer_match_players',
        },
        debouncedReload,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'multiplayer_matches',
        },
        debouncedReload,
      )
      .subscribe();

    return () => {
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
      void supabase.removeChannel(channel);
    };
  }, [user, debouncedReload]);

  /* ── actions ── */

  const createMatch = useCallback(
    async (
      gameId: string,
      stake: number,
      invitedIds: string[],
      options?: { config?: MatchConfig; configSeed?: number },
    ): Promise<string | null> => {
      if (!user) return 'Ej inloggad';
      if (invitedIds.length === 0) return 'Välj minst en vän';
      if (stake < 0) return 'Stake kan inte vara negativ';
      if (hasBlockingMatch()) return 'Du har redan en aktiv multiplayer-match';
      const err = await mpCreateMatch(
        gameId,
        stake,
        invitedIds,
        options?.config ?? {},
        options?.configSeed,
      );
      if (!err) await loadMatches();
      return err;
    },
    [user, loadMatches, hasBlockingMatch],
  );

  const acceptInvite = useCallback(
    async (matchId: string): Promise<string | null> => {
      if (hasBlockingMatch(matchId)) return 'Du har redan en aktiv multiplayer-match';
      const err = await mpAcceptInvite(matchId);
      if (!err) await loadMatches();
      return err;
    },
    [loadMatches, hasBlockingMatch],
  );

  const declineInvite = useCallback(
    async (matchId: string): Promise<string | null> => {
      const err = await mpDeclineInvite(matchId);
      if (!err) await loadMatches();
      return err;
    },
    [loadMatches],
  );

  const markReady = useCallback(
    async (matchId: string): Promise<{ error: string | null; data: { all_ready?: boolean; ready_count?: number; total_count?: number } | null }> => {
      mpDebug('useMultiplayer', 'accept:mark_ready_call', { matchId });
      const { error, data } = await mpMarkReady(matchId);
      mpDebug('useMultiplayer', 'accept:mark_ready_done', { matchId, error, data });
      await loadMatches();
      return { error, data };
    },
    [loadMatches],
  );

  const tickMatchStart = useCallback(
    async (matchId: string): Promise<string | null> => {
      mpDebug('useMultiplayer', 'tickMatchStart:called', { matchId });
      const result = await mpTickMatchStart(matchId);
      mpDebug('useMultiplayer', 'tickMatchStart:result', { matchId, result });
      await loadMatches();
      return result;
    },
    [loadMatches],
  );

  const startMatchIfReady = useCallback(
    async (matchId: string, countdownSeconds = 5): Promise<string | null> => {
      const { error, data } = await mpStartIfReady(matchId, countdownSeconds);
      mpDebug('useMultiplayer', 'startMatchIfReady:result', {
        matchId,
        countdownSeconds,
        error,
        data,
      });
      await loadMatches();
      if (error) return error;
      if (!data?.ok) {
        switch (data?.reason) {
          case 'not_host':
            return 'Bara hosten kan starta matchen';
          case 'not_enough_players':
            return 'Det krävs minst två spelare';
          case 'not_all_ready':
            return 'Alla spelare måste acceptera innan start';
          case 'invalid_status':
            return 'Matchen är inte i vänteläge';
          default:
            return 'Kunde inte starta match';
        }
      }
      if (data.started === false) {
        return 'Matchen kunde inte startas ännu';
      }
      return null;
    },
    [loadMatches],
  );

  const readyState = useCallback(
    async (matchId: string) => {
      return mpReadyState(matchId);
    },
    [],
  );

  const forfeitMatch = useCallback(
    async (matchId: string): Promise<string | null> => {
      const err = await mpForfeitMatch(matchId);
      if (!err) await loadMatches();
      return err;
    },
    [loadMatches],
  );

  const cancelMatch = useCallback(
    async (matchId: string): Promise<string | null> => {
      const err = await mpCancelMatch(matchId);
      if (!err) await loadMatches();
      return err;
    },
    [loadMatches],
  );

  const setActiveMatch = useCallback(
    (
      gameId: string,
      matchId: string,
      options?: { config?: MatchConfig; configSeed?: number; showOverlay?: boolean },
    ) => {
      localStorage.setItem(
        getActiveMatchKey(gameId),
        JSON.stringify({
          matchId,
          setAt: new Date().toISOString(),
          config: options?.config,
          configSeed: options?.configSeed,
          showOverlay: options?.showOverlay,
        }),
      );
    },
    [],
  );

  /* ── grouped views ── */

  const grouped = useMemo(() => {
    const incoming = matches.filter(
      (m) => m.me?.status === 'invited' && m.match.status === 'waiting',
    );
    const waiting = matches.filter(
      (m) => m.me?.status === 'accepted' && m.match.status === 'waiting',
    );
    const starting = matches.filter(
      (m) => m.me?.status === 'accepted' && m.match.status === 'starting',
    );
    const active = matches.filter(
      (m) =>
        m.me?.status === 'accepted' &&
        m.match.status === 'in_progress' &&
        !m.me?.submitted,
    );
    const completed = matches
      .filter((m) => m.match.status === 'completed')
      .slice(0, 10);
    return { incoming, waiting, starting, active, completed };
  }, [matches]);

  return {
    loading,
    matches,
    grouped,
    gamePath,
    gameLabel,
    createMatch,
    acceptInvite,
    markReady,
    declineInvite,
    startMatchIfReady,
    readyState,
    tickMatchStart,
    forfeitMatch,
    cancelMatch,
    setActiveMatch,
    refresh: loadMatches,
  } as const;
}
