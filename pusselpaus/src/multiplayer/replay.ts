export const MULTIPLAYER_REPLAY_EVENT = 'pusselpaus:multiplayer-replay';
export const MULTIPLAYER_EXIT_EVENT = 'pusselpaus:multiplayer-exit';

export function dispatchMultiplayerReplay(gameId: string): void {
  window.dispatchEvent(new CustomEvent(MULTIPLAYER_REPLAY_EVENT, {
    detail: { gameId },
  }));
}

export function dispatchMultiplayerExit(gameId: string): void {
  window.dispatchEvent(new CustomEvent(MULTIPLAYER_EXIT_EVENT, {
    detail: { gameId },
  }));
}