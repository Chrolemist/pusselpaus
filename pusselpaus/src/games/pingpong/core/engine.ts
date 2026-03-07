import { PONG_CONFIG, PONG_CPU_PRESETS, type PongControlState, type PongCpuLevel, type PongInputs, type PongMode, type PongSide, type PongState } from './types';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function centeredPaddleY(): number {
  return (PONG_CONFIG.height - PONG_CONFIG.paddleHeight) / 2;
}

function centeredBall() {
  return {
    x: (PONG_CONFIG.width - PONG_CONFIG.ballSize) / 2,
    y: (PONG_CONFIG.height - PONG_CONFIG.ballSize) / 2,
  };
}

function emptyControl(): PongControlState {
  return { up: false, down: false };
}

function serveAngle(seed: number): number {
  const offsets = [-0.24, -0.12, 0, 0.12, 0.24];
  return offsets[Math.abs(seed) % offsets.length];
}

function launchBall(state: PongState): PongState {
  const direction = state.serveTo === 'left' ? 1 : -1;
  const angle = serveAngle(state.score.left + state.score.right + state.bestRally + 1);
  const position = centeredBall();

  return {
    ...state,
    status: 'playing',
    serveTimerMs: 0,
    ball: {
      x: position.x,
      y: position.y,
      vx: Math.cos(angle) * PONG_CONFIG.ballBaseSpeed * direction,
      vy: Math.sin(angle) * PONG_CONFIG.ballBaseSpeed,
    },
  };
}

function resetForServe(state: PongState, serveTo: PongSide, scorer: PongSide | null): PongState {
  const position = centeredBall();
  return {
    ...state,
    status: 'serving',
    serveTo,
    serveTimerMs: PONG_CONFIG.serveDelayMs,
    lastScorer: scorer,
    rallyHits: 0,
    paddles: {
      left: { ...state.paddles.left, y: centeredPaddleY(), velocity: 0 },
      right: { ...state.paddles.right, y: centeredPaddleY(), velocity: 0 },
    },
    ball: {
      x: position.x,
      y: position.y,
      vx: 0,
      vy: 0,
    },
  };
}

function scorePoint(state: PongState, scorer: PongSide): PongState {
  const nextScore = {
    left: state.score.left + (scorer === 'left' ? 1 : 0),
    right: state.score.right + (scorer === 'right' ? 1 : 0),
  };
  const nextBestRally = Math.max(state.bestRally, state.rallyHits);

  if (nextScore[scorer] >= PONG_CONFIG.maxScore) {
    return {
      ...resetForServe({ ...state, score: nextScore, bestRally: nextBestRally }, scorer, scorer),
      status: 'finished',
      winner: scorer,
      serveTimerMs: 0,
    };
  }

  return {
    ...resetForServe({ ...state, score: nextScore, bestRally: nextBestRally }, scorer, scorer),
    winner: null,
  };
}

function controlDirection(control: PongControlState): number {
  if (control.up === control.down) return 0;
  return control.up ? -1 : 1;
}

function deriveCpuControl(state: PongState): PongControlState {
  if (state.status === 'finished') return emptyControl();
  const preset = PONG_CPU_PRESETS[state.cpuLevel];
  const paddleCenter = state.paddles.right.y + PONG_CONFIG.paddleHeight / 2;
  const trackingBall = state.status === 'playing' && state.ball.vx > 0;
  const trackingBias = trackingBall
    ? Math.sin((state.ball.y + state.rallyHits * 17) / 57) * preset.trackingError
    : 0;
  const targetY = state.status === 'serving'
    ? PONG_CONFIG.height / 2
    : trackingBall
      ? state.ball.y + PONG_CONFIG.ballSize / 2 + trackingBias
      : PONG_CONFIG.height / 2;
  const delta = targetY - paddleCenter;

  if (Math.abs(delta) <= preset.deadzone) return emptyControl();
  return delta < 0 ? { up: true, down: false } : { up: false, down: true };
}

function movePaddle(y: number, control: PongControlState, dtMs: number, speed: number): { y: number; velocity: number } {
  const direction = controlDirection(control);
  const velocity = direction * speed;
  const nextY = clamp(y + velocity * (dtMs / 1000), 0, PONG_CONFIG.height - PONG_CONFIG.paddleHeight);
  return { y: nextY, velocity };
}

function reflectFromPaddle(state: PongState, side: PongSide, paddleY: number, nextX: number, nextY: number): PongState {
  const paddleLeft = side === 'left'
    ? PONG_CONFIG.paddleInset
    : PONG_CONFIG.width - PONG_CONFIG.paddleInset - PONG_CONFIG.paddleWidth;
  const paddleRight = paddleLeft + PONG_CONFIG.paddleWidth;
  const ballLeft = nextX;
  const ballRight = nextX + PONG_CONFIG.ballSize;
  const ballTop = nextY;
  const ballBottom = nextY + PONG_CONFIG.ballSize;
  const paddleTop = paddleY;
  const paddleBottom = paddleY + PONG_CONFIG.paddleHeight;

  const overlapsHorizontally = side === 'left'
    ? ballLeft <= paddleRight && ballRight >= paddleLeft
    : ballRight >= paddleLeft && ballLeft <= paddleRight;
  const overlapsVertically = ballBottom >= paddleTop && ballTop <= paddleBottom;

  if (!overlapsHorizontally || !overlapsVertically) return state;

  const paddleCenter = paddleY + PONG_CONFIG.paddleHeight / 2;
  const ballCenter = nextY + PONG_CONFIG.ballSize / 2;
  const offset = clamp((ballCenter - paddleCenter) / (PONG_CONFIG.paddleHeight / 2), -1, 1);
  const currentSpeed = Math.sqrt((state.ball.vx ** 2) + (state.ball.vy ** 2));
  const speed = clamp(currentSpeed + PONG_CONFIG.ballSpeedStep, PONG_CONFIG.ballBaseSpeed, PONG_CONFIG.ballMaxSpeed);
  const direction = side === 'left' ? 1 : -1;
  const angle = offset * 0.9;
  const correctedX = side === 'left'
    ? paddleRight
    : paddleLeft - PONG_CONFIG.ballSize;

  return {
    ...state,
    rallyHits: state.rallyHits + 1,
    bestRally: Math.max(state.bestRally, state.rallyHits + 1),
    ball: {
      x: correctedX,
      y: clamp(nextY, 0, PONG_CONFIG.height - PONG_CONFIG.ballSize),
      vx: Math.cos(angle) * speed * direction,
      vy: Math.sin(angle) * speed,
    },
  };
}

export function createInitialPongState(mode: PongMode = 'cpu', cpuLevel: PongCpuLevel = 'medium'): PongState {
  const position = centeredBall();
  return {
    mode,
    cpuLevel,
    status: 'ready',
    paddles: {
      left: { y: centeredPaddleY(), velocity: 0 },
      right: { y: centeredPaddleY(), velocity: 0 },
    },
    ball: { x: position.x, y: position.y, vx: 0, vy: 0 },
    score: { left: 0, right: 0 },
    serveTo: 'left',
    serveTimerMs: PONG_CONFIG.serveDelayMs,
    winner: null,
    lastScorer: null,
    rallyHits: 0,
    bestRally: 0,
    elapsedMs: 0,
  };
}

export function startPongMatch(mode: PongMode, cpuLevel: PongCpuLevel = 'medium'): PongState {
  return resetForServe(createInitialPongState(mode, cpuLevel), 'left', null);
}

export function stepPong(state: PongState, rawInputs: PongInputs, dtMs: number): PongState {
  const inputs: PongInputs = {
    left: rawInputs.left,
    right: state.mode === 'cpu' ? deriveCpuControl(state) : rawInputs.right,
  };
  const leftSpeed = PONG_CONFIG.paddleSpeed;
  const rightSpeed = state.mode === 'cpu' ? PONG_CPU_PRESETS[state.cpuLevel].paddleSpeed : PONG_CONFIG.paddleSpeed;

  const nextLeft = movePaddle(state.paddles.left.y, inputs.left, dtMs, leftSpeed);
  const nextRight = movePaddle(state.paddles.right.y, inputs.right, dtMs, rightSpeed);
  const withPaddles = {
    ...state,
    paddles: {
      left: nextLeft,
      right: nextRight,
    },
  };

  if (state.status === 'ready' || state.status === 'finished') {
    return withPaddles;
  }

  if (state.status === 'serving') {
    const serveTimerMs = Math.max(0, state.serveTimerMs - dtMs);
    const servingState = {
      ...withPaddles,
      serveTimerMs,
      elapsedMs: state.elapsedMs + dtMs,
    };
    return serveTimerMs <= 0 ? launchBall(servingState) : servingState;
  }

  let nextX = state.ball.x + state.ball.vx * (dtMs / 1000);
  let nextY = state.ball.y + state.ball.vy * (dtMs / 1000);
  let nextVx = state.ball.vx;
  let nextVy = state.ball.vy;

  if (nextY <= 0) {
    nextY = 0;
    nextVy = Math.abs(nextVy);
  } else if (nextY + PONG_CONFIG.ballSize >= PONG_CONFIG.height) {
    nextY = PONG_CONFIG.height - PONG_CONFIG.ballSize;
    nextVy = -Math.abs(nextVy);
  }

  let movedState: PongState = {
    ...withPaddles,
    elapsedMs: state.elapsedMs + dtMs,
    ball: {
      x: nextX,
      y: nextY,
      vx: nextVx,
      vy: nextVy,
    },
  };

  movedState = reflectFromPaddle(movedState, 'left', nextLeft.y, movedState.ball.x, movedState.ball.y);
  movedState = reflectFromPaddle(movedState, 'right', nextRight.y, movedState.ball.x, movedState.ball.y);

  if (movedState.ball.x + PONG_CONFIG.ballSize < 0) {
    return scorePoint(movedState, 'right');
  }

  if (movedState.ball.x > PONG_CONFIG.width) {
    return scorePoint(movedState, 'left');
  }

  return movedState;
}