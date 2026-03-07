# Game template

Use this folder as a copy base when you add a new game.

Project-wide architecture rules live in `docs/adding-games.md`.
Platform contract rules live in `docs/game-platform-architecture.md`.

## Suggested steps

1. Copy this folder to `src/games/<game-id>`.
2. Rename `TemplateGamePage` and `TemplateGameStatsPage` to your game names.
3. Replace UI and game logic in `pages` and `core`.
4. Keep storage keys unique per game.
5. Register the game in `src/game-registry/index.ts`.
6. Keep the game route lazy and avoid pulling game-specific code into `App.tsx` or other shell components.

If the new game is turn-based and you want a multiplayer-ready starting point, use `src/games/_turn-based-template` instead of this generic template.

## Folder structure

- `index.ts` - public exports for the game module
- `pages/` - route pages for play and stats
- `core/` - pure game logic and storage helpers

## Registry snippet

```ts
{
  id: 'my-game',
  name: 'My Game',
  emoji: '🎮',
  description: 'Short game description',
  path: '/my-game',
  statsPath: '/my-game/stats',
  PlayPage: lazy(() => import('../games/my-game/pages/MyGamePage')),
  StatsPage: lazy(() => import('../games/my-game/pages/MyGameStatsPage')),
  hasSavedGame: () => hasSavedGame(),
}
```
