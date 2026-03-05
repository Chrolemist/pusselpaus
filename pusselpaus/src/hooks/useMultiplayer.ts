import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth';
import { supabase } from '../lib/supabaseClient';
import type { MultiplayerMatch, MultiplayerMatchPlayer, Profile } from '../lib/database.types';

export type MultiplayerGameId = 'sudoku' | 'numberpath' | 'rytmrush';

export interface MultiplayerMatchView {
  match: MultiplayerMatch;
  me: MultiplayerMatchPlayer | null;
  players: Array<{
    player: MultiplayerMatchPlayer;
    profile: Pick<Profile, 'id' | 'username' | 'tag' | 'skin' | 'is_online'> | null;
  }>;
}

const ACTIVE_MATCH_KEY_PREFIX = 'pusselpaus:mp:active:';

function gamePath(gameId: MultiplayerGameId): string {
  if (gameId === 'sudoku') return '/sudoku';
  if (gameId === 'numberpath') return '/numberpath';
  return '/rytmrush';
}

export function useMultiplayer() {
  const { user } = useAuth();
  const [matches, setMatches] = useState<MultiplayerMatchView[]>([]);
  const [loading, setLoading] = useState(true);

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
      console.error('[Multiplayer] failed to load player rows:', myPlayersError);
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

    const [{ data: matchRows, error: matchRowsError }, { data: allPlayers, error: allPlayersError }] = await Promise.all([
      supabase
        .from('multiplayer_matches')
        .select('*')
        .in('id', matchIds)
        .returns<MultiplayerMatch[]>(),
      supabase
        .from('multiplayer_match_players')
        .select('*')
        .in('match_id', matchIds)
        .returns<MultiplayerMatchPlayer[]>(),
    ]);

    if (matchRowsError || allPlayersError) {
      console.error('[Multiplayer] failed to load matches:', matchRowsError ?? allPlayersError);
      setMatches([]);
      setLoading(false);
      return;
    }

    const userIds = Array.from(new Set((allPlayers ?? []).map((p) => p.user_id)));
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, username, tag, skin, is_online')
      .in('id', userIds);

    if (profilesError) {
      console.error('[Multiplayer] failed to load profiles:', profilesError);
      setLoading(false);
      return;
    }

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
            profile: (profileMap.get(p.user_id) as Pick<Profile, 'id' | 'username' | 'tag' | 'skin' | 'is_online'> | null) ?? null,
          })),
        };
      })
      .sort((a, b) => b.match.created_at.localeCompare(a.match.created_at));

    setMatches(merged);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadMatches();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadMatches]);

  const createMatch = useCallback(async (
    gameId: MultiplayerGameId,
    stake: number,
    invitedIds: string[],
  ): Promise<string | null> => {
    if (!user) return 'Ej inloggad';
    if (invitedIds.length === 0) return 'Välj minst en vän';
    if (stake <= 0) return 'Stake måste vara > 0';

    const { error } = await supabase.rpc('mp_create_match', {
      p_game_id: gameId,
      p_stake: stake,
      p_invited_ids: invitedIds,
    });

    if (error) return error.message || 'Kunde inte skapa match';
    await loadMatches();
    return null;
  }, [user, loadMatches]);

  const acceptInvite = useCallback(async (matchId: string): Promise<string | null> => {
    const { error } = await supabase.rpc('mp_accept_invite', { p_match_id: matchId });
    if (error) return error.message || 'Kunde inte acceptera';
    await loadMatches();
    return null;
  }, [loadMatches]);

  const declineInvite = useCallback(async (matchId: string): Promise<string | null> => {
    const { error } = await supabase.rpc('mp_decline_invite', { p_match_id: matchId });
    if (error) return error.message || 'Kunde inte neka';
    await loadMatches();
    return null;
  }, [loadMatches]);

  const setActiveMatch = useCallback((gameId: MultiplayerGameId, matchId: string) => {
    localStorage.setItem(`${ACTIVE_MATCH_KEY_PREFIX}${gameId}`, JSON.stringify({ matchId, setAt: new Date().toISOString() }));
  }, []);

  const submitResultForGame = useCallback(async (
    gameId: MultiplayerGameId,
    params: { elapsedSeconds?: number; score?: number; survivedSeconds?: number },
  ) => {
    if (!user) return;

    const raw = localStorage.getItem(`${ACTIVE_MATCH_KEY_PREFIX}${gameId}`);
    if (!raw) return;

    let matchId: string | null = null;
    try {
      const parsed = JSON.parse(raw) as { matchId?: string };
      matchId = parsed.matchId ?? null;
    } catch {
      return;
    }

    if (!matchId) return;

    const { error } = await supabase.rpc('mp_submit_result', {
      p_match_id: matchId,
      p_elapsed_seconds: params.elapsedSeconds ?? null,
      p_score: params.score ?? null,
      p_survived_seconds: params.survivedSeconds ?? null,
    });

    if (error) {
      console.error('[Multiplayer] submit failed:', error);
      return;
    }

    localStorage.removeItem(`${ACTIVE_MATCH_KEY_PREFIX}${gameId}`);
    await loadMatches();
  }, [user, loadMatches]);

  const grouped = useMemo(() => {
    const incoming = matches.filter((m) => m.me?.status === 'invited' && m.match.status === 'waiting');
    const waiting = matches.filter((m) => m.me?.status === 'accepted' && m.match.status === 'waiting');
    const active = matches.filter((m) => m.me?.status === 'accepted' && m.match.status === 'in_progress' && !m.me?.submitted);
    const completed = matches.filter((m) => m.match.status === 'completed').slice(0, 10);
    return { incoming, waiting, active, completed };
  }, [matches]);

  return {
    loading,
    matches,
    grouped,
    gamePath,
    createMatch,
    acceptInvite,
    declineInvite,
    setActiveMatch,
    submitResultForGame,
    refresh: loadMatches,
  } as const;
}
