# Turn-Based Game Template

Use this folder when you want a new drag-baserat eller turbaserat spel to plug into the platform contracts.

This template demonstrates:

- a pure local rules module
- a `TurnBasedGameContract` implementation
- a simple page using the same rules offline first

Suggested flow:

1. Copy this folder to `src/games/<game-id>`.
2. Rename the page and contract exports.
3. Replace the board rules in `core/game.ts`.
4. Keep the contract shape, even if the underlying game changes.
5. Register the game in `src/game-registry/index.ts` when the UI is ready.