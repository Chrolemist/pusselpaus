/* ── Skin display helper ──
 *
 *  The `profiles.skin` column stores the emoji character (e.g. '🦊')
 *  after a skin has been equipped, but its DB default is the string
 *  'default' or it can be null/undefined. This helper normalises that.
 */

const DEFAULT_SKIN = '🙂';

/** Resolve a skin value to a displayable emoji. */
export function displaySkin(skin: string | null | undefined): string {
  if (!skin || skin === 'default') return DEFAULT_SKIN;
  return skin;
}
