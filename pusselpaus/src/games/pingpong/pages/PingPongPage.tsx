import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import confetti from 'canvas-confetti';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Play, RotateCcw, Swords, Cpu, TimerReset } from 'lucide-react';
import { PONG_CONFIG, PONG_CPU_PRESETS, type PongCpuLevel, type PongInputs, type PongMode, type PongSide, type PongState } from '../core/types';
import { createInitialPongState, startPongMatch, stepPong } from '../core/engine';
import { playPaddleHit, playScoreBurst, playServePulse, playVictoryFanfare, playWallBounce } from '../audio/pingPongAudio';

function winnerLabel(side: PongSide | null): string {
  if (side === 'left') return 'Vänster spelare vann';
  if (side === 'right') return 'Höger spelare vann';
  return 'Ingen vinnare än';
}

function formatSeconds(ms: number): string {
  return `${Math.max(0, Math.floor(ms / 1000))}s`;
}

function sideAccent(side: PongSide | null): string {
  if (side === 'left') return 'text-cyan-300';
  if (side === 'right') return 'text-fuchsia-300';
  return 'text-brand-light';
}

export default function PingPongPage() {
  const [mode, setMode] = useState<PongMode>('cpu');
  const [cpuLevel, setCpuLevel] = useState<PongCpuLevel>('medium');
  const [state, setState] = useState<PongState>(() => createInitialPongState('cpu', 'medium'));
  const [trail, setTrail] = useState<Array<{ id: number; x: number; y: number }>>([]);
  const [leftImpact, setLeftImpact] = useState(0);
  const [rightImpact, setRightImpact] = useState(0);
  const [wallImpact, setWallImpact] = useState(0);
  const [scoreFlashSide, setScoreFlashSide] = useState<PongSide | null>(null);
  const [scoreFlashTick, setScoreFlashTick] = useState(0);
  const pressedKeysRef = useRef<Record<string, boolean>>({});
  const stateRef = useRef(state);
  const previousStateRef = useRef(state);
  const servePulseSecondRef = useRef<number | null>(null);
  const confettiFiredRef = useRef(false);
  const trailIdRef = useRef(0);
  const trailSampleAtRef = useRef(0);

  const pushState = (nextState: PongState) => {
    stateRef.current = nextState;
    setState(nextState);
  };

  useEffect(() => {
    const nextState = createInitialPongState(mode, cpuLevel);
    stateRef.current = nextState;
    previousStateRef.current = nextState;
    setState(nextState);
    setTrail([]);
    trailSampleAtRef.current = 0;
    confettiFiredRef.current = false;
  }, [cpuLevel, mode]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      pressedKeysRef.current[event.key.toLowerCase()] = true;
    };
    const onKeyUp = (event: KeyboardEvent) => {
      pressedKeysRef.current[event.key.toLowerCase()] = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  useEffect(() => {
    let frameId = 0;
    let last = performance.now();
    let accumulator = 0;

    const readInputs = (): PongInputs => ({
      left: {
        up: !!pressedKeysRef.current.w,
        down: !!pressedKeysRef.current.s,
      },
      right: {
        up: !!pressedKeysRef.current.arrowup,
        down: !!pressedKeysRef.current.arrowdown,
      },
    });

    const loop = (now: number) => {
      const delta = Math.min(32, now - last);
      last = now;
      accumulator += delta;
      let nextState = stateRef.current;
      let changed = false;

      while (accumulator >= PONG_CONFIG.fixedStepMs) {
        const inputs = readInputs();
        nextState = stepPong(nextState, inputs, PONG_CONFIG.fixedStepMs);
        changed = true;
        accumulator -= PONG_CONFIG.fixedStepMs;
      }

      if (changed) {
        stateRef.current = nextState;
        setState(nextState);

        if (nextState.status === 'playing' && now - trailSampleAtRef.current >= 34) {
          trailSampleAtRef.current = now;
          setTrail((prev) => {
            const next = [...prev, { id: trailIdRef.current++, x: nextState.ball.x, y: nextState.ball.y }];
            return next.slice(-7);
          });
        } else if (nextState.status !== 'playing') {
          trailSampleAtRef.current = 0;
          setTrail((prev) => (prev.length > 0 ? [] : prev));
        }
      }

      frameId = window.requestAnimationFrame(loop);
    };

    frameId = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => {
    const previous = previousStateRef.current;
    if (previous === state) return;

    const scoreChanged = previous.score.left !== state.score.left || previous.score.right !== state.score.right;
    if (scoreChanged) {
      const scorer: PongSide = state.score.left > previous.score.left ? 'left' : 'right';
      setScoreFlashSide(scorer);
      setScoreFlashTick((tick) => tick + 1);
      playScoreBurst();
      window.setTimeout(() => setScoreFlashSide((current) => (current === scorer ? null : current)), 380);
    }

    const paddleHit = previous.status === 'playing'
      && state.status === 'playing'
      && Math.sign(previous.ball.vx) !== Math.sign(state.ball.vx)
      && Math.abs(previous.ball.vx) > 0
      && Math.abs(state.ball.vx) > 0;
    if (paddleHit) {
      const side: PongSide = state.ball.vx > 0 ? 'left' : 'right';
      if (side === 'left') {
        setLeftImpact((value) => value + 1);
      } else {
        setRightImpact((value) => value + 1);
      }
      playPaddleHit();
    }

    const wallBounce = previous.status === 'playing'
      && state.status === 'playing'
      && Math.sign(previous.ball.vy) !== Math.sign(state.ball.vy)
      && Math.abs(previous.ball.vy) > 0
      && Math.abs(state.ball.vy) > 0;
    if (wallBounce) {
      setWallImpact((value) => value + 1);
      playWallBounce();
    }

    if (state.status === 'serving') {
      const seconds = Math.ceil(state.serveTimerMs / 1000);
      if (seconds > 0 && servePulseSecondRef.current !== seconds) {
        servePulseSecondRef.current = seconds;
        playServePulse();
      }
    } else {
      servePulseSecondRef.current = null;
    }

    if (state.status === 'finished' && !confettiFiredRef.current) {
      confettiFiredRef.current = true;
      playVictoryFanfare();
      confetti({
        particleCount: 160,
        spread: 80,
        origin: { y: 0.28 },
        colors: state.winner === 'left' ? ['#22d3ee', '#67e8f9', '#ffffff'] : ['#f0abfc', '#e879f9', '#ffffff'],
      });
    }

    if (state.status !== 'finished') {
      confettiFiredRef.current = false;
    }

    previousStateRef.current = state;
  }, [state]);

  const leftPaddleStyle = useMemo(() => ({
    left: `${(PONG_CONFIG.paddleInset / PONG_CONFIG.width) * 100}%`,
    top: `${(state.paddles.left.y / PONG_CONFIG.height) * 100}%`,
    width: `${(PONG_CONFIG.paddleWidth / PONG_CONFIG.width) * 100}%`,
    height: `${(PONG_CONFIG.paddleHeight / PONG_CONFIG.height) * 100}%`,
  }), [state.paddles.left.y]);

  const rightPaddleStyle = useMemo(() => ({
    left: `${((PONG_CONFIG.width - PONG_CONFIG.paddleInset - PONG_CONFIG.paddleWidth) / PONG_CONFIG.width) * 100}%`,
    top: `${(state.paddles.right.y / PONG_CONFIG.height) * 100}%`,
    width: `${(PONG_CONFIG.paddleWidth / PONG_CONFIG.width) * 100}%`,
    height: `${(PONG_CONFIG.paddleHeight / PONG_CONFIG.height) * 100}%`,
  }), [state.paddles.right.y]);

  const ballStyle = useMemo(() => ({
    left: `${(state.ball.x / PONG_CONFIG.width) * 100}%`,
    top: `${(state.ball.y / PONG_CONFIG.height) * 100}%`,
    width: `${(PONG_CONFIG.ballSize / PONG_CONFIG.width) * 100}%`,
    height: `${(PONG_CONFIG.ballSize / PONG_CONFIG.height) * 100}%`,
  }), [state.ball.x, state.ball.y]);

  const arenaGlowStyle = useMemo(() => ({
    left: `${(state.ball.x / PONG_CONFIG.width) * 100}%`,
    top: `${(state.ball.y / PONG_CONFIG.height) * 100}%`,
  }), [state.ball.x, state.ball.y]);

  const leftMomentum = Math.min(1, Math.abs(state.paddles.left.velocity) / PONG_CONFIG.paddleSpeed);
  const rightMomentum = Math.min(1, Math.abs(state.paddles.right.velocity) / PONG_CONFIG.paddleSpeed);
  const leftScoring = scoreFlashSide === 'left';
  const rightScoring = scoreFlashSide === 'right';
  const cpuPreset = PONG_CPU_PRESETS[cpuLevel];

  return (
    <div className="flex min-h-full flex-col items-center gap-6 px-4 py-8">
      <div className="flex w-full max-w-5xl items-center justify-between">
        <Link to="/" className="flex items-center gap-1 text-sm text-text-muted transition hover:text-brand-light">
          <ArrowLeft className="h-4 w-4" /> Lobby
        </Link>

        <div className="rounded-full bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-brand-light ring-1 ring-white/10">
          Ping Pong Prototype
        </div>
      </div>

      <div className="w-full max-w-5xl rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.92)_0%,rgba(12,18,35,0.98)_100%)] p-5 shadow-[0_30px_80px_rgba(8,15,35,0.45)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-3xl font-extrabold text-white">🏓 Ping Pong</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted">
              Första versionen är byggd som en ren fixed-tick-kärna med separata inputs per sida. Det gör att vi kan lägga på riktig realtime multiplayer senare utan att skriva om spelreglerna.
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:w-[360px]">
            <button
              onClick={() => setMode('cpu')}
              className={`flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition ${mode === 'cpu' ? 'bg-brand text-white shadow-lg shadow-brand/25' : 'bg-white/5 text-text-muted ring-1 ring-white/10 hover:text-white'}`}
            >
              <Cpu className="h-4 w-4" /> Solo mot CPU
            </button>
            <button
              onClick={() => setMode('versus')}
              className={`flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition ${mode === 'versus' ? 'bg-brand text-white shadow-lg shadow-brand/25' : 'bg-white/5 text-text-muted ring-1 ring-white/10 hover:text-white'}`}
            >
              <Swords className="h-4 w-4" /> 2 spelare lokalt
            </button>
            <button
              onClick={() => {
                const nextState = startPongMatch(mode, cpuLevel);
                previousStateRef.current = nextState;
                setTrail([]);
                trailSampleAtRef.current = 0;
                pushState(nextState);
              }}
              className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-500/90 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-500/20 transition hover:brightness-110"
            >
              <Play className="h-4 w-4" /> Starta match
            </button>
            <button
              onClick={() => {
                const nextState = createInitialPongState(mode, cpuLevel);
                previousStateRef.current = nextState;
                setTrail([]);
                trailSampleAtRef.current = 0;
                pushState(nextState);
              }}
              className="flex items-center justify-center gap-2 rounded-2xl bg-white/5 px-4 py-3 text-sm font-semibold text-text-muted ring-1 ring-white/10 transition hover:text-white"
            >
              <RotateCcw className="h-4 w-4" /> Nollställ
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_260px]">
          <div className="rounded-[28px] border border-cyan-400/15 bg-[#07111f] p-3 shadow-inner shadow-cyan-500/5">
            <div className="relative aspect-[16/9] overflow-hidden rounded-[22px] border border-white/8 bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.08),transparent_32%),linear-gradient(180deg,#08101b_0%,#0a1424_100%)]">
              <motion.div
                className="absolute rounded-full bg-white/10 blur-[80px]"
                animate={{ opacity: state.status === 'playing' ? [0.2, 0.4, 0.2] : 0.12, scale: state.status === 'playing' ? [0.9, 1.08, 0.95] : 0.9 }}
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
                  <p className="text-[11px] uppercase tracking-[0.28em] text-cyan-300/80">Vänster</p>
                  <p className={`mt-1 text-5xl font-extrabold ${leftScoring ? 'text-cyan-300 drop-shadow-[0_0_18px_rgba(34,211,238,0.55)]' : 'text-white'}`}>{state.score.left}</p>
                </motion.div>
                <motion.div
                  key={`right-score-${scoreFlashTick}-${rightScoring}`}
                  animate={rightScoring ? { scale: [1, 1.22, 1], y: [0, -8, 0] } : { scale: 1, y: 0 }}
                  transition={{ duration: 0.35 }}
                >
                  <p className="text-[11px] uppercase tracking-[0.28em] text-fuchsia-300/80">Höger</p>
                  <p className={`mt-1 text-5xl font-extrabold ${rightScoring ? 'text-fuchsia-300 drop-shadow-[0_0_18px_rgba(232,121,249,0.55)]' : 'text-white'}`}>{state.score.right}</p>
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

              <motion.div
                className="absolute rounded-full bg-white shadow-[0_0_28px_rgba(255,255,255,0.4)]"
                animate={state.status === 'playing' ? { scale: [1, 1.06, 1], boxShadow: ['0 0 20px rgba(255,255,255,0.35)', '0 0 34px rgba(255,255,255,0.55)', '0 0 20px rgba(255,255,255,0.35)'] } : { scale: 1 }}
                transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut' }}
                style={ballStyle}
              />

              {state.status === 'serving' && (
                <motion.div
                  className={`absolute bottom-5 ${state.serveTo === 'left' ? 'left-8' : 'right-8'} rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.22em] ring-1 ring-white/10 ${state.serveTo === 'left' ? 'bg-cyan-300/12 text-cyan-200' : 'bg-fuchsia-300/12 text-fuchsia-200'}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: [0.5, 1, 0.5], y: 0 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
                >
                  Serve {state.serveTo === 'left' ? 'vänster' : 'höger'}
                </motion.div>
              )}

              {state.status !== 'playing' && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-950/35 backdrop-blur-[2px]">
                  <motion.div
                    className="rounded-[26px] border border-white/10 bg-slate-950/80 px-6 py-5 text-center shadow-2xl"
                    initial={{ scale: 0.96, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                  >
                    <p className={`text-xs font-semibold uppercase tracking-[0.28em] ${state.status === 'finished' ? sideAccent(state.winner) : 'text-brand-light'}`}>
                      {state.status === 'ready' ? 'Redo' : state.status === 'serving' ? 'Serve' : 'Match slut'}
                    </p>
                    <p className="mt-2 text-2xl font-extrabold text-white">
                      {state.status === 'ready'
                        ? 'Tryck starta match'
                        : state.status === 'serving'
                          ? `Bollen går om ${Math.ceil(state.serveTimerMs / 1000)}`
                          : winnerLabel(state.winner)}
                    </p>
                    <p className="mt-2 text-sm text-text-muted">
                      {state.status === 'finished'
                        ? 'Redo för nästa iteration: samma kärna kan senare matas med nätverksinputs i stället för tangentbord.'
                        : 'Spelet körs redan på samma tick-modell som en framtida realtime-match.'}
                    </p>
                    <button
                      onClick={() => {
                        const nextState = startPongMatch(mode, cpuLevel);
                        previousStateRef.current = nextState;
                        setTrail([]);
                        trailSampleAtRef.current = 0;
                        pushState(nextState);
                      }}
                      className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2 text-sm font-bold text-slate-900 transition hover:brightness-105"
                    >
                      <Play className="h-4 w-4" /> {state.status === 'finished' ? 'Spela igen' : 'Starta nu'}
                    </button>
                  </motion.div>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-[24px] bg-white/5 p-4 ring-1 ring-white/10">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-light">Status</p>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl bg-black/20 px-3 py-3">
                  <p className="text-xs text-text-muted">Läge</p>
                  <p className="mt-1 font-bold text-white">{mode === 'cpu' ? 'CPU duel' : 'Local versus'}</p>
                </div>
                <div className="rounded-2xl bg-black/20 px-3 py-3">
                  <p className="text-xs text-text-muted">CPU-nivå</p>
                  <p className="mt-1 font-bold text-white">{mode === 'cpu' ? (cpuLevel === 'easy' ? 'Lätt' : cpuLevel === 'medium' ? 'Medel' : 'Svår') : 'Av'}</p>
                </div>
                <div className="rounded-2xl bg-black/20 px-3 py-3">
                  <p className="text-xs text-text-muted">Status</p>
                  <p className="mt-1 font-bold text-white">{state.status}</p>
                </div>
                <div className="rounded-2xl bg-black/20 px-3 py-3">
                  <p className="text-xs text-text-muted">Bästa rally</p>
                  <p className="mt-1 font-bold text-white">{state.bestRally}</p>
                </div>
                <div className="rounded-2xl bg-black/20 px-3 py-3 col-span-2">
                  <p className="text-xs text-text-muted">Matchtid</p>
                  <p className="mt-1 font-bold text-white">{formatSeconds(state.elapsedMs)}</p>
                </div>
              </div>
            </div>

            {mode === 'cpu' && (
              <div className="rounded-[24px] bg-white/5 p-4 ring-1 ring-white/10">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-light">CPU-nivå</p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {(['easy', 'medium', 'hard'] as const).map((level) => (
                    <button
                      key={level}
                      onClick={() => setCpuLevel(level)}
                      className={`rounded-2xl px-3 py-3 text-sm font-semibold transition ${cpuLevel === level ? 'bg-brand text-white shadow-lg shadow-brand/25' : 'bg-black/20 text-text-muted ring-1 ring-white/10 hover:text-white'}`}
                    >
                      {level === 'easy' ? 'Lätt' : level === 'medium' ? 'Medel' : 'Svår'}
                    </button>
                  ))}
                </div>
                <p className="mt-3 text-xs text-text-muted">
                  Botten använder fart {cpuPreset.paddleSpeed}, deadzone {cpuPreset.deadzone} och felmarginal {cpuPreset.trackingError}.
                </p>
              </div>
            )}

            <div className="rounded-[24px] bg-white/5 p-4 ring-1 ring-white/10">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-light">Kontroller</p>
              <div className="mt-3 space-y-3 text-sm text-text-muted">
                <div className="rounded-2xl bg-black/20 px-3 py-3">
                  <p className="font-semibold text-white">Vänster paddel</p>
                  <p className="mt-1">W upp, S ner</p>
                </div>
                <div className="rounded-2xl bg-black/20 px-3 py-3">
                  <p className="font-semibold text-white">Höger paddel</p>
                  <p className="mt-1">Piltangenter i versus-läge, AI i solo-läge</p>
                </div>
                <div className="rounded-2xl bg-black/20 px-3 py-3">
                  <p className="flex items-center gap-2 font-semibold text-white"><TimerReset className="h-4 w-4 text-brand-light" /> Nästa arkitektursteg</p>
                  <p className="mt-1">Byt tangentbordsinputs mot nätverksinputs per tick och lägg på snapshot/reconnect ovanpå samma engine.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}