/* ── Multiplayer module – public API ── */

// Types
export type { ActiveMatchPayload, MatchConfig } from './types';

// Active-match localStorage helpers
export {
  getActiveMatchPayload,
  setActiveMatchPayload,
  clearActiveMatch,
  getActiveMatchKey,
} from './activeMatch';

// API (plain functions, no hooks)
export {
  mpSubmitResult,
  mpCreateMatch,
  mpAcceptInvite,
  mpDeclineInvite,
  mpStartMatch,
  mpTickMatchStart,
  mpForfeitMatch,
  mpCancelMatch,
  mpTryResolveTimeout,
} from './api';

// Hooks
export { useMultiplayer, gamePath, gameLabel, multiplayerGames } from './useMultiplayer';
export type { MultiplayerMatchView } from './useMultiplayer';
export { useLiveMatch } from './useLiveMatch';
export type { LivePlayer } from './useLiveMatch';
export { useMultiplayerGame } from './useMultiplayerGame';
export type { MultiplayerGameState } from './useMultiplayerGame';

// UI
export { default as LiveBanner } from './LiveBanner';
export { default as StagingScreen } from './StagingScreen';
export type { StagingResult } from './StagingScreen';
