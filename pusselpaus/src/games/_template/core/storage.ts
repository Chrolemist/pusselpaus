const SAVE_KEY = 'pusselpaus:template-game:save';

export function hasSavedGame(): boolean {
  return !!localStorage.getItem(SAVE_KEY);
}

export function savePlaceholderState(value: string): void {
  localStorage.setItem(SAVE_KEY, value);
}

export function clearPlaceholderState(): void {
  localStorage.removeItem(SAVE_KEY);
}
