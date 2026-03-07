export const PONG_CONFIG = {
  width: 960,
  height: 540,
  paddleWidth: 18,
  paddleHeight: 104,
  paddleInset: 34,
  ballSize: 18,
  maxScore: 5,
  paddleSpeed: 620,
  cpuPaddleSpeed: 470,
  ballBaseSpeed: 420,
  ballSpeedStep: 26,
  ballMaxSpeed: 860,
  serveDelayMs: 900,
  fixedStepMs: 1000 / 60,
  aiDeadzone: 30,
  aiTrackingError: 26,
} as const;

export type PongSide = 'left' | 'right';
export type PongMode = 'cpu' | 'versus';
export type PongStatus = 'ready' | 'serving' | 'playing' | 'finished';

export interface PongControlState {
  up: boolean;
  down: boolean;
}

export interface PongInputs {
  left: PongControlState;
  right: PongControlState;
}

export interface PongPaddleState {
  y: number;
  velocity: number;
}

export interface PongBallState {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface PongScoreState {
  left: number;
  right: number;
}

export interface PongState {
  mode: PongMode;
  status: PongStatus;
  paddles: {
    left: PongPaddleState;
    right: PongPaddleState;
  };
  ball: PongBallState;
  score: PongScoreState;
  serveTo: PongSide;
  serveTimerMs: number;
  winner: PongSide | null;
  lastScorer: PongSide | null;
  rallyHits: number;
  bestRally: number;
  elapsedMs: number;
}