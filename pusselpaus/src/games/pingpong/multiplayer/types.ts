import type { PongControlState, PongSide, PongState } from '../core/types';

export interface PongRealtimeConfig {
  difficulty?: string;
}

export interface PongRealtimeInput extends PongControlState {
  boostNonce: number;
}

export interface PongRealtimeSerializedState extends Record<string, unknown> {
  ball: PongState['ball'];
  bestRally: number;
  boostCharge: PongState['boostCharge'];
  boostReady: PongState['boostReady'];
  cpuLevel: PongState['cpuLevel'];
  elapsedMs: number;
  fireBoostOwner: PongState['fireBoostOwner'];
  fireBoostTimerMs: number;
  lastScorer: PongState['lastScorer'];
  mode: PongState['mode'];
  paddles: PongState['paddles'];
  rallyHits: number;
  score: PongState['score'];
  serveTimerMs: number;
  serveTo: PongSide;
  status: PongState['status'];
  winner: PongState['winner'];
}

export interface PongRealtimeStatus {
  connectedPlayers: number;
  totalPlayers: number;
  isHost: boolean;
  localSide: PongSide | null;
}
