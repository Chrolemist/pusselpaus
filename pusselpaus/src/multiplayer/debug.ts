export function isMpDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem('mp_debug') === '1';
}

function isAllowedEvent(event: string): boolean {
  return event.startsWith('accept:');
}

export function mpDebug(scope: string, event: string, payload?: Record<string, unknown>): void {
  if (!isMpDebugEnabled()) return;
  if (!isAllowedEvent(event)) return;
  if (payload) {
    console.log(`[mp-debug][${scope}] ${event}`, payload);
    return;
  }
  console.log(`[mp-debug][${scope}] ${event}`);
}
