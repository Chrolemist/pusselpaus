/* ── activeMatch localStorage helpers – unit tests ── */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getActiveMatchPayload,
  setActiveMatchPayload,
  clearActiveMatch,
  getActiveMatchKey,
} from '../multiplayer/activeMatch';
import type { ActiveMatchPayload } from '../multiplayer/types';

beforeEach(() => {
  localStorage.clear();
});

describe('getActiveMatchKey', () => {
  it('returns correct key for a game id', () => {
    expect(getActiveMatchKey('sudoku')).toBe('pusselpaus:mp:active:sudoku');
    expect(getActiveMatchKey('numberpath')).toBe('pusselpaus:mp:active:numberpath');
  });
});

describe('setActiveMatchPayload / getActiveMatchPayload', () => {
  it('stores and retrieves a payload', () => {
    const payload: ActiveMatchPayload = {
      matchId: 'abc-123',
      setAt: '2026-01-01T00:00:00Z',
      configSeed: 42,
      config: { difficulty: 'hard' },
    };

    setActiveMatchPayload('sudoku', payload);
    const result = getActiveMatchPayload('sudoku');

    expect(result).toEqual(payload);
  });

  it('returns null when no payload stored', () => {
    expect(getActiveMatchPayload('sudoku')).toBeNull();
  });

  it('returns null for invalid JSON in localStorage', () => {
    localStorage.setItem('pusselpaus:mp:active:sudoku', 'not-json');
    expect(getActiveMatchPayload('sudoku')).toBeNull();
  });

  it('returns null when stored payload has no matchId', () => {
    localStorage.setItem(
      'pusselpaus:mp:active:sudoku',
      JSON.stringify({ setAt: 'x' }),
    );
    expect(getActiveMatchPayload('sudoku')).toBeNull();
  });

  it('does not leak between games', () => {
    setActiveMatchPayload('sudoku', {
      matchId: 'sudoku-match',
      setAt: 'now',
    });
    expect(getActiveMatchPayload('numberpath')).toBeNull();
  });
});

describe('clearActiveMatch', () => {
  it('removes the payload for a game', () => {
    setActiveMatchPayload('sudoku', {
      matchId: 'to-clear',
      setAt: 'now',
    });
    clearActiveMatch('sudoku');
    expect(getActiveMatchPayload('sudoku')).toBeNull();
  });

  it('does not affect other games', () => {
    setActiveMatchPayload('sudoku', { matchId: 's', setAt: 'now' });
    setActiveMatchPayload('numberpath', { matchId: 'n', setAt: 'now' });
    clearActiveMatch('sudoku');
    expect(getActiveMatchPayload('numberpath')).not.toBeNull();
  });
});
