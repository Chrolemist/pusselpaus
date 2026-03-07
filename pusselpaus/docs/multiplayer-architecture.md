# Multiplayer Architecture

This project now treats multiplayer as four separate layers.

## Layers

### 1. Core

Path: `src/multiplayer/core`

This owns the match lifecycle:

- create match
- invite / accept / decline
- ready / start / cancel / forfeit
- active-match persistence
- rematch and cleanup

Use this layer for any game that needs the shared multiplayer shell.

### 2. Session

Path: `src/multiplayer/session`

This owns player-facing session flow:

- matchmaking queue
- staging screen
- match found overlay
- countdown sounds
- replay/rematch session events

This is the layer between the lobby and the actual game page.

### 3. Game

Path: `src/multiplayer/game`

This owns game-page integration:

- live match polling for HUD and results
- lightweight game hook for reading active match payload
- shared in-game banner and result shell

Normal asynchronous multiplayer games should mostly plug into this layer plus `core`.

### 4. Realtime

Path: `src/multiplayer/realtime`

This is reserved for true live gameplay sync.

Examples:

- Pong
- shared arena games
- anything where players move at the same time in one continuous simulation

This layer does **not** replace the existing multiplayer shell. It sits on top of it.

## Current Rule Of Thumb

If a game only needs:

- shared matchmaking
- same start time
- local play on each client
- synced winner and results

then use the existing `core + session + game` layers only.

If a game needs:

- live paddle movement
- shared ball position
- continuous state sync
- reconnect during active simulation

then add a game-specific adapter on top of `realtime`.

## Recommended Structure For Future Live Games

For a future live game such as Pong, use this split:

- `src/games/pong/core`
  local game rules, deterministic state updates, scoring
- `src/games/pong/multiplayer`
  game-specific realtime adapter and input/state serializers
- `src/games/pong/pages`
  page component wiring UI to the realtime adapter

The generic multiplayer system should still handle:

- lobby invite or matchmaking
- countdown
- leave / forfeit / cancel
- result screen
- rematch

## Recommended Realtime Strategy

Start with `host-authoritative` for the first live game.

Why:

- simpler than full server authority
- easier to debug
- enough for a first 2-player arcade game

Move to server-authoritative only if a later game really needs stronger anti-cheat or stricter fairness.

## Contracts Added For Live Games

`src/multiplayer/realtime/types.ts` now defines transport-level contracts for:

- participants
- connection state
- input envelopes
- snapshot envelopes
- event envelopes
- realtime transport
- realtime game adapter

That means future live games can follow one pattern instead of inventing their own transport API.

## Practical Checklist For A New Live Multiplayer Game

1. Add the game normally through `src/game-registry/index.ts`.
2. Reuse `core` and `session` for invite, ready, countdown, rematch, and cleanup.
3. Add a game-local realtime adapter in `src/games/<game>/multiplayer`.
4. Implement serialization for inputs and authoritative state.
5. Keep live-state code out of `LiveBanner`, `StagingScreen`, and generic match APIs.
6. Only submit final result through the shared multiplayer result pipeline.

## Why This Refactor Exists

Without this split, future live games would push unrelated networking logic into files built for async result-based multiplayer.

With this split:

- current games stay simple
- future live games have a clear extension point
- shared shell logic stays reusable
- the codebase scales better when more games are added