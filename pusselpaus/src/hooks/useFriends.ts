/* ── useFriends – friend list & requests ── */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../auth';
import type { Profile } from '../lib/database.types';

export interface FriendRow {
  friendshipId: string;
  status: 'pending' | 'accepted' | 'rejected';
  /** The *other* user's profile */
  friend: Profile;
  /** true if I am the one who sent the request */
  isSender: boolean;
}

export function useFriends() {
  const { user } = useAuth();
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFriends = useCallback(async () => {
    if (!user) { setFriends([]); setLoading(false); return; }

    // Fetch friendships where I'm involved
    const { data } = await supabase
      .from('friendships')
      .select('id, requester_id, addressee_id, status')
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
      .neq('status', 'rejected');

    if (!data || data.length === 0) { setFriends([]); setLoading(false); return; }

    // Collect the "other" user ids
    const otherIds = data.map((f) =>
      f.requester_id === user.id ? f.addressee_id : f.requester_id,
    );

    // Fetch their profiles
    const { data: profiles } = await supabase
      .from('profiles')
      .select('*')
      .in('id', otherIds)
      .returns<Profile[]>();

    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

    const rows: FriendRow[] = data
      .map((f) => {
        const otherId = f.requester_id === user.id ? f.addressee_id : f.requester_id;
        const friend = profileMap.get(otherId);
        if (!friend) return null;
        return {
          friendshipId: f.id,
          status: f.status as FriendRow['status'],
          friend,
          isSender: f.requester_id === user.id,
        };
      })
      .filter((r): r is FriendRow => r !== null);

    setFriends(rows);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) { if (!cancelled) { setFriends([]); setLoading(false); } return; }
      await fetchFriends();
    })();
    return () => { cancelled = true; };
  }, [user, fetchFriends]);

  useEffect(() => {
    if (!user) return;

    let reloadTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (reloadTimer) window.clearTimeout(reloadTimer);
      reloadTimer = window.setTimeout(() => {
        void fetchFriends();
      }, 250);
    };

    const channel = supabase
      .channel(`friends-live-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'friendships',
        },
        () => {
          scheduleRefresh();
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          scheduleRefresh();
        }
      });

    const handleFocus = () => {
      scheduleRefresh();
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        scheduleRefresh();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);

    const fallbackInterval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void fetchFriends();
      }
    }, 10000);

    return () => {
      if (reloadTimer) window.clearTimeout(reloadTimer);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.clearInterval(fallbackInterval);
      void supabase.removeChannel(channel);
    };
  }, [user, fetchFriends]);

  /** Send a friend request by username */
  const sendRequest = useCallback(async (usernameOrTag: string): Promise<string | null> => {
    if (!user) return 'Ej inloggad';

    const input = usernameOrTag.trim();
    if (!input) return 'Ange användarnamn';

    const hashIndex = input.lastIndexOf('#');
    const hasTag = hashIndex > 0 && hashIndex < input.length - 1;

    const parsedUsername = hasTag ? input.slice(0, hashIndex).trim() : input;
    const parsedTag = hasTag ? input.slice(hashIndex + 1).trim() : null;

    // Find the target user
    let targetId: string | null = null;
    if (parsedTag) {
      const { data: target } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', parsedUsername)
        .eq('tag', parsedTag)
        .maybeSingle();
      targetId = target?.id ?? null;
    } else {
      const { data: candidates } = await supabase
        .from('profiles')
        .select('id, username, tag')
        .eq('username', parsedUsername)
        .limit(3);

      if ((candidates?.length ?? 0) > 1) {
        return 'Flera användare har det namnet. Använd formatet namn#tag.';
      }

      targetId = candidates?.[0]?.id ?? null;
    }

    if (!targetId) return 'Användaren hittades inte';
    if (targetId === user.id) return 'Du kan inte adda dig själv';

    // Check for existing friendship
    const { data: existing } = await supabase
      .from('friendships')
      .select('id')
      .or(
        `and(requester_id.eq.${user.id},addressee_id.eq.${targetId}),and(requester_id.eq.${targetId},addressee_id.eq.${user.id})`,
      )
      .limit(1);

    if (existing && existing.length > 0) return 'Förfrågan finns redan';

    const { error } = await supabase
      .from('friendships')
      .insert({ requester_id: user.id, addressee_id: targetId });

    if (error) return 'Något gick fel';
    await fetchFriends();
    return null; // success
  }, [user, fetchFriends]);

  /** Accept a pending friend request */
  const acceptRequest = useCallback(async (friendshipId: string) => {
    await supabase
      .from('friendships')
      .update({ status: 'accepted' })
      .eq('id', friendshipId);
    await fetchFriends();
  }, [fetchFriends]);

  /** Reject / remove a friendship */
  const removeFriend = useCallback(async (friendshipId: string) => {
    await supabase
      .from('friendships')
      .delete()
      .eq('id', friendshipId);
    await fetchFriends();
  }, [fetchFriends]);

  return {
    friends,
    loading,
    sendRequest,
    acceptRequest,
    removeFriend,
    refresh: fetchFriends,
  } as const;
}
