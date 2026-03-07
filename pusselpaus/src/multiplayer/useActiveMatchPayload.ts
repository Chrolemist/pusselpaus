import { useEffect, useState } from 'react';
import { ACTIVE_MATCH_CHANGED_EVENT, getActiveMatchKey, getActiveMatchPayload } from './activeMatch';
import type { ActiveMatchPayload } from './types';

export function useActiveMatchPayload(gameId: string): ActiveMatchPayload | null {
  const [payload, setPayload] = useState<ActiveMatchPayload | null>(() => getActiveMatchPayload(gameId));

  useEffect(() => {
    const refresh = () => setPayload(getActiveMatchPayload(gameId));

    const handleActiveMatchChanged = (event: Event) => {
      const changeEvent = event as CustomEvent<{ gameId?: string }>;
      const changedGameId = changeEvent.detail?.gameId;
      if (changedGameId && changedGameId !== gameId) return;
      refresh();
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key !== getActiveMatchKey(gameId)) return;
      refresh();
    };

    refresh();
    window.addEventListener(ACTIVE_MATCH_CHANGED_EVENT, handleActiveMatchChanged as EventListener);
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener(ACTIVE_MATCH_CHANGED_EVENT, handleActiveMatchChanged as EventListener);
      window.removeEventListener('storage', handleStorage);
    };
  }, [gameId]);

  return payload;
}