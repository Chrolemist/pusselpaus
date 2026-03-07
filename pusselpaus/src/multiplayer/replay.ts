export const MULTIPLAYER_REPLAY_EVENT = 'pusselpaus:multiplayer-replay';

export function dispatchMultiplayerReplay(gameId: string): void {
  window.dispatchEvent(new CustomEvent(MULTIPLAYER_REPLAY_EVENT, {
    detail: { gameId },
  }));
}