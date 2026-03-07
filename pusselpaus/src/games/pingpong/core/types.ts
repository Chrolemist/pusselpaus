export const PONG_CONFIG = {
  width: 960,
  height: 540,
  paddleWidth: 18,
  paddleHeight: 104,
  paddleInset: 104,
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
  fireBoostChargeHits: 4,
  fireBoostMinSpeed: 980,
  fireBoostMaxSpeed: 1320,
  fireBoostDurationMs: 1400,
} as const;

export type PongSide = 'left' | 'right';
export type PongMode = 'cpu' | 'versus';
export type PongStatus = 'ready' | 'serving' | 'playing' | 'finished';
export type PongCpuLevel = 'easy' | 'medium' | 'hard';

export const PONG_CPU_PRESETS: Record<PongCpuLevel, { paddleSpeed: number; deadzone: number; trackingError: number }> = {
  easy: {
    paddleSpeed: 420,
    deadzone: 42,
    trackingError: 38,
  },
  medium: {
    paddleSpeed: 500,
    deadzone: 28,
    trackingError: 20,
  },
  hard: {
    paddleSpeed: 590,
    deadzone: 16,
    trackingError: 10,
  },
} as const;

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
  isFireball: boolean;
}

export interface PongScoreState {
  left: number;
  right: number;
}

export interface PongState {
  mode: PongMode;
  cpuLevel: PongCpuLevel;
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
  boostReady: Record<PongSide, boolean>;
  boostCharge: Record<PongSide, number>;
  fireBoostOwner: PongSide | null;
  fireBoostTimerMs: number;
  rallyHits: number;
  bestRally: number;
  elapsedMs: number;
}