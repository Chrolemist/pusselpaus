# Game Platform Architecture

This project is moving from a collection of games toward a reusable game platform.

The goal is simple:

1. New games should plug into the existing shell instead of rebuilding auth, invites, matchmaking, and result handling.
2. Multiplayer should be added by implementing a contract, not by rewriting Supabase wiring.
3. Game rules should stay inside the game folder. The platform should only own orchestration.

## Layers

### Shell

Path examples:

- `src/app-shell`
- `src/auth`
- `src/game-registry`

Responsibilities:

- auth and profile state
- routing and shell UI
- lobby and game discovery
- top-level overlays and shared UX

### Multiplayer Platform

Path:

- `src/multiplayer`

Responsibilities:

- invites and accept/decline
- active match persistence
- matchmaking and staging
- countdown and replay session flow
- result submission and shared in-game match shell
- transport contracts for live games

### Game Contracts

Path:

- `src/multiplayer/contracts`

Responsibilities:

- standardized TypeScript contracts for turn-based and realtime games
- shared input/state/result types
- transport-facing interfaces

### Game Cartridge

Path:

- `src/games/<game-id>`

Responsibilities:

- pure game rules
- game-specific UI and audio
- game-specific multiplayer adapter
- stats and storage

## Recommended Folder Shape

Use one of these shapes depending on the game type.

### Realtime Game

```text
src/games/<game-id>/
  index.ts
  core/
    engine.ts
    types.ts
  multiplayer/
    adapter.ts
    contract.ts
    index.ts
    use<GameId>RealtimeMatch.ts
  pages/
    <GameId>Page.tsx
  components/
  audio/
  hooks/
```

### Turn-Based Game

```text
src/games/<game-id>/
  index.ts
  core/
    game.ts
    types.ts
  multiplayer/
    contract.ts
    index.ts
  pages/
    <GameId>Page.tsx
    <GameId>StatsPage.tsx
  components/
  hooks/
```

## Standard Rule

Each new multiplayer game should provide four things:

1. A game-local rule engine.
2. A contract implementation.
3. A route page wired into the shell.
4. A registry entry in `src/game-registry/index.ts`.

Games should not talk directly to Supabase from the rule engine.

## Contract Strategy

Do not use one single contract for every game.

Use two contract families:

1. `TurnBasedGameContract`
2. `RealtimeGameContract`

This matches the real difference between games that process moves and games that process continuous input.

## Ping Pong Mapping

Ping Pong now maps into the platform like this:

- rules live in `src/games/pingpong/core`
- realtime serialization lives in `src/games/pingpong/multiplayer/adapter.ts`
- live session orchestration lives in `src/games/pingpong/multiplayer/usePongRealtimeMatch.ts`
- page wiring lives in `src/games/pingpong/pages/PingPongPage.tsx`
- the explicit platform-contract mapping lives in `src/games/pingpong/multiplayer/contract.ts`

That file is the canonical example for future live games.

## Turn-Based Starter

The starter cartridge for a turn-based game lives in:

- `src/games/_turn-based-template`

It is intentionally small and uses a tic-tac-toe-style board so the contract stays easy to understand.

Use it as a reference for:

- game state shape
- move validation
- result derivation
- contract implementation
- local page wiring

## Practical Development Flow

### For a new realtime game

1. Build the deterministic local rules first.
2. Implement `RealtimeGameContract` in the game folder.
3. Reuse `StagingScreen`, active match payload, and result pipeline.
4. Add only the transport adapter and live match hook that the game needs.

### For a new turn-based game

1. Build the singleplayer rules first.
2. Implement `TurnBasedGameContract` in the game folder.
3. Let the shell own invite, ready, start, replay, and persistence.
4. Only send moves and state snapshots through the contract/transport layer.

## What This Architecture Buys

If a game follows the contract:

- shell features stay reusable
- multiplayer becomes an integration step instead of a rewrite
- game code stays testable offline
- live and turn-based games can share the same product shell without sharing the same rule engine