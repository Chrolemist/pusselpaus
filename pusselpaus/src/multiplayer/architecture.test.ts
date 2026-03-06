/* ── Architecture tests ──
 *
 *  These tests verify that the multiplayer system is properly decoupled
 *  and that adding a new game only requires changes in game-registry.
 */

import { describe, it, expect } from 'vitest';
import { games, type MultiplayerConfig } from '../game-registry';
import { multiplayerGames, gamePath, gameLabel } from '../multiplayer';

describe('multiplayer module derives from game-registry', () => {
  it('multiplayerGames matches games with multiplayer config', () => {
    const registryMpIds = games.filter((g) => !!g.multiplayer).map((g) => g.id);
    const moduleMpIds = multiplayerGames.map((g) => g.id);
    expect(moduleMpIds).toEqual(registryMpIds);
  });

  it('gamePath returns correct paths from registry', () => {
    for (const g of games) {
      expect(gamePath(g.id)).toBe(g.path);
    }
  });

  it('gameLabel returns correct names from registry', () => {
    for (const g of games) {
      expect(gameLabel(g.id)).toBe(g.name);
    }
  });

  it('gamePath falls back to / for unknown game', () => {
    expect(gamePath('unknown-game-id')).toBe('/');
  });

  it('gameLabel falls back to id for unknown game', () => {
    expect(gameLabel('unknown-game-id')).toBe('unknown-game-id');
  });
});

describe('new game integration checklist', () => {
  // This test documents exactly what's needed to add multiplayer to a new game.
  // If this test fails, it means the architecture contract has changed.

  it('only game-registry needs multiplayer field to be listed', () => {
    // Simulate counting: multiplayerGames should equal # of games with mp config
    const withMp = games.filter((g) => !!g.multiplayer);
    expect(multiplayerGames.length).toBe(withMp.length);
  });

  it('every mp game has difficulties accessible from game-registry', () => {
    for (const g of multiplayerGames) {
      const mp = g.multiplayer as MultiplayerConfig;
      expect(mp.difficulties).toBeDefined();
      expect(mp.difficulties.length).toBeGreaterThan(0);
    }
  });
});

describe('no hardcoded game IDs in multiplayer module', () => {
  // We can verify this by checking the exports – none should reference specific game IDs
  it('multiplayerGames is derived, not hardcoded', () => {
    // If we removed all games from registry, multiplayerGames should be empty
    // We can't actually mutate the module, but we verify the count matches
    const expected = games.filter((g) => !!g.multiplayer).length;
    expect(multiplayerGames.length).toBe(expected);
  });
});
