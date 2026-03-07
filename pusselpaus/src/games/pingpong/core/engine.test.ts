import { describe, expect, it } from 'vitest';
import { PONG_CONFIG } from './types';
import { activateFireBoost, createInitialPongState, startPongMatch, stepPong } from './engine';

describe('pingpong engine', () => {
  it('bounces off the top wall', () => {
    const base = startPongMatch('versus');
    const next = stepPong(
      {
        ...base,
        status: 'playing',
        ball: {
          x: 200,
          y: 1,
          vx: 120,
          vy: -240,
          isFireball: false,
        },
      },
      { left: { up: false, down: false }, right: { up: false, down: false } },
      16,
    );

    expect(next.ball.y).toBe(0);
    expect(next.ball.vy).toBeGreaterThan(0);
  });

  it('scores and finishes when max score is reached', () => {
    const base = createInitialPongState('cpu');
    const next = stepPong(
      {
        ...base,
        status: 'playing',
        score: { left: PONG_CONFIG.maxScore - 1, right: 0 },
        ball: {
          x: PONG_CONFIG.width + 4,
          y: 120,
          vx: 260,
          vy: 0,
          isFireball: false,
        },
      },
      { left: { up: false, down: false }, right: { up: false, down: false } },
      16,
    );

    expect(next.score.left).toBe(PONG_CONFIG.maxScore);
    expect(next.status).toBe('finished');
    expect(next.winner).toBe('left');
  });

  it('activates fire boost after enough defended hits', () => {
    let state = createInitialPongState('cpu', 'medium');

    for (let index = 0; index < PONG_CONFIG.fireBoostChargeHits; index += 1) {
      state = stepPong(
        {
          ...state,
          status: 'playing',
          ball: {
            x: PONG_CONFIG.paddleInset + PONG_CONFIG.paddleWidth - 2,
            y: state.paddles.left.y + 30,
            vx: -420,
            vy: 0,
            isFireball: false,
          },
        },
        { left: { up: false, down: false }, right: { up: false, down: false } },
        16,
      );
    }

    expect(state.boostReady.left).toBe(true);

    const boosted = activateFireBoost(state, 'left');
    expect(boosted.ball.isFireball).toBe(true);
    expect(boosted.fireBoostOwner).toBe('left');
    expect(boosted.fireBoostTimerMs).toBe(PONG_CONFIG.fireBoostDurationMs);
    expect(Math.abs(boosted.ball.vx)).toBeGreaterThan(Math.abs(state.ball.vx));
    expect(boosted.boostReady.left).toBe(false);
  });

  it('keeps each side charge across alternating rallies', () => {
    let state = createInitialPongState('versus', 'medium');

    for (let index = 0; index < 3; index += 1) {
      state = stepPong(
        {
          ...state,
          status: 'playing',
          ball: {
            x: PONG_CONFIG.paddleInset + PONG_CONFIG.paddleWidth - 2,
            y: state.paddles.left.y + 30,
            vx: -420,
            vy: 0,
            isFireball: false,
          },
        },
        { left: { up: false, down: false }, right: { up: false, down: false } },
        16,
      );

      expect(state.boostCharge.left).toBe(index + 1);

      state = stepPong(
        {
          ...state,
          status: 'playing',
          ball: {
            x: PONG_CONFIG.width - PONG_CONFIG.paddleInset - PONG_CONFIG.paddleWidth - PONG_CONFIG.ballSize + 2,
            y: state.paddles.right.y + 30,
            vx: 420,
            vy: 0,
            isFireball: false,
          },
        },
        { left: { up: false, down: false }, right: { up: false, down: false } },
        16,
      );

      expect(state.boostCharge.left).toBe(index + 1);
      expect(state.boostCharge.right).toBe(index + 1);
    }

    expect(state.boostReady.left).toBe(false);
    expect(state.boostReady.right).toBe(false);

    state = stepPong(
      {
        ...state,
        status: 'playing',
        ball: {
          x: PONG_CONFIG.paddleInset + PONG_CONFIG.paddleWidth - 2,
          y: state.paddles.left.y + 30,
          vx: -420,
          vy: 0,
          isFireball: false,
        },
      },
      { left: { up: false, down: false }, right: { up: false, down: false } },
      16,
    );

    expect(state.boostCharge.left).toBe(PONG_CONFIG.fireBoostChargeHits);
    expect(state.boostReady.left).toBe(true);
    expect(state.boostCharge.right).toBe(3);
  });
});