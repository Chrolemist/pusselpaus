import { describe, expect, it } from 'vitest';
import { PONG_CONFIG } from './types';
import { createInitialPongState, startPongMatch, stepPong } from './engine';

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
        },
      },
      { left: { up: false, down: false }, right: { up: false, down: false } },
      16,
    );

    expect(next.score.left).toBe(PONG_CONFIG.maxScore);
    expect(next.status).toBe('finished');
    expect(next.winner).toBe('left');
  });
});