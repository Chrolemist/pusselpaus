/* ── Online-status helpers ──
 *
 *  A user is considered "online" only when:
 *   1. `is_online` is true  AND
 *   2. `last_seen` is within the threshold (default 5 minutes)
 *
 *  This protects against stale `is_online=true` flags left behind
 *  when the browser didn't fire `beforeunload` (mobile PWA, crash, etc.).
 */

/** Users with last_seen older than this are treated as offline (5 min) */
export const ONLINE_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * Check whether a profile should be shown as "online".
 * Accepts any object with `is_online` and `last_seen` fields.
 */
export function isUserOnline(
  profile: { is_online: boolean; last_seen: string } | null | undefined,
): boolean {
  if (!profile) return false;
  if (!profile.is_online) return false;

  const lastSeen = new Date(profile.last_seen).getTime();
  if (Number.isNaN(lastSeen)) return false;

  return Date.now() - lastSeen < ONLINE_THRESHOLD_MS;
}

/**
 * Relative time label for last_seen.
 * Returns e.g. "just nu", "3 min sedan", "2 tim sedan", "igår".
 */
export function lastSeenLabel(lastSeen: string | null | undefined): string {
  if (!lastSeen) return '';
  const ms = Date.now() - new Date(lastSeen).getTime();
  if (Number.isNaN(ms) || ms < 0) return '';

  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'just nu';
  if (minutes < 60) return `${minutes} min sedan`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} tim sedan`;

  const days = Math.floor(hours / 24);
  if (days === 1) return 'igår';
  return `${days} dagar sedan`;
}
