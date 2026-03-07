/* ── Multiplayer core – match lifecycle and shared primitives ── */

export type { ActiveMatchPayload, MatchConfig } from '../types';

export {
  getActiveMatchPayload,
  setActiveMatchPayload,
  clearActiveMatch,
  clearAllActiveMatches,
  getActiveMatchKey,
  getPendingMatchmakingCleanup,
  setPendingMatchmakingCleanup,
  clearPendingMatchmakingCleanup,
  isStaleMatchmadePayload,
} from '../activeMatch';

export {
  mpSubmitResult,
  mpCreateMatch,
  mpAcceptInvite,
  mpDeclineInvite,
  mpTickMatchStart,
  mpForfeitMatch,
  mpCancelMatch,
  mpMarkReady,
  mpStartIfReady,
  mpReadyState,
  mpForceCleanupActiveMatches,
  mpRequestRematch,
} from '../api';

export type {
  MpReadyResult,
  MpStartIfReadyResult,
  MpReadyStateResult,
  MpRequestRematchResult,
} from '../api';

export { useMultiplayer, gamePath, gameLabel, multiplayerGames } from '../useMultiplayer';
export type { MultiplayerMatchView } from '../useMultiplayer';
export { useActiveMatchPayload } from '../useActiveMatchPayload';