import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth';
import { supabase } from '../lib/supabaseClient';
import type { MultiplayerMatch, MultiplayerMatchPlayer, Profile } from '../lib/database.types';
import type { MultiplayerGameId } from './useMultiplayer';

const ACTIVE_MATCH_KEY_PREFIX = 'pusselpaus:mp:active:';

type LiveOutcome = 'won' | 'lost' | null;

interface LivePlayer {
  player: MultiplayerMatchPlayer;
  profile: Pick<Profile, 'id' | 'username' | 'tag' | 'skin' | 'is_online'> | null;
}

export function useLiveMultiplayerMatch(gameId: MultiplayerGameId) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [match, setMatch] = useState<MultiplayerMatch | null>(null);
  const [players, setPlayers] = useState<LivePlayer[]>([]);

  const key = `${ACTIVE_MATCH_KEY_PREFIX}${gameId}`;

  const getActiveMatchId = useCallback((): string | null => {
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw) as { matchId?: string };
      return parsed.matchId ?? null;
    } catch {
      return null;
    }
  }, [key]);

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
      console.error('[Multiplayer Live] failed to load match:', matchError);
      setMatch(null);
      setPlayers([]);
      setLoading(false);
      return;
    }

    let effectiveMatch = matchRow;
    if (matchRow.status === 'in_progress') {
      const { data: resolveState, error: resolveError } = await supabase.rpc('mp_try_resolve_timeout', {
        p_match_id: matchId,
        p_timeout_seconds: 180,
      });

      if (resolveError) {
        console.error('[Multiplayer Live] timeout resolve failed:', resolveError);
      } else if (typeof resolveState === 'string' && resolveState.startsWith('resolved')) {
        const { data: refreshed } = await supabase
          .from('multiplayer_matches')
          .select('*')
          .eq('id', matchId)
          .maybeSingle<MultiplayerMatch>();

        if (refreshed) effectiveMatch = refreshed;
      }
    }

    const { data: playerRows, error: playerError } = await supabase
      .from('multiplayer_match_players')
      .select('*')
      .eq('match_id', matchId)
      .returns<MultiplayerMatchPlayer[]>();

    if (playerError) {
      console.error('[Multiplayer Live] failed to load players:', playerError);
      setMatch(effectiveMatch);
      setPlayers([]);
      setLoading(false);
      return;
    }

    const userIds = Array.from(new Set((playerRows ?? []).map((p) => p.user_id)));
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, tag, skin, is_online')
      .in('id', userIds);

    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
    const mergedPlayers: LivePlayer[] = (playerRows ?? []).map((p) => ({
      player: p,
      profile: (profileMap.get(p.user_id) as Pick<Profile, 'id' | 'username' | 'tag' | 'skin' | 'is_online'> | null) ?? null,
    }));

    setMatch(effectiveMatch);
    setPlayers(mergedPlayers);
    setLoading(false);
  }, [getActiveMatchId, user]);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      if (!mounted) return;
      await refresh();
    };

    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 2500);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [refresh]);

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
