/* ── useHeartbeat – periodic last_seen ping ──
 *
 *  While the user is logged in and the tab is visible, this hook
 *  updates `last_seen` in the profiles table every HEARTBEAT_INTERVAL ms.
 *
 *  This lets us detect AFK users: if `last_seen` is older than
 *  ONLINE_THRESHOLD_MS we treat them as offline regardless of `is_online`.
 */

import { useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../auth';

/** How often we ping (2 minutes) */
const HEARTBEAT_INTERVAL_MS = 2 * 60 * 1000;

export function useHeartbeat() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const ping = async () => {
      if (document.visibilityState !== 'visible') return;
      await supabase
        .from('profiles')
        .update({ last_seen: new Date().toISOString() })
        .eq('id', user.id);
    };

    // Ping immediately on mount (tab is visible by definition)
    void ping();

    const interval = window.setInterval(ping, HEARTBEAT_INTERVAL_MS);

    // Also ping when tab becomes visible again after being backgrounded
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void ping();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [user]);
}
