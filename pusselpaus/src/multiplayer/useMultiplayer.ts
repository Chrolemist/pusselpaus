/* ── useMultiplayer – lobby-level multiplayer state ──
 *
 *  Used by MatchInboxPanel, StagingScreen and TopBar.
 *  Loads all matches the user is part of, groups them, and exposes actions.
 *
 *  Game-specific labels/paths/difficulties come from game-registry –
 *  no hardcoded game lists here.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth';
import { supabase } from '../lib/supabaseClient';
import type { MultiplayerMatch, MultiplayerMatchPlayer, Profile } from '../lib/database.types';
import { games } from '../game-registry';
import { getActiveMatchKey } from './activeMatch';
import type { MatchConfig } from './types';
import {
  mpCreateMatch,
  mpAcceptInvite,
  mpDeclineInvite,
  mpStartMatch,
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
    profile: Pick<Profile, 'id' | 'username' | 'tag' | 'skin' | 'is_online'> | null;
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

  /* ── data loading ── */

  const loadMatches = useCallback(async () => {
    if (!user) {
      setMatches([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const { data: myPlayers, error: myPlayersError } = await supabase
      .from('multiplayer_match_players')
      .select('*')
      .eq('user_id', user.id)
      .returns<MultiplayerMatchPlayer[]>();

    if (myPlayersError) {
      console.error('[mp] failed to load player rows:', myPlayersError);
      setMatches([]);
      setLoading(false);
      return;
    }

    const matchIds = Array.from(new Set((myPlayers ?? []).map((p) => p.match_id)));
    if (matchIds.length === 0) {
      setMatches([]);
      setLoading(false);
      return;
    }

    const [{ data: matchRows, error: matchErr }, { data: allPlayers, error: playerErr }] =
      await Promise.all([
        supabase.from('multiplayer_matches').select('*').in('id', matchIds).returns<MultiplayerMatch[]>(),
        supabase.from('multiplayer_match_players').select('*').in('match_id', matchIds).returns<MultiplayerMatchPlayer[]>(),
      ]);

    if (matchErr || playerErr) {
      console.error('[mp] load error:', matchErr ?? playerErr);
      setMatches([]);
      setLoading(false);
      return;
    }

    const userIds = Array.from(new Set((allPlayers ?? []).map((p) => p.user_id)));
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, tag, skin, is_online')
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
                'id' | 'username' | 'tag' | 'skin' | 'is_online'
              > | null) ?? null,
          })),
        };
      })
      .sort((a, b) => b.match.created_at.localeCompare(a.match.created_at));

    setMatches(merged);
    setLoading(false);
  }, [user]);

  /* ── initial load ── */
  useEffect(() => {
    const timer = window.setTimeout(() => void loadMatches(), 0);
    return () => window.clearTimeout(timer);
  }, [loadMatches]);

  /* ── realtime ── */
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`mp-live-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'multiplayer_matches' }, () => void loadMatches())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'multiplayer_match_players' }, () => void loadMatches())
      .subscribe();
    return () => void supabase.removeChannel(channel);
  }, [user, loadMatches]);

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

  const startMatch = useCallback(
    async (matchId: string, countdownSeconds = 5): Promise<string | null> => {
      if (hasBlockingMatch(matchId)) return 'Du har redan en annan aktiv multiplayer-match';
      const err = await mpStartMatch(matchId, countdownSeconds);
      if (!err) await loadMatches();
      return err;
    },
    [loadMatches, hasBlockingMatch],
  );

  const tickMatchStart = useCallback(
    async (matchId: string): Promise<string | null> => {
      const result = await mpTickMatchStart(matchId);
      await loadMatches();
      return result;
    },
    [loadMatches],
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
      options?: { config?: MatchConfig; configSeed?: number },
    ) => {
      localStorage.setItem(
        getActiveMatchKey(gameId),
        JSON.stringify({
          matchId,
          setAt: new Date().toISOString(),
          config: options?.config,
          configSeed: options?.configSeed,
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
    declineInvite,
    startMatch,
    tickMatchStart,
    forfeitMatch,
    cancelMatch,
    setActiveMatch,
    refresh: loadMatches,
  } as const;
}
