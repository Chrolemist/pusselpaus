import type { PlatformContractContext, PlatformPlayerSlot, PlatformResultBase, RealtimeGameContract, RealtimeInputApplyContext } from '../../../multiplayer/contracts';
import { PONG_CONFIG, type PongCpuLevel, type PongSide, type PongState } from '../core/types';
import { activateFireBoost, startPongMatch, stepPong } from '../core/engine';
import { pongRealtimeAdapter } from './adapter';
import type { PongRealtimeConfig, PongRealtimeInput } from './types';

interface PingPongResult extends PlatformResultBase<{
  leftScore: number;
  rightScore: number;
  bestRally: number;
}> {}

function isPongCpuLevel(value: string | undefined): value is PongCpuLevel {
  return value === 'easy' || value === 'medium' || value === 'hard';
}

function sideFromPlayer(players: PlatformPlayerSlot[], playerId: string): PongSide | null {
  const player = players.find((entry) => entry.participantId === playerId);
  if (!player) return null;
  return player.seat === 0 ? 'left' : 'right';
}

export const pingPongRealtimeContract: RealtimeGameContract<
  PongRealtimeConfig,
  PongRealtimeInput,
  PongState,
  PingPongResult
> = {
  kind: 'realtime',
  authority: 'host-authoritative',
  tickRate: 60,
  maxPlayers: 2,
  createInitialState(context: PlatformContractContext<PongRealtimeConfig>): PongState {
    const difficulty = isPongCpuLevel(context.config.difficulty) ? context.config.difficulty : 'medium';
    return startPongMatch('versus', difficulty);
  },
  step(state, inputsByParticipant, context) {
    const leftPlayer = context.players.find((entry) => entry.seat === 0);
    const rightPlayer = context.players.find((entry) => entry.seat === 1);
    const leftInput = leftPlayer ? inputsByParticipant.get(leftPlayer.participantId) : undefined;
    const rightInput = rightPlayer ? inputsByParticipant.get(rightPlayer.participantId) : undefined;

    return stepPong(
      state,
      {
        left: {
          up: leftInput?.up ?? false,
          down: leftInput?.down ?? false,
          targetY: leftInput?.targetY ?? null,
        },
        right: {
          up: rightInput?.up ?? false,
          down: rightInput?.down ?? false,
          targetY: rightInput?.targetY ?? null,
        },
      },
      context.dtMs,
    );
  },
  applyInput(state, input, context: RealtimeInputApplyContext<PongRealtimeConfig, PongRealtimeInput>) {
    const previousNonce = context.previousInput?.boostNonce ?? 0;
    if (input.boostNonce <= previousNonce) return state;

    const side = sideFromPlayer(context.players, context.playerId);
    if (!side) return state;
    return activateFireBoost(state, side);
  },
  serializeInput(input) {
    return pongRealtimeAdapter.serializeInput(input);
  },
  deserializeInput(payload) {
    return pongRealtimeAdapter.deserializeInput(payload);
  },
  serializeState(state) {
    return pongRealtimeAdapter.serializeState(state);
  },
  deserializeState(payload) {
    return pongRealtimeAdapter.deserializeState(payload);
  },
  deriveResult(state) {
    if (state.status !== 'finished') return null;

    return {
      outcome: state.winner === null ? 'draw' : 'win',
      completed: true,
      rankBy: 'score',
      winnerParticipantId: state.winner,
      score: Math.max(state.score.left, state.score.right),
      elapsedMs: state.elapsedMs,
      metrics: {
        leftScore: state.score.left,
        rightScore: state.score.right,
        bestRally: state.bestRally,
      },
    };
  },
};

export const pingPongRealtimeContractExample = {
  transport: 'src/multiplayer/realtime',
  adapter: 'src/games/pingpong/multiplayer/adapter.ts',
  contract: 'src/games/pingpong/multiplayer/contract.ts',
  liveSessionHook: 'src/games/pingpong/multiplayer/usePongRealtimeMatch.ts',
  page: 'src/games/pingpong/pages/PingPongPage.tsx',
  notes: [
    'The platform shell owns invite, staging, rematch, and result UI.',
    'Ping Pong owns deterministic rules, input serialization, and live simulation.',
    'Boost is represented as an edge-triggered input and mapped through applyInput.',
  ],
  tickRate: Math.round(1000 / PONG_CONFIG.fixedStepMs),
} as const;