/* ── useOnlineCount – realtime online player count ── */

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { ONLINE_THRESHOLD_MS } from '../core/onlineStatus';

/**
 * Subscribes to `profiles` changes and keeps a live count
 * of players with `is_online = true` and a recent `last_seen`.
 */
export function useOnlineCount() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    // Initial fetch
    const fetchCount = async () => {
      const threshold = new Date(Date.now() - ONLINE_THRESHOLD_MS).toISOString();
      const { count: c } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('is_online', true)
        .gte('last_seen', threshold);
      setCount(c ?? 0);
    };
    fetchCount();

    // Realtime subscription — listen to ALL profile changes (online toggling happens via update)
    const channel = supabase
      .channel('online-count')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        () => {
          fetchCount();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return count;
}
