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
      const { data } = await supabase
        .from('friendships')
        .select('id, requester_id, addressee_id, status')
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
        .neq('status', 'rejected');
      if (cancelled) return;
      if (!data || data.length === 0) { setFriends([]); setLoading(false); return; }
      const otherIds = data.map((f) =>
        f.requester_id === user.id ? f.addressee_id : f.requester_id,
      );
      const { data: profiles } = await supabase
        .from('profiles')
        .select('*')
        .in('id', otherIds)
        .returns<Profile[]>();
      if (cancelled) return;
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
    })();
    return () => { cancelled = true; };
  }, [user]);

  /** Send a friend request by username */
  const sendRequest = useCallback(async (username: string): Promise<string | null> => {
    if (!user) return 'Ej inloggad';

    // Find the target user
    const { data: target } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', username)
      .single();

    if (!target) return 'Användaren hittades inte';
    if (target.id === user.id) return 'Du kan inte adda dig själv';

    // Check for existing friendship
    const { data: existing } = await supabase
      .from('friendships')
      .select('id')
      .or(
        `and(requester_id.eq.${user.id},addressee_id.eq.${target.id}),and(requester_id.eq.${target.id},addressee_id.eq.${user.id})`,
      )
      .limit(1);

    if (existing && existing.length > 0) return 'Förfrågan finns redan';

    const { error } = await supabase
      .from('friendships')
      .insert({ requester_id: user.id, addressee_id: target.id });

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
