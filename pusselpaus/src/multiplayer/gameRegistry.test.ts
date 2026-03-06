/* ── Game registry multiplayer config – tests ──
 *
 *  Validates that every game with multiplayer config is correctly structured.
 *  When adding a new game, these tests catch missing fields early.
 */

import { describe, it, expect } from 'vitest';
import { games, type GameDefinition, type MultiplayerConfig } from '../game-registry';

const mpGames = games.filter((g): g is GameDefinition & { multiplayer: MultiplayerConfig } => !!g.multiplayer);

describe('game-registry multiplayer config', () => {
  it('has at least one multiplayer-enabled game', () => {
    expect(mpGames.length).toBeGreaterThanOrEqual(1);
  });

  it('every mp game has a unique id', () => {
    const ids = mpGames.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(mpGames.map((g) => [g.id, g]))(
    '%s: has valid multiplayer config',
    (_id, game) => {
      const mp = (game as GameDefinition & { multiplayer: MultiplayerConfig }).multiplayer;
      // must have at least one difficulty
      expect(mp.difficulties.length).toBeGreaterThanOrEqual(1);
      // every difficulty must have value and label
      for (const d of mp.difficulties) {
        expect(d.value).toBeTruthy();
        expect(d.label).toBeTruthy();
      }
      // rankBy must be one of time/score
      expect(['time', 'score']).toContain(mp.rankBy);
    },
  );

  it.each(mpGames.map((g) => [g.id, g]))(
    '%s: has required base fields',
    (_id, game) => {
      const g = game as GameDefinition;
      expect(g.name).toBeTruthy();
      expect(g.emoji).toBeTruthy();
      expect(g.path).toMatch(/^\//);
      expect(g.PlayPage).toBeDefined();
    },
  );

  it('sudoku has 4 difficulty levels', () => {
    const sudoku = mpGames.find((g) => g.id === 'sudoku');
    expect(sudoku).toBeDefined();
    expect(sudoku!.multiplayer.difficulties).toHaveLength(4);
    expect(sudoku!.multiplayer.rankBy).toBe('time');
  });

  it('numberpath has 3 difficulty levels', () => {
    const np = mpGames.find((g) => g.id === 'numberpath');
    expect(np).toBeDefined();
    expect(np!.multiplayer.difficulties).toHaveLength(3);
    expect(np!.multiplayer.rankBy).toBe('time');
  });

  it('rytmrush ranks by score', () => {
    const rr = mpGames.find((g) => g.id === 'rytmrush');
    expect(rr).toBeDefined();
    expect(rr!.multiplayer.rankBy).toBe('score');
  });
});

describe('gamePath / gameLabel helpers', () => {
  // These are re-exported from multiplayer module
  it('all mp games have a path starting with /', () => {
    for (const g of mpGames) {
      expect(g.path).toMatch(/^\//);
    }
  });
});
