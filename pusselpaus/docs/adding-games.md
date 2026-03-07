# Adding New Games

This project is already set up so new games can be added without bloating the first page load.

Follow this pattern when you add a game.

## Rules

1. Keep every game behind a lazy route.
2. Keep game-specific audio, tutorials, celebration UI, and assets inside that game's folder.
3. Do not import a game page directly into the app shell.
4. Do not add new game logic to `App.tsx`, `TopBar.tsx`, or shared overlays unless it is truly cross-game.
5. Prefer small shared hooks for common behavior, but keep heavy dependencies local to the game that needs them.

## Folder Shape

Copy `src/games/_template` and keep the same structure:

- `core/` for pure game logic and storage
- `pages/` for the route page and stats page
- `components/` for game-local UI
- `audio/` for game-local sound code
- `hooks/` for game-local React hooks

## Registration Checklist

1. Copy the template to `src/games/<game-id>`.
2. Rename the page components.
3. Keep storage keys unique for the new game.
4. Register the game in `src/game-registry/index.ts` with `lazy(() => import(...))` for both play and stats pages.
5. Only add `multiplayer` config if the game really supports synced match rules.

## Registry Pattern

Use the existing registry style exactly:

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
  hasSavedGame: () => !!loadMyGame(),
  getStats: () => summarizeStats(loadMyGameStats()),
}
```

## What Must Stay Out Of The App Shell

Avoid putting these in the initial shell unless they are needed immediately on first render:

- game pages
- tutorial systems
- game audio engines
- big animation-only overlays
- one-off dev tools
- multiplayer UI that only opens from a panel

If something opens on click, prefer `lazy(() => import(...))` plus `Suspense` at the point of use.

## When To Create A Shared Module

Create a shared module only if at least one of these is true:

1. The logic is used by two or more games already.
2. The logic is small and has no heavy dependency cost.
3. The logic is part of the product shell, not the individual game.

If not, keep it inside the game folder.

## Performance Guardrails

Before merging a new game:

1. Run `npm run build`.
2. Check that the main `index` asset did not jump unexpectedly.
3. Confirm the new game created its own page chunk.
4. If a heavy library was added for one game only, keep that import inside the game module so Vite can isolate it.

## Multiplayer Guardrails

If a new game gets multiplayer support:

1. Keep match scoring and result resolution game-local where possible.
2. Reuse the shared multiplayer shell instead of creating a separate match flow.
3. Prevent solo rewards from also firing in multiplayer mode.
4. Keep any new match-specific assets or tutorial flows lazy.
5. If the game is truly live, build on top of `src/multiplayer/realtime` rather than adding transport logic to the existing async match shell.

## Current Architecture Baseline

The project currently relies on these loading boundaries:

- `App.tsx` only wires routes and shell-level concerns.
- `game-registry/index.ts` is the entry point for adding new games.
- top-level celebration overlays are deferred until after shell idle.
- friends and match inbox panels are lazy-loaded on demand.
- Vite manual chunks in `vite.config.ts` handle stable vendor splitting.

If new game work keeps those boundaries intact, you can keep scaling the game catalog without regressing startup cost.