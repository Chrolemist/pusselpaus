/* ── useLiveMatch – polls a single active match for in-game display ── */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth';
import { supabase } from '../lib/supabaseClient';
import type { MultiplayerMatch, MultiplayerMatchPlayer, Profile } from '../lib/database.types';
import { useActiveMatchPayload } from './useActiveMatchPayload';

type LiveOutcome = 'won' | 'lost' | null;

export interface LivePlayer {
  player: MultiplayerMatchPlayer;
  profile: Pick<Profile, 'id' | 'username' | 'tag' | 'skin' | 'is_online' | 'level'> | null;
}

export function useLiveMatch(gameId: string) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [match, setMatch] = useState<MultiplayerMatch | null>(null);
  const [players, setPlayers] = useState<LivePlayer[]>([]);
  const activePayload = useActiveMatchPayload(gameId);
  const activeMatchId = activePayload?.matchId ?? null;

  const getActiveMatchId = useCallback((): string | null => {
    return activeMatchId;
  }, [activeMatchId]);

  const refresh = useCallback(async () => {
    if (!user) {
      setMatch(null);
      setPlayers([]);
      setLoading(false);
      return;
    }

    const matchId = getActiveMatchId();
    if (!matchId) {
      setMatch(null);
      setPlayers([]);
      setLoading(false);
      return;
    }

    const { data: matchRow, error: matchError } = await supabase
      .from('multiplayer_matches')
      .select('*')
      .eq('id', matchId)
      .maybeSingle<MultiplayerMatch>();

    if (matchError || !matchRow) {
      setMatch(null);
      setPlayers([]);
      setLoading(false);
      return;
    }

    const effectiveMatch = matchRow;

    const { data: playerRows } = await supabase
      .from('multiplayer_match_players')
      .select('*')
      .eq('match_id', matchId)
      .returns<MultiplayerMatchPlayer[]>();

    const userIds = Array.from(new Set((playerRows ?? []).map((p) => p.user_id)));
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, tag, skin, is_online, level')
      .in('id', userIds);

    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
    const merged: LivePlayer[] = (playerRows ?? []).map((p) => ({
      player: p,
      profile: (profileMap.get(p.user_id) as Pick<Profile, 'id' | 'username' | 'tag' | 'skin' | 'is_online' | 'level'> | null) ?? null,
    }));

    setMatch(effectiveMatch);
    setPlayers(merged);
    setLoading(false);
  }, [getActiveMatchId, user]);

  // Poll every 2.5s
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (mounted) await refresh();
    };
    void load();
    const timer = window.setInterval(() => void load(), 2500);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [refresh]);

  useEffect(() => {
    if (!user || !activeMatchId) return;

    const channel = supabase
      .channel(`mp-live-match:${user.id}:${activeMatchId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'multiplayer_match_players',
          filter: `match_id=eq.${activeMatchId}`,
        },
        () => {
          void refresh();
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'multiplayer_matches',
          filter: `id=eq.${activeMatchId}`,
        },
        () => {
          void refresh();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeMatchId, refresh, user]);

  const me = useMemo(
    () => players.find((p) => p.player.user_id === user?.id)?.player ?? null,
    [players, user?.id],
  );

  const winner = useMemo(
    () => players.find((p) => p.player.user_id === match?.winner_id)?.profile ?? null,
    [players, match?.winner_id],
  );

  const outcome: LiveOutcome = useMemo(() => {
    if (!match || match.status !== 'completed' || !user) return null;
    return match.winner_id === user.id ? 'won' : 'lost';
  }, [match, user]);

  const acceptedPlayers = useMemo(
    () => players.filter((p) => p.player.status === 'accepted'),
    [players],
  );

  const submittedCount = useMemo(
    () => acceptedPlayers.filter((p) => p.player.submitted).length,
    [acceptedPlayers],
  );

  return {
    loading,
    isActive: !!match,
    match,
    players,
    me,
    winner,
    outcome,
    acceptedPlayers,
    submittedCount,
    refresh,
  } as const;
}
