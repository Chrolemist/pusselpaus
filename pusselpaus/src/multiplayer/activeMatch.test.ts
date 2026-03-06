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

describe('matchmade flag', () => {
  it('stores and retrieves matchmade: true', () => {
    setActiveMatchPayload('sudoku', {
      matchId: 'mm-1',
      setAt: 'now',
      matchmade: true,
    });
    const result = getActiveMatchPayload('sudoku');
    expect(result?.matchmade).toBe(true);
  });

  it('matchmade defaults to undefined for friend invites', () => {
    setActiveMatchPayload('sudoku', {
      matchId: 'fi-1',
      setAt: 'now',
    });
    const result = getActiveMatchPayload('sudoku');
    expect(result?.matchmade).toBeUndefined();
  });

  it('showOverlay is preserved alongside other fields', () => {
    setActiveMatchPayload('sudoku', {
      matchId: 'overlay-1',
      setAt: 'now',
      showOverlay: true,
      configSeed: 42,
      config: { difficulty: 'hard' },
    });
    const result = getActiveMatchPayload('sudoku');
    expect(result?.showOverlay).toBe(true);
    expect(result?.configSeed).toBe(42);
    expect(result?.config).toEqual({ difficulty: 'hard' });
  });

  it('can update payload in-place (e.g. clear showOverlay after acceptance)', () => {
    setActiveMatchPayload('sudoku', {
      matchId: 'update-1',
      setAt: 'now',
      showOverlay: true,
    });
    const current = getActiveMatchPayload('sudoku')!;
    setActiveMatchPayload('sudoku', { ...current, showOverlay: undefined });
    const updated = getActiveMatchPayload('sudoku');
    expect(updated?.matchId).toBe('update-1');
    expect(updated?.showOverlay).toBeUndefined();
  });
});
