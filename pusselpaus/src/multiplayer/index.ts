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
  mpTickMatchStart,
  mpForfeitMatch,
  mpCancelMatch,
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
export { default as MatchFoundOverlay } from './MatchFoundOverlay';
export type { MatchPlayer, MatchFoundOverlayProps } from './MatchFoundOverlay';
export { MULTIPLAYER_REPLAY_EVENT, dispatchMultiplayerReplay } from './replay';

// Matchmaking
export { useMatchmaking } from './useMatchmaking';
export type { MatchmakingState, MatchmakingStatus } from './useMatchmaking';
export { matchmakeJoin, matchmakeLeave, matchmakePoll } from './matchmakingApi';
export type { MatchmakeResult } from './matchmakingApi';

// Audio
export { playMatchFound, playAcceptTick, playCountdownTick, playRematchStart, disposeMatchSounds } from './matchSounds';
