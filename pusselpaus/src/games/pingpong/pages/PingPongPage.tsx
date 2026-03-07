import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import confetti from 'canvas-confetti';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Play, Maximize2, Minimize2 } from 'lucide-react';
import { PONG_CONFIG, type PongControlState, type PongCpuLevel, type PongInputs, type PongSide, type PongState } from '../core/types';
import { activateFireBoost, createInitialPongState, startPongMatch, stepPong } from '../core/engine';
import { playFireBoost, playPaddleHit, playScoreBurst, playServePulse, playVictoryFanfare, playWallBounce } from '../audio/pingPongAudio';
import { LiveBanner as MultiplayerLiveBanner, MULTIPLAYER_EXIT_EVENT, MULTIPLAYER_REPLAY_EVENT, StagingScreen, type StagingResult, useMultiplayerGame } from '../../../multiplayer';
import { usePongRealtimeMatch } from '../multiplayer';

const PINGPONG_SOLO_DIFFICULTIES: Array<{ value: PongCpuLevel; label: string }> = [
  { value: 'easy', label: 'Latt' },
  { value: 'medium', label: 'Medel' },
  { value: 'hard', label: 'Svar' },
];

function isPongCpuLevel(value: string | undefined): value is PongCpuLevel {
  return value === 'easy' || value === 'medium' || value === 'hard';
}

function winnerLabel(side: PongSide | null): string {
  if (side === 'left') return 'Vanster spelare vann';
  if (side === 'right') return 'Hoger spelare vann';
  return 'Ingen vinnare an';
}

function sideAccent(side: PongSide | null): string {
  if (side === 'left') return 'text-cyan-300';
  if (side === 'right') return 'text-fuchsia-300';
  return 'text-brand-light';
}

function sideLabel(side: PongSide): string {
  return side === 'left' ? 'Vanster' : 'Hoger';
}

function multiplayerInputFromKeys(keys: Record<string, boolean>): PongControlState {
  return {
    up: !!keys.w || !!keys.arrowup,
    down: !!keys.s || !!keys.arrowdown,
  };
}

function emptyControl(): PongControlState {
  return { up: false, down: false, targetY: null };
}

function mergeControlStates(a: PongControlState, b: PongControlState): PongControlState {
  return {
    up: a.up || b.up,
    down: a.down || b.down,
    targetY: b.targetY ?? a.targetY ?? null,
  };
}

function controlFromPointerTarget(targetY: number | null, paddleY: number): PongControlState {
  if (targetY == null) return emptyControl();

  const paddleCenter = paddleY + PONG_CONFIG.paddleHeight / 2;
  const delta = targetY - paddleCenter;
  const deadzone = 4;

  if (Math.abs(delta) <= deadzone) {
    return { up: false, down: false, targetY };
  }

  return delta < 0
    ? { up: true, down: false, targetY }
    : { up: false, down: true, targetY };
}

export default function PingPongPage() {
  const [cpuLevel, setCpuLevel] = useState<PongCpuLevel>('medium');
  const [state, setState] = useState<PongState>(() => createInitialPongState('cpu', 'medium'));
  const [session, setSession] = useState<StagingResult | null>(null);
  const [multiplayerInput, setMultiplayerInput] = useState<PongControlState>({ up: false, down: false, targetY: null });
  const [trail, setTrail] = useState<Array<{ id: number; x: number; y: number }>>([]);
  const [leftImpact, setLeftImpact] = useState(0);
  const [rightImpact, setRightImpact] = useState(0);
  const [wallImpact, setWallImpact] = useState(0);
  const [scoreFlashSide, setScoreFlashSide] = useState<PongSide | null>(null);
  const [scoreFlashTick, setScoreFlashTick] = useState(0);
  const [fireBoostFlashTick, setFireBoostFlashTick] = useState(0);
  const pressedKeysRef = useRef<Record<string, boolean>>({});
  const stateRef = useRef(state);
  const previousStateRef = useRef(state);
  const servePulseSecondRef = useRef<number | null>(null);
  const confettiFiredRef = useRef(false);
  const submittedMatchRef = useRef(false);
  const trailIdRef = useRef(0);
  const trailSampleAtRef = useRef(0);
  const arenaFocusRef = useRef<HTMLDivElement | null>(null);
  const arenaSurfaceRef = useRef<HTMLDivElement | null>(null);
  const stagingResetRef = useRef<(() => void) | null>(null);
  const pointerTargetRef = useRef<Record<PongSide, number | null>>({ left: null, right: null });
  const activePointerIdRef = useRef<number | null>(null);
  const [isPortraitMobile, setIsPortraitMobile] = useState(false);
  const [isArenaFocusMode, setIsArenaFocusMode] = useState(false);
  const { submitResult: submitMatchResult } = useMultiplayerGame('pingpong');
  const isRealtimeMatch = session?.multiplayer === true;

  const realtimeMatch = usePongRealtimeMatch({
    enabled: isRealtimeMatch,
    matchId: session?.matchId,
    config: session?.config,
    seed: session?.seed,
    localInput: multiplayerInput,
  });
  const gameState = isRealtimeMatch ? (realtimeMatch.liveState ?? state) : state;
  const gameStateRef = useRef(gameState);

  const pushState = (nextState: PongState) => {
    stateRef.current = nextState;
    setState(nextState);
  };

  const controlledSide: PongSide = isRealtimeMatch ? (realtimeMatch.localSide ?? 'left') : 'left';

  const syncRealtimeControl = useCallback(() => {
    const keysControl = multiplayerInputFromKeys(pressedKeysRef.current);
    const latestState = gameStateRef.current;
    const paddleY = latestState.paddles[controlledSide].y;
    const pointerControl = controlFromPointerTarget(pointerTargetRef.current[controlledSide], paddleY);
    const nextControl = mergeControlStates({ ...keysControl, targetY: null }, pointerControl);

    setMultiplayerInput((current) => {
      if (current.up === nextControl.up && current.down === nextControl.down && current.targetY === nextControl.targetY) {
        return current;
      }
      return nextControl;
    });
  }, [controlledSide]);

  const resetLocalGameState = useCallback((nextState: PongState) => {
    stateRef.current = nextState;
    previousStateRef.current = nextState;
    setState(nextState);
    setTrail([]);
    trailSampleAtRef.current = 0;
    confettiFiredRef.current = false;
    submittedMatchRef.current = false;
  }, []);

  const handleStart = useCallback((result: StagingResult) => {
    const nextCpuLevel = isPongCpuLevel(result.difficulty) ? result.difficulty : 'medium';
    setSession(result);
    setCpuLevel(nextCpuLevel);

    const nextState = result.multiplayer
      ? startPongMatch('versus', nextCpuLevel)
      : startPongMatch('cpu', nextCpuLevel);

    resetLocalGameState(nextState);
  }, [resetLocalGameState]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    gameStateRef.current = gameState;
    syncRealtimeControl();
  }, [gameState, syncRealtimeControl]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const media = window.matchMedia('(max-width: 900px) and (orientation: portrait)');
    const update = () => {
      const matches = media.matches;
      setIsPortraitMobile(matches);

      if (!matches && arenaFocusRef.current && document.fullscreenElement === arenaFocusRef.current) {
        void document.exitFullscreen().catch(() => undefined);
      }
    };

    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setIsArenaFocusMode(false);
        return;
      }

      setIsArenaFocusMode(document.fullscreenElement === arenaFocusRef.current);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    document.body.style.overflow = isArenaFocusMode ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isArenaFocusMode]);

  useEffect(() => {
    const handleReplay = (event: Event) => {
      const replayEvent = event as CustomEvent<{ gameId?: string }>;
      if (replayEvent.detail?.gameId !== 'pingpong') return;
      setSession(null);
      resetLocalGameState(createInitialPongState('cpu', 'medium'));
      stagingResetRef.current?.();
    };

    const handleExit = (event: Event) => {
      const exitEvent = event as CustomEvent<{ gameId?: string }>;
      if (exitEvent.detail?.gameId !== 'pingpong') return;
      setSession(null);
      resetLocalGameState(createInitialPongState('cpu', 'medium'));
      stagingResetRef.current?.();
    };

    window.addEventListener(MULTIPLAYER_REPLAY_EVENT, handleReplay as EventListener);
    window.addEventListener(MULTIPLAYER_EXIT_EVENT, handleExit as EventListener);
    return () => {
      window.removeEventListener(MULTIPLAYER_REPLAY_EVENT, handleReplay as EventListener);
      window.removeEventListener(MULTIPLAYER_EXIT_EVENT, handleExit as EventListener);
    };
  }, [resetLocalGameState]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const code = event.code.toLowerCase();

      if (code === 'space' || key === ' ') {
        event.preventDefault();
        if (!event.repeat) {
          const preferredSide = gameStateRef.current.ball.vx >= 0 ? 'left' : 'right';
          triggerFireBoost(preferredSide);
        }
        return;
      }

      if (code === 'arrowup' || code === 'arrowdown') {
        event.preventDefault();
      }

      pressedKeysRef.current[key] = true;
      syncRealtimeControl();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const code = event.code.toLowerCase();

      if (code === 'space' || key === ' ') {
        event.preventDefault();
        return;
      }

      if (code === 'arrowup' || code === 'arrowdown') {
        event.preventDefault();
      }

      pressedKeysRef.current[key] = false;
      syncRealtimeControl();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [syncRealtimeControl]);

  useEffect(() => {
    if (isRealtimeMatch) return;

    let frameId = 0;
    let last = performance.now();
    let accumulator = 0;

    const readInputs = (): PongInputs => ({
      left: mergeControlStates({
        up: !!pressedKeysRef.current.w,
        down: !!pressedKeysRef.current.s,
        targetY: null,
      }, controlFromPointerTarget(pointerTargetRef.current.left, stateRef.current.paddles.left.y)),
      right: {
        up: !!pressedKeysRef.current.arrowup,
        down: !!pressedKeysRef.current.arrowdown,
        targetY: null,
      },
    });

    const loop = (now: number) => {
      const delta = Math.min(32, now - last);
      last = now;
      accumulator += delta;
      let nextState = stateRef.current;
      let changed = false;

      while (accumulator >= PONG_CONFIG.fixedStepMs) {
        nextState = stepPong(nextState, readInputs(), PONG_CONFIG.fixedStepMs);
        changed = true;
        accumulator -= PONG_CONFIG.fixedStepMs;
      }

      if (changed) {
        stateRef.current = nextState;
        setState(nextState);

        if (nextState.status === 'playing' && now - trailSampleAtRef.current >= 52) {
          trailSampleAtRef.current = now;
          startTransition(() => {
            setTrail((previousTrail) => {
              const nextTrail = [...previousTrail, { id: trailIdRef.current++, x: nextState.ball.x, y: nextState.ball.y }];
              return nextTrail.slice(-5);
            });
          });
        } else if (nextState.status !== 'playing') {
          trailSampleAtRef.current = 0;
          startTransition(() => {
            setTrail((previousTrail) => (previousTrail.length > 0 ? [] : previousTrail));
          });
        }
      }

      frameId = window.requestAnimationFrame(loop);
    };

    frameId = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(frameId);
  }, [isRealtimeMatch]);

  useEffect(() => {
    const previous = previousStateRef.current;
    if (previous === gameState) return;

    let animationFrameId: number | undefined;
    let resetScoreFlashTimeout: number | undefined;

    const scheduleVisualUpdate = (callback: () => void) => {
      animationFrameId = window.requestAnimationFrame(callback);
    };

    const scoreChanged = previous.score.left !== gameState.score.left || previous.score.right !== gameState.score.right;
    if (scoreChanged) {
      const scorer: PongSide = gameState.score.left > previous.score.left ? 'left' : 'right';
      scheduleVisualUpdate(() => {
        setScoreFlashSide(scorer);
        setScoreFlashTick((tick) => tick + 1);
      });
      playScoreBurst();
      resetScoreFlashTimeout = window.setTimeout(() => {
        setScoreFlashSide((current) => (current === scorer ? null : current));
      }, 380);
    }

    const paddleHit = previous.status === 'playing'
      && gameState.status === 'playing'
      && Math.sign(previous.ball.vx) !== Math.sign(gameState.ball.vx)
      && Math.abs(previous.ball.vx) > 0
      && Math.abs(gameState.ball.vx) > 0;
    if (paddleHit) {
      const side: PongSide = gameState.ball.vx > 0 ? 'left' : 'right';
      scheduleVisualUpdate(() => {
        if (side === 'left') {
          setLeftImpact((value) => value + 1);
        } else {
          setRightImpact((value) => value + 1);
        }
      });
      playPaddleHit();
    }

    const wallBounce = previous.status === 'playing'
      && gameState.status === 'playing'
      && Math.sign(previous.ball.vy) !== Math.sign(gameState.ball.vy)
      && Math.abs(previous.ball.vy) > 0
      && Math.abs(gameState.ball.vy) > 0;
    if (wallBounce) {
      scheduleVisualUpdate(() => {
        setWallImpact((value) => value + 1);
      });
      playWallBounce();
    }

    if (!previous.ball.isFireball && gameState.ball.isFireball) {
      scheduleVisualUpdate(() => {
        setFireBoostFlashTick((tick) => tick + 1);
      });
      playFireBoost();
    }

    if (gameState.status === 'serving') {
      const seconds = Math.ceil(gameState.serveTimerMs / 1000);
      if (seconds > 0 && servePulseSecondRef.current !== seconds) {
        servePulseSecondRef.current = seconds;
        playServePulse();
      }
    } else {
      servePulseSecondRef.current = null;
    }

    if (gameState.status === 'finished' && !confettiFiredRef.current) {
      confettiFiredRef.current = true;
      playVictoryFanfare();
      confetti({
        particleCount: 160,
        spread: 80,
        origin: { y: 0.28 },
        colors: gameState.winner === 'left' ? ['#22d3ee', '#67e8f9', '#ffffff'] : ['#f0abfc', '#e879f9', '#ffffff'],
      });
    }

    if (gameState.status !== 'finished') {
      confettiFiredRef.current = false;
    }

    if (isRealtimeMatch && gameState.status === 'finished' && !submittedMatchRef.current) {
      submittedMatchRef.current = true;
      const localScore = realtimeMatch.localSide ? gameState.score[realtimeMatch.localSide] : undefined;
      void submitMatchResult({ score: localScore });
    }

    if (gameState.status !== 'finished') {
      submittedMatchRef.current = false;
    }

    previousStateRef.current = gameState;

    return () => {
      if (animationFrameId !== undefined) {
        window.cancelAnimationFrame(animationFrameId);
      }
      if (resetScoreFlashTimeout !== undefined) {
        window.clearTimeout(resetScoreFlashTimeout);
      }
    };
  }, [gameState, isRealtimeMatch, realtimeMatch.localSide, submitMatchResult]);

  const leftPaddleStyle = useMemo(() => ({
    left: `${(PONG_CONFIG.paddleInset / PONG_CONFIG.width) * 100}%`,
    top: `${(gameState.paddles.left.y / PONG_CONFIG.height) * 100}%`,
    width: `${(PONG_CONFIG.paddleWidth / PONG_CONFIG.width) * 100}%`,
    height: `${(PONG_CONFIG.paddleHeight / PONG_CONFIG.height) * 100}%`,
  }), [gameState.paddles.left.y]);

  const rightPaddleStyle = useMemo(() => ({
    left: `${((PONG_CONFIG.width - PONG_CONFIG.paddleInset - PONG_CONFIG.paddleWidth) / PONG_CONFIG.width) * 100}%`,
    top: `${(gameState.paddles.right.y / PONG_CONFIG.height) * 100}%`,
    width: `${(PONG_CONFIG.paddleWidth / PONG_CONFIG.width) * 100}%`,
    height: `${(PONG_CONFIG.paddleHeight / PONG_CONFIG.height) * 100}%`,
  }), [gameState.paddles.right.y]);

  const ballStyle = useMemo(() => ({
    left: `${(gameState.ball.x / PONG_CONFIG.width) * 100}%`,
    top: `${(gameState.ball.y / PONG_CONFIG.height) * 100}%`,
    width: `${(PONG_CONFIG.ballSize / PONG_CONFIG.width) * 100}%`,
    height: `${(PONG_CONFIG.ballSize / PONG_CONFIG.height) * 100}%`,
  }), [gameState.ball.x, gameState.ball.y]);

  const fireBoostHitboxStyle = useMemo(() => ({
    left: `${(gameState.ball.x / PONG_CONFIG.width) * 100}%`,
    top: `${(gameState.ball.y / PONG_CONFIG.height) * 100}%`,
    width: `${(PONG_CONFIG.ballSize / PONG_CONFIG.width) * 280}%`,
    height: `${(PONG_CONFIG.ballSize / PONG_CONFIG.height) * 280}%`,
    transform: 'translate(-32%, -32%)',
  }), [gameState.ball.x, gameState.ball.y]);

  const arenaGlowStyle = useMemo(() => ({
    left: `${(gameState.ball.x / PONG_CONFIG.width) * 100}%`,
    top: `${(gameState.ball.y / PONG_CONFIG.height) * 100}%`,
  }), [gameState.ball.x, gameState.ball.y]);

  const leftMomentum = Math.min(1, Math.abs(gameState.paddles.left.velocity) / PONG_CONFIG.paddleSpeed);
  const rightMomentum = Math.min(1, Math.abs(gameState.paddles.right.velocity) / PONG_CONFIG.paddleSpeed);
  const leftScoring = scoreFlashSide === 'left';
  const rightScoring = scoreFlashSide === 'right';
  const leftBoostPercent = Math.min(100, (gameState.boostCharge.left / PONG_CONFIG.fireBoostChargeHits) * 100);
  const rightBoostPercent = Math.min(100, (gameState.boostCharge.right / PONG_CONFIG.fireBoostChargeHits) * 100);

  const triggerFireBoost = (preferredSide?: PongSide) => {
    if (isRealtimeMatch) {
      realtimeMatch.requestBoost();
      return;
    }

    const candidates: PongSide[] = preferredSide
      ? [preferredSide, preferredSide === 'left' ? 'right' : 'left']
      : gameState.ball.vx >= 0 ? ['left', 'right'] : ['right', 'left'];

    for (const side of candidates) {
      const nextState = activateFireBoost(stateRef.current, side);
      if (nextState !== stateRef.current) {
        previousStateRef.current = stateRef.current;
        pushState(nextState);
        return;
      }
    }
  };

  const enterArenaFocusMode = async () => {
    setIsArenaFocusMode(true);

    if (!arenaFocusRef.current?.requestFullscreen) {
      return;
    }

    try {
      await arenaFocusRef.current.requestFullscreen();
    } catch {
      setIsArenaFocusMode(true);
    }
  };

  const exitArenaFocusMode = async () => {
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        setIsArenaFocusMode(false);
        return;
      }
    }

    setIsArenaFocusMode(false);
  };

  return (
    <StagingScreen
      gameId="pingpong"
      onStart={handleStart}
      soloDifficulties={PINGPONG_SOLO_DIFFICULTIES}
      soloDefaultDifficulty="medium"
      resetRef={stagingResetRef}
    >
      <div className={isArenaFocusMode ? 'fixed inset-0 z-50 flex bg-[#020617]' : 'flex min-h-full flex-col items-center gap-6 px-4 py-8'}>
        {!isArenaFocusMode && (
          <div className="flex w-full max-w-5xl items-center justify-between">
            <Link to="/" className="flex items-center gap-1 text-sm text-text-muted transition hover:text-brand-light">
              <ArrowLeft className="h-4 w-4" /> Lobby
            </Link>

            <div className="rounded-full bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-brand-light ring-1 ring-white/10">
              {isRealtimeMatch ? 'Ping Pong Live' : 'Ping Pong'}
            </div>
          </div>
        )}

        <div className={isArenaFocusMode ? 'flex h-dvh w-screen items-center justify-center bg-[#020617]' : 'w-full max-w-5xl rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.92)_0%,rgba(12,18,35,0.98)_100%)] p-5 shadow-[0_30px_80px_rgba(8,15,35,0.45)]'}>
          {!isArenaFocusMode && (
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h1 className="text-3xl font-extrabold text-white">🏓 Ping Pong</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted">
                  {isRealtimeMatch
                    ? 'Live-duell ovanpa samma deterministiska karna.'
                    : `CPU-niva: ${cpuLevel === 'easy' ? 'Latt' : cpuLevel === 'medium' ? 'Medel' : 'Svar'}`}
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 lg:w-[360px]">
                {!isRealtimeMatch && (
                  <div className="rounded-full bg-white/5 px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white/75 ring-1 ring-white/10">
                    Singleplayer
                  </div>
                )}
                {isRealtimeMatch && realtimeMatch.localSide && (
                  <div className="rounded-full bg-white/5 px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white/75 ring-1 ring-white/10">
                    Din sida: {sideLabel(realtimeMatch.localSide)}
                  </div>
                )}
                {isPortraitMobile && (
                  <button
                    onClick={() => {
                      void enterArenaFocusMode();
                    }}
                    className="flex items-center justify-center gap-2 rounded-2xl bg-white/5 px-4 py-3 text-sm font-semibold text-text-muted ring-1 ring-white/10 transition hover:text-white"
                  >
                    <Maximize2 className="h-4 w-4" /> Helskarmsbana
                  </button>
                )}
              </div>
            </div>
          )}

          <div className={isArenaFocusMode ? 'w-full' : 'mt-5 grid gap-4 lg:grid-cols-[1fr_260px]'}>
            <div
              ref={arenaFocusRef}
              className={isArenaFocusMode ? 'relative flex h-dvh w-screen items-center justify-center bg-[#020617]' : 'rounded-[28px] border border-cyan-400/15 bg-[#07111f] p-3 shadow-inner shadow-cyan-500/5'}
            >
              <div
                ref={arenaSurfaceRef}
                className={isArenaFocusMode ? 'relative aspect-[16/9] w-full touch-none overflow-hidden bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.08),transparent_32%),linear-gradient(180deg,#08101b_0%,#0a1424_100%)]' : 'relative aspect-[16/9] touch-none overflow-hidden rounded-[22px] border border-white/8 bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.08),transparent_32%),linear-gradient(180deg,#08101b_0%,#0a1424_100%)]'}
                style={isArenaFocusMode ? { maxHeight: '100dvh', touchAction: 'none' } : { touchAction: 'none' }}
                onPointerDown={(event) => {
                  if (!arenaSurfaceRef.current) return;

                  activePointerIdRef.current = event.pointerId;
                  event.currentTarget.setPointerCapture(event.pointerId);
                  const rect = arenaSurfaceRef.current.getBoundingClientRect();
                  const relativeY = ((event.clientY - rect.top) / rect.height) * PONG_CONFIG.height;
                  pointerTargetRef.current[controlledSide] = Math.max(0, Math.min(PONG_CONFIG.height, relativeY));
                  syncRealtimeControl();
                }}
                onPointerMove={(event) => {
                  if (!arenaSurfaceRef.current) return;
                  if (event.pointerType !== 'mouse' && activePointerIdRef.current !== event.pointerId) return;

                  const rect = arenaSurfaceRef.current.getBoundingClientRect();
                  const relativeY = ((event.clientY - rect.top) / rect.height) * PONG_CONFIG.height;
                  pointerTargetRef.current[controlledSide] = Math.max(0, Math.min(PONG_CONFIG.height, relativeY));
                  syncRealtimeControl();
                }}
                onPointerUp={(event) => {
                  if (activePointerIdRef.current === event.pointerId) {
                    activePointerIdRef.current = null;
                  }
                  pointerTargetRef.current[controlledSide] = null;
                  syncRealtimeControl();
                }}
                onPointerCancel={(event) => {
                  if (activePointerIdRef.current === event.pointerId) {
                    activePointerIdRef.current = null;
                  }
                  pointerTargetRef.current[controlledSide] = null;
                  syncRealtimeControl();
                }}
                onPointerLeave={(event) => {
                  if (event.pointerType !== 'mouse') return;
                  pointerTargetRef.current[controlledSide] = null;
                  syncRealtimeControl();
                }}
              >
                {isArenaFocusMode && (
                  <button
                    onClick={() => {
                      void exitArenaFocusMode();
                    }}
                    className="absolute right-3 top-3 z-30 inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/70 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/80 backdrop-blur"
                  >
                    <Minimize2 className="h-3.5 w-3.5" /> Stang
                  </button>
                )}

                <motion.div
                  className="absolute rounded-full bg-white/10 blur-[80px]"
                  animate={{ opacity: gameState.status === 'playing' ? [0.2, 0.4, 0.2] : 0.12, scale: gameState.status === 'playing' ? [0.9, 1.08, 0.95] : 0.9 }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                  style={{ ...arenaGlowStyle, width: '20%', height: '34%', transform: 'translate(-50%, -50%)' }}
                />
                <div className="pointer-events-none absolute inset-0 opacity-20" style={{ backgroundImage: 'linear-gradient(to bottom, transparent 0%, rgba(255,255,255,0.08) 50%, transparent 100%)', backgroundSize: '100% 12px' }} />
                <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/10" />
                {Array.from({ length: 11 }).map((_, index) => (
                  <div
                    key={index}
                    className="absolute left-1/2 h-6 w-1 -translate-x-1/2 rounded-full bg-white/8"
                    style={{ top: `${6 + index * 8.5}%` }}
                  />
                ))}

                <div className="absolute inset-x-0 top-6 flex items-center justify-center gap-10 text-center">
                  <motion.div
                    key={`left-score-${scoreFlashTick}-${leftScoring}`}
                    animate={leftScoring ? { scale: [1, 1.22, 1], y: [0, -8, 0] } : { scale: 1, y: 0 }}
                    transition={{ duration: 0.35 }}
                  >
                    <p className="text-[11px] uppercase tracking-[0.28em] text-cyan-300/80">Vanster</p>
                    <p className={`mt-1 text-5xl font-extrabold ${leftScoring ? 'text-cyan-300 drop-shadow-[0_0_18px_rgba(34,211,238,0.55)]' : 'text-white'}`}>{gameState.score.left}</p>
                  </motion.div>
                  <motion.div
                    key={`right-score-${scoreFlashTick}-${rightScoring}`}
                    animate={rightScoring ? { scale: [1, 1.22, 1], y: [0, -8, 0] } : { scale: 1, y: 0 }}
                    transition={{ duration: 0.35 }}
                  >
                    <p className="text-[11px] uppercase tracking-[0.28em] text-fuchsia-300/80">Hoger</p>
                    <p className={`mt-1 text-5xl font-extrabold ${rightScoring ? 'text-fuchsia-300 drop-shadow-[0_0_18px_rgba(232,121,249,0.55)]' : 'text-white'}`}>{gameState.score.right}</p>
                  </motion.div>
                </div>

                <div className="absolute left-0 top-0 h-full w-full">
                  <div className="absolute rounded-full bg-cyan-300/15 blur-2xl" style={{ left: '8%', top: '28%', width: '10%', height: '16%' }} />
                  <div className="absolute rounded-full bg-fuchsia-400/10 blur-2xl" style={{ right: '8%', bottom: '22%', width: '12%', height: '18%' }} />
                </div>

                <AnimatePresence>
                  {trail.map((point, index) => (
                    <motion.div
                      key={point.id}
                      className="absolute rounded-full bg-white/60"
                      initial={{ opacity: 0.28, scale: 0.8 }}
                      animate={{ opacity: 0.04 + index / 45, scale: 0.55 + index / 18 }}
                      exit={{ opacity: 0 }}
                      style={{
                        left: `${(point.x / PONG_CONFIG.width) * 100}%`,
                        top: `${(point.y / PONG_CONFIG.height) * 100}%`,
                        width: `${(PONG_CONFIG.ballSize / PONG_CONFIG.width) * 70}%`,
                        height: `${(PONG_CONFIG.ballSize / PONG_CONFIG.height) * 70}%`,
                      }}
                    />
                  ))}
                </AnimatePresence>

                <motion.div
                  className="absolute rounded-[10px] bg-cyan-300 shadow-[0_0_24px_rgba(34,211,238,0.35)]"
                  animate={{ scaleX: leftImpact ? [1, 1.2, 1] : 1, opacity: leftMomentum > 0 ? [0.88, 1, 0.88] : 1 }}
                  transition={{ duration: leftImpact ? 0.18 : 0.45 }}
                  style={leftPaddleStyle}
                />
                <motion.div
                  className="absolute rounded-[10px] bg-fuchsia-300 shadow-[0_0_24px_rgba(232,121,249,0.3)]"
                  animate={{ scaleX: rightImpact ? [1, 1.2, 1] : 1, opacity: rightMomentum > 0 ? [0.88, 1, 0.88] : 1 }}
                  transition={{ duration: rightImpact ? 0.18 : 0.45 }}
                  style={rightPaddleStyle}
                />

                <AnimatePresence>
                  {leftImpact > 0 && (
                    <motion.div
                      key={`left-impact-${leftImpact}`}
                      className="absolute left-[6%] top-1/2 h-28 w-28 -translate-y-1/2 rounded-full bg-cyan-300/20 blur-2xl"
                      initial={{ opacity: 0.85, scale: 0.5 }}
                      animate={{ opacity: 0, scale: 1.2 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.22 }}
                    />
                  )}
                  {rightImpact > 0 && (
                    <motion.div
                      key={`right-impact-${rightImpact}`}
                      className="absolute right-[6%] top-1/2 h-28 w-28 -translate-y-1/2 rounded-full bg-fuchsia-300/20 blur-2xl"
                      initial={{ opacity: 0.85, scale: 0.5 }}
                      animate={{ opacity: 0, scale: 1.2 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.22 }}
                    />
                  )}
                  {wallImpact > 0 && (
                    <motion.div
                      key={`wall-impact-${wallImpact}`}
                      className="absolute left-1/2 top-0 h-20 w-48 -translate-x-1/2 rounded-full bg-white/10 blur-2xl"
                      initial={{ opacity: 0.75, scale: 0.8 }}
                      animate={{ opacity: 0, scale: 1.2 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.18 }}
                    />
                  )}
                </AnimatePresence>

                <button
                  type="button"
                  aria-label="Aktivera Fire Boost"
                  onPointerDown={() => {
                    const preferredSide = gameState.ball.vx >= 0 ? 'left' : 'right';
                    triggerFireBoost(preferredSide);
                  }}
                  className="absolute z-20 rounded-full border-0 bg-transparent p-0"
                  style={{
                    ...fireBoostHitboxStyle,
                    cursor: (gameState.boostReady.left || gameState.boostReady.right) ? 'pointer' : 'default',
                    touchAction: 'manipulation',
                  }}
                />

                <motion.div
                  className="pointer-events-none absolute rounded-full bg-white shadow-[0_0_28px_rgba(255,255,255,0.4)]"
                  animate={gameState.ball.isFireball
                    ? {
                        scale: [1, 1.28, 1.1],
                        boxShadow: ['0 0 18px rgba(255,190,92,0.5)', '0 0 42px rgba(249,115,22,0.9)', '0 0 28px rgba(239,68,68,0.7)'],
                      }
                    : gameState.status === 'playing'
                      ? { scale: [1, 1.06, 1], boxShadow: ['0 0 20px rgba(255,255,255,0.35)', '0 0 34px rgba(255,255,255,0.55)', '0 0 20px rgba(255,255,255,0.35)'] }
                      : { scale: 1 }}
                  transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut' }}
                  style={{
                    ...ballStyle,
                    background: gameState.ball.isFireball ? 'radial-gradient(circle at 30% 30%, #fff7ed 0%, #fdba74 18%, #f97316 45%, #dc2626 72%, #7f1d1d 100%)' : undefined,
                  }}
                />

                <AnimatePresence>
                  {gameState.ball.isFireball && (
                    <motion.div
                      key={`fire-aura-${fireBoostFlashTick}-${gameState.fireBoostOwner ?? 'none'}`}
                      className="absolute rounded-full blur-2xl"
                      initial={{ opacity: 0.75, scale: 0.7 }}
                      animate={{ opacity: [0.45, 0.9, 0.45], scale: [0.9, 1.45, 1.1] }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.45, repeat: Infinity, ease: 'easeInOut' }}
                      style={{
                        left: `${(gameState.ball.x / PONG_CONFIG.width) * 100}%`,
                        top: `${(gameState.ball.y / PONG_CONFIG.height) * 100}%`,
                        width: `${(PONG_CONFIG.ballSize / PONG_CONFIG.width) * 220}%`,
                        height: `${(PONG_CONFIG.ballSize / PONG_CONFIG.height) * 220}%`,
                        background: gameState.fireBoostOwner === 'left'
                          ? 'radial-gradient(circle, rgba(34,211,238,0.28) 0%, rgba(249,115,22,0.55) 38%, rgba(239,68,68,0.16) 72%, transparent 100%)'
                          : 'radial-gradient(circle, rgba(232,121,249,0.28) 0%, rgba(249,115,22,0.55) 38%, rgba(239,68,68,0.16) 72%, transparent 100%)',
                        transform: 'translate(-32%, -32%)',
                      }}
                    />
                  )}
                </AnimatePresence>

                {gameState.status === 'serving' && (
                  <motion.div
                    className={`absolute bottom-5 ${gameState.serveTo === 'left' ? 'left-8' : 'right-8'} rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.22em] ring-1 ring-white/10 ${gameState.serveTo === 'left' ? 'bg-cyan-300/12 text-cyan-200' : 'bg-fuchsia-300/12 text-fuchsia-200'}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: [0.5, 1, 0.5], y: 0 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    Serve {gameState.serveTo === 'left' ? 'vanster' : 'hoger'}
                  </motion.div>
                )}

                {(gameState.status === 'ready' || gameState.status === 'finished') && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-950/35 backdrop-blur-[2px]">
                    <motion.div
                      className="rounded-[26px] border border-white/10 bg-slate-950/80 px-6 py-5 text-center shadow-2xl"
                      initial={{ scale: 0.96, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                    >
                      <p className={`text-xs font-semibold uppercase tracking-[0.28em] ${gameState.status === 'finished' ? sideAccent(gameState.winner) : 'text-brand-light'}`}>
                        {gameState.status === 'ready' ? 'Redo' : 'Match slut'}
                      </p>
                      <p className="mt-2 text-2xl font-extrabold text-white">
                        {gameState.status === 'ready'
                          ? 'Tryck starta match'
                          : winnerLabel(gameState.winner)}
                      </p>
                      {gameState.status === 'finished' && isRealtimeMatch && (
                        <p className="mt-2 text-sm text-text-muted">Resultatet visas i livepanelen.</p>
                      )}
                      {!isRealtimeMatch && (
                        <button
                          onClick={() => {
                            resetLocalGameState(startPongMatch('cpu', cpuLevel));
                          }}
                          className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2 text-sm font-bold text-slate-900 transition hover:brightness-105"
                        >
                          <Play className="h-4 w-4" /> {gameState.status === 'finished' ? 'Spela igen' : 'Starta nu'}
                        </button>
                      )}
                    </motion.div>
                  </div>
                )}
              </div>
            </div>

            {!isArenaFocusMode && (
              <div className="space-y-4">
                {isRealtimeMatch && (
                  <div className="overflow-hidden rounded-[24px] bg-white/5 ring-1 ring-white/10">
                    <MultiplayerLiveBanner gameId="pingpong" />
                  </div>
                )}

                {isRealtimeMatch && (
                  <div className="rounded-[24px] bg-white/5 p-4 ring-1 ring-white/10">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-light">Live</p>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-2xl bg-black/20 px-3 py-3">
                        <p className="text-xs text-text-muted">Din sida</p>
                        <p className="mt-1 font-bold text-white">{realtimeMatch.localSide ? sideLabel(realtimeMatch.localSide) : 'Vantar...'}</p>
                      </div>
                      <div className="rounded-2xl bg-black/20 px-3 py-3">
                        <p className="text-xs text-text-muted">Anslutning</p>
                        <p className="mt-1 font-bold text-white">{realtimeMatch.connection.connected ? `${realtimeMatch.connectedPlayers}/2 online` : 'Ateransluter'}</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="rounded-[24px] bg-white/5 p-4 ring-1 ring-white/10">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-light">Fire Boost</p>
                  <div className="mt-3 space-y-3 text-sm text-text-muted">
                    <div className="rounded-2xl bg-black/20 px-3 py-3">
                      <div className="flex items-center justify-between text-xs text-text-muted">
                        <span>Vanster laddning</span>
                        <span>{gameState.boostReady.left ? 'Redo' : `${gameState.boostCharge.left}/${PONG_CONFIG.fireBoostChargeHits}`}</span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                        <div className={`h-full rounded-full ${gameState.boostReady.left ? 'bg-gradient-to-r from-orange-300 via-orange-400 to-red-500' : 'bg-gradient-to-r from-cyan-400 to-orange-400'}`} style={{ width: `${gameState.boostReady.left ? 100 : leftBoostPercent}%` }} />
                      </div>
                    </div>
                    <div className="rounded-2xl bg-black/20 px-3 py-3">
                      <div className="flex items-center justify-between text-xs text-text-muted">
                        <span>Hoger laddning</span>
                        <span>{gameState.boostReady.right ? 'Redo' : `${gameState.boostCharge.right}/${PONG_CONFIG.fireBoostChargeHits}`}</span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                        <div className={`h-full rounded-full ${gameState.boostReady.right ? 'bg-gradient-to-r from-orange-300 via-orange-400 to-red-500' : 'bg-gradient-to-r from-fuchsia-400 to-orange-400'}`} style={{ width: `${gameState.boostReady.right ? 100 : rightBoostPercent}%` }} />
                      </div>
                    </div>
                    {(gameState.boostReady.left || gameState.boostReady.right || gameState.ball.isFireball) && (
                      <motion.div
                        className="rounded-2xl border border-orange-300/25 bg-slate-950/60 px-3 py-3 shadow-xl"
                        key={`fire-status-${fireBoostFlashTick}-${gameState.fireBoostOwner ?? 'idle'}-${gameState.boostReady.left}-${gameState.boostReady.right}`}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                      >
                        <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-orange-200">Fire Boost</p>
                        <p className="mt-1 text-xs text-text-muted">
                          {gameState.ball.isFireball
                            ? `${gameState.fireBoostOwner ? sideLabel(gameState.fireBoostOwner) : 'Nagon'} skickade ivag ett eldklot.`
                            : 'Tryck pa bollen eller strax runt den for att aktivera boost.'}
                        </p>
                      </motion.div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </StagingScreen>
  );
}