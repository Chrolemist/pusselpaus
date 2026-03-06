/* ── DevMatchTest – test page for multiplayer match-found flow ──
 *
 *  Route: /dev/match-test
 *
 *  Lets you visually test:
 *   1. MatchFoundOverlay appearance & animations
 *   2. Simulated opponent accepting after delay
 *   3. Countdown → game-start flow
 *   4. Decline / timeout scenarios
 *   5. Various player counts (2–5)
 *   6. Friend-invite overlay (noTimeout, pre-accepted)
 *   7. Level-up overlay
 *
 *  No real Supabase calls — everything is mocked locally.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import MatchFoundOverlay from '../multiplayer/MatchFoundOverlay';
import type { MatchPlayer } from '../multiplayer/MatchFoundOverlay';
import { LEVEL_UP_EVENT } from '../hooks/useCoinRewards';
import { levelUpCoinBonus } from '../core/xp';

/* ── Fake player data ── */

const FAKE_PLAYERS: Omit<MatchPlayer, 'accepted'>[] = [
  { id: 'me',        username: 'Du',       tag: '1337', skin: '🦊', level: 14 },
  { id: 'opponent1', username: 'PixelBot',  tag: '0042', skin: '🤖', level: 8 },
  { id: 'opponent2', username: 'StarLight', tag: '7777', skin: '⭐', level: 22 },
  { id: 'opponent3', username: 'NightOwl',  tag: '2222', skin: '🦉', level: 5 },
  { id: 'opponent4', username: 'CoolCat',   tag: '9999', skin: '😎', level: 31 },
];

/* ── Scenario definitions ── */

type Scenario = 'accept' | 'decline' | 'timeout' | 'slow-accept';

const MATCHMAKING_SCENARIOS: { key: Scenario; label: string; desc: string }[] = [
  { key: 'accept',      label: '✓ Snabb accept',     desc: 'Alla accepterar inom 3 sek' },
  { key: 'slow-accept', label: '⏳ Långsam accept',   desc: 'Motståndare accepterar efter 8 sek' },
  { key: 'decline',     label: '✕ Motståndare nekar', desc: 'Motståndare nekar efter 4 sek' },
  { key: 'timeout',     label: '⏰ Timeout',          desc: 'Ingen accepterar — klockan rinner ut' },
];

const INVITE_SCENARIOS: { key: Scenario; label: string; desc: string }[] = [
  { key: 'accept',      label: '✓ Snabb accept',     desc: 'Alla accepterar inom 3 sek' },
  { key: 'slow-accept', label: '⏳ Långsam accept',   desc: 'Vänner accepterar efter 8 sek' },
  { key: 'decline',     label: '✕ Vän lämnar',        desc: 'Du klickar Lämna efter 4 sek' },
];

/* ── Component ── */

export default function DevMatchTestPage() {
  const [playerCount, setPlayerCount] = useState(2);
  const [scenario, setScenario] = useState<Scenario>('accept');
  const [inviteMode, setInviteMode] = useState(false);
  const [realtimeStorm, setRealtimeStorm] = useState(false);
  const [stormTick, setStormTick] = useState(0);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [players, setPlayers] = useState<MatchPlayer[]>([]);
  const [phase, setPhase] = useState<'idle' | 'overlay' | 'countdown' | 'playing' | 'declined'>('idle');
  const [countdownValue, setCountdownValue] = useState(5);
  const [log, setLog] = useState<string[]>([]);
  const simulationTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const addLog = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString('sv-SE');
    setLog((prev) => [`[${ts}] ${msg}`, ...prev].slice(0, 30));
  }, []);

  /* ── Clean up timers on unmount ── */
  useEffect(() => {
    return () => {
      simulationTimers.current.forEach(clearTimeout);
    };
  }, []);

  /* ── Build initial player list ── */
  const buildPlayers = useCallback((): MatchPlayer[] => {
    return FAKE_PLAYERS.slice(0, playerCount).map((p) => ({
      ...p,
      // In invite mode, "me" has already accepted via MatchInboxPanel
      accepted: inviteMode && p.id === 'me',
    }));
  }, [playerCount, inviteMode]);

  /* ── Local stress: simulate frequent realtime rerenders ── */
  useEffect(() => {
    if (!realtimeStorm) return;
    if (phase !== 'overlay' && phase !== 'countdown') return;

    const interval = setInterval(() => {
      setStormTick((v) => v + 1);
    }, 250);

    return () => clearInterval(interval);
  }, [realtimeStorm, phase]);

  /* ── Start a simulation ── */
  const startSimulation = useCallback(() => {
    // Clear previous timers
    simulationTimers.current.forEach(clearTimeout);
    simulationTimers.current = [];

    const initial = buildPlayers();
    setPlayers(initial);
    setPhase('overlay');
    setOverlayVisible(true);
    setLog([]);
    setStormTick(0);
    addLog(`Scenario: ${scenario}, ${playerCount} spelare${inviteMode ? ' (väninbjudan)' : ''}`);
    addLog(inviteMode ? 'Inbjudan accepterad! Overlay visas.' : 'Match hittad! Overlay visas.');
  }, [buildPlayers, scenario, playerCount, inviteMode, addLog]);

  /* ── Quick preset: 2-player strict matchmaking test ── */
  const applyTwoPlayerPreset = useCallback(() => {
    setInviteMode(false);
    setPlayerCount(2);
    setScenario('slow-accept');
    addLog('Preset aktiv: 2 spelare matchmaking (host + klient)');
  }, [addLog]);

  /* ── Simulate opponent behavior based on scenario ── */
  useEffect(() => {
    if (phase !== 'overlay') return;

    const opponentIds = players
      .filter((p) => p.id !== 'me')
      .map((p) => p.id);

    if (scenario === 'accept') {
      // Opponents accept one by one with 1–3s delay
      opponentIds.forEach((id, i) => {
        const timer = setTimeout(() => {
          setPlayers((prev) =>
            prev.map((p) => (p.id === id ? { ...p, accepted: true } : p)),
          );
          addLog(`${FAKE_PLAYERS.find((f) => f.id === id)?.username} accepterade`);
        }, 1500 + i * 1200);
        simulationTimers.current.push(timer);
      });
    }

    if (scenario === 'slow-accept') {
      opponentIds.forEach((id, i) => {
        const timer = setTimeout(() => {
          setPlayers((prev) =>
            prev.map((p) => (p.id === id ? { ...p, accepted: true } : p)),
          );
          addLog(`${FAKE_PLAYERS.find((f) => f.id === id)?.username} accepterade (sent)`);
        }, 5000 + i * 2000);
        simulationTimers.current.push(timer);
      });
    }

    if (scenario === 'decline') {
      // First opponent declines after 4s
      if (opponentIds[0]) {
        const timer = setTimeout(() => {
          addLog(`${FAKE_PLAYERS.find((f) => f.id === opponentIds[0])?.username} nekade!`);
          setOverlayVisible(false);
          setPhase('declined');
        }, 4000);
        simulationTimers.current.push(timer);
      }
    }

    // 'timeout' scenario — nobody does anything, timer runs out naturally
    if (scenario === 'timeout') {
      const timer = setTimeout(() => addLog('Väntar… ingen accepterar.'), 0);
      simulationTimers.current.push(timer);
    }

    return () => {
      simulationTimers.current.forEach(clearTimeout);
      simulationTimers.current = [];
    };
  }, [phase, scenario, players, addLog]);

  /* ── Check: all accepted → start countdown ── */
  useEffect(() => {
    if (phase !== 'overlay') return;
    const allAccepted = players.length > 0 && players.every((p) => p.accepted);
    if (allAccepted) {
      const timer = setTimeout(() => {
        addLog('Alla accepterade! Startar countdown…');
        setOverlayVisible(false);
        setPhase('countdown');
      }, 1500);
      simulationTimers.current.push(timer);
    }
  }, [phase, players, addLog]);

  /* ── Countdown timer ── */
  useEffect(() => {
    if (phase !== 'countdown') return;

    let count = 5;

    const interval = setInterval(() => {
      count -= 1;
      setCountdownValue(count);
      if (count <= 0) {
        clearInterval(interval);
        addLog('KÖR! Spelet startar.');
        setPhase('playing');
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [phase, addLog]);

  /* ── Accept handler ── */
  const handleAccept = useCallback(() => {
    addLog('Du accepterade!');
    setPlayers((prev) =>
      prev.map((p) => (p.id === 'me' ? { ...p, accepted: true } : p)),
    );
  }, [addLog]);

  /* ── Decline handler ── */
  const handleDecline = useCallback(() => {
    addLog('Match nekad / timeout.');
    setOverlayVisible(false);
    setPhase('declined');
    simulationTimers.current.forEach(clearTimeout);
    simulationTimers.current = [];
  }, [addLog]);

  const forceOpponentAcceptNow = useCallback(() => {
    const opponent = players.find((p) => p.id !== 'me');
    if (!opponent) return;
    setPlayers((prev) =>
      prev.map((p) => (p.id === opponent.id ? { ...p, accepted: true } : p)),
    );
    addLog(`${opponent.username} accepterade manuellt (dev)`);
  }, [players, addLog]);

  const forceOpponentDeclineNow = useCallback(() => {
    const opponent = players.find((p) => p.id !== 'me');
    if (!opponent) return;
    addLog(`${opponent.username} nekade manuellt (dev)`);
    setOverlayVisible(false);
    setPhase('declined');
    simulationTimers.current.forEach(clearTimeout);
    simulationTimers.current = [];
  }, [players, addLog]);

  /* ── Reset ── */
  const handleReset = useCallback(() => {
    simulationTimers.current.forEach(clearTimeout);
    simulationTimers.current = [];
    setOverlayVisible(false);
    setPhase('idle');
    setPlayers([]);
    setLog([]);
  }, []);

  /* ── Level-up simulation ── */
  const [simLevel, setSimLevel] = useState(5);

  const fireLevelUp = useCallback((oldLv: number, newLv: number) => {
    window.dispatchEvent(
      new CustomEvent(LEVEL_UP_EVENT, { detail: { oldLevel: oldLv, newLevel: newLv } }),
    );
    addLog(`Level up! ${oldLv} → ${newLv} (bonus: ${levelUpCoinBonus(newLv)} coins)`);
  }, [addLog]);

  return (
    <div className="min-h-dvh bg-surface px-4 py-6">
      <div className="mx-auto max-w-lg">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <Link to="/" className="text-sm text-text-muted hover:text-brand-light">
            ← Tillbaka
          </Link>
          <span className="rounded-md bg-red-500/20 px-2 py-0.5 text-xs font-bold text-red-300">
            DEV
          </span>
        </div>

        <h1 className="mb-1 text-2xl font-bold">🧪 Dev Test</h1>
        <p className="mb-6 text-sm text-text-muted">
          Simulera multiplayer + level-up utan riktig backend
        </p>

        {/* ═══════════════ Level-Up Test Section ═══════════════ */}
        {phase === 'idle' && (
          <div className="mb-8 rounded-2xl bg-surface-card p-5 ring-1 ring-white/10">
            <h2 className="mb-3 text-lg font-bold">⭐ Level Up</h2>
            <p className="mb-4 text-xs text-text-muted">
              Skickar ett fejkat level-up event. Overlaykomponenten (monterad i App) reagerar.
            </p>

            {/* Level picker */}
            <div className="mb-4">
              <label className="mb-1 block text-xs font-bold uppercase text-text-muted">
                Ny level
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={2}
                  max={100}
                  value={simLevel}
                  onChange={(e) => setSimLevel(Number(e.target.value))}
                  className="flex-1 accent-brand"
                />
                <span className="w-10 text-right text-lg font-bold text-yellow-300">{simLevel}</span>
              </div>
              <p className="mt-1 text-[11px] text-text-muted">
                Bonus: {levelUpCoinBonus(simLevel)} coins
                {simLevel % 10 === 0 ? ' (milstolpe!)' : simLevel % 5 === 0 ? ' (x5 bonus)' : ''}
              </p>
            </div>

            {/* Fire button */}
            <button
              onClick={() => fireLevelUp(simLevel - 1, simLevel)}
              className="w-full rounded-xl bg-yellow-500/20 px-6 py-3 text-sm font-bold text-yellow-200 ring-1 ring-yellow-400/30 transition hover:bg-yellow-500/30 active:scale-[0.97]"
            >
              ⭐ Simulera Level Up → {simLevel}
            </button>

            {/* Quick presets */}
            <div className="mt-3 flex flex-wrap gap-2">
              {[2, 5, 10, 25, 50, 100].map((lv) => (
                <button
                  key={lv}
                  onClick={() => fireLevelUp(lv - 1, lv)}
                  className="rounded-lg bg-white/5 px-3 py-1.5 text-xs font-semibold text-text-muted ring-1 ring-white/10 transition hover:ring-yellow-400/40 hover:text-yellow-200"
                >
                  Lv {lv}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ═══════════════ Match Test Section ═══════════════ */}

        {/* Controls */}
        {phase === 'idle' && (
          <div className="space-y-5">
            <h2 className="text-lg font-bold">🎮 Match Found</h2>

            <div className="rounded-xl bg-surface-card p-3 ring-1 ring-white/10">
              <p className="text-xs text-text-muted">
                Rekommenderat testflöde: 2 spelare (host + klient), båda accepterar, countdown,
                start. Använd preset + realtime-storm för att hitta loopar utan deploy.
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={applyTwoPlayerPreset}
                  className="rounded-lg bg-brand/15 px-3 py-2 text-xs font-semibold text-brand-light ring-1 ring-brand/40"
                >
                  Preset: 2 spelare matchmaking
                </button>
                <button
                  onClick={() => {
                    const next = !realtimeStorm;
                    setRealtimeStorm(next);
                    addLog(
                      next
                        ? 'Realtime-storm aktiv (simulerar täta live-uppdateringar)'
                        : 'Realtime-storm avstängd',
                    );
                  }}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold ring-1 transition ${
                    realtimeStorm
                      ? 'bg-amber-500/20 text-amber-300 ring-amber-500/40'
                      : 'bg-surface-card text-text-muted ring-white/10 hover:ring-amber-500/40'
                  }`}
                >
                  {realtimeStorm ? 'Realtime-storm: PÅ' : 'Realtime-storm: AV'}
                </button>
              </div>
            </div>

            {/* Mode toggle: Matchmaking vs Friend invite */}
            <div>
              <label className="mb-2 block text-xs font-bold uppercase text-text-muted">
                Läge
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => { setInviteMode(false); setScenario('accept'); }}
                  className={`flex-1 rounded-xl px-4 py-3 text-sm font-semibold transition ${
                    !inviteMode
                      ? 'bg-brand/15 text-brand-light ring-1 ring-brand/40'
                      : 'bg-surface-card text-text-muted ring-1 ring-white/10 hover:ring-brand/30'
                  }`}
                >
                  🔍 Matchmaking
                  <span className="mt-0.5 block text-[10px] opacity-70">Random kö · nedräkning</span>
                </button>
                <button
                  onClick={() => { setInviteMode(true); setScenario('accept'); }}
                  className={`flex-1 rounded-xl px-4 py-3 text-sm font-semibold transition ${
                    inviteMode
                      ? 'bg-green-500/15 text-green-300 ring-1 ring-green-500/40'
                      : 'bg-surface-card text-text-muted ring-1 ring-white/10 hover:ring-green-500/30'
                  }`}
                >
                  👥 Väninbjudan
                  <span className="mt-0.5 block text-[10px] opacity-70">Redan accepterad · ingen timer</span>
                </button>
              </div>
            </div>

            {/* Player count */}
            <div>
              <label className="mb-2 block text-xs font-bold uppercase text-text-muted">
                Antal spelare
              </label>
              <div className="flex gap-2">
                {[2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setPlayerCount(n)}
                    className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                      playerCount === n
                        ? 'bg-brand text-white shadow'
                        : 'bg-surface-card text-text-muted ring-1 ring-white/10 hover:ring-brand/40'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* Scenario picker */}
            <div>
              <label className="mb-2 block text-xs font-bold uppercase text-text-muted">
                Scenario
              </label>
              <div className="space-y-2">
                {(inviteMode ? INVITE_SCENARIOS : MATCHMAKING_SCENARIOS).map((s) => (
                  <button
                    key={s.key}
                    onClick={() => setScenario(s.key)}
                    className={`flex w-full items-center justify-between rounded-xl px-4 py-3 text-left text-sm transition ${
                      scenario === s.key
                        ? 'bg-brand/15 text-brand-light ring-1 ring-brand/40'
                        : 'bg-surface-card text-text-muted ring-1 ring-white/10 hover:ring-brand/30'
                    }`}
                  >
                    <span className="font-semibold">{s.label}</span>
                    <span className="text-xs opacity-70">{s.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Preview players */}
            <div>
              <label className="mb-2 block text-xs font-bold uppercase text-text-muted">
                Spelare i matchen
              </label>
              <div className="flex gap-2">
                {FAKE_PLAYERS.slice(0, playerCount).map((p) => (
                  <div
                    key={p.id}
                    className="flex flex-col items-center gap-1 rounded-lg bg-surface-card px-3 py-2 ring-1 ring-white/10"
                  >
                    <span className="text-xl">{p.skin}</span>
                    <span className="text-[11px] font-semibold">{p.username}</span>
                    <span className="rounded bg-brand/20 px-1 text-[10px] text-brand-light">
                      Lv {p.level}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Start button */}
            <button
              onClick={startSimulation}
              className="w-full rounded-2xl bg-brand px-8 py-4 text-lg font-bold text-white shadow-xl transition active:scale-[0.97] hover:bg-brand-light"
            >
              🚀 Starta simulering
            </button>
          </div>
        )}

        {/* Countdown phase */}
        <AnimatePresence>
          {phase === 'countdown' && (
            <motion.div
              className="flex flex-col items-center gap-4 py-20"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <p className="text-sm uppercase tracking-widest text-text-muted">
                Matchen börjar om
              </p>
              <motion.p
                key={countdownValue}
                className="text-8xl font-extrabold text-brand-light"
                initial={{ scale: 2, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.35 }}
              >
                {countdownValue > 0 ? countdownValue : 'KÖR!'}
              </motion.p>
              <p className="text-xs text-text-muted">Alla spelare startar samtidigt</p>
              <div className="mt-4 flex gap-3">
                {players.map((p) => (
                  <div key={p.id} className="flex flex-col items-center gap-1">
                    <span className="text-2xl">{p.skin}</span>
                    <span className="text-[11px] text-text-muted">{p.username}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Playing state */}
        {phase === 'playing' && (
          <div className="flex flex-col items-center gap-4 py-20">
            <p className="text-5xl">🎮</p>
            <p className="text-lg font-bold text-success">Spelet pågår!</p>
            <p className="text-sm text-text-muted">
              Här skulle det riktiga spelet renderas.
            </p>
            <div className="mt-2 flex gap-3">
              {players.map((p) => (
                <div key={p.id} className="flex flex-col items-center gap-1">
                  <span className="text-2xl">{p.skin}</span>
                  <span className="text-[11px] text-text-muted">{p.username}</span>
                </div>
              ))}
            </div>
            <button
              onClick={handleReset}
              className="mt-6 rounded-xl bg-surface-card px-6 py-3 text-sm font-semibold text-text-muted ring-1 ring-white/10 transition hover:ring-brand/40"
            >
              ← Tillbaka till testmenyn
            </button>
          </div>
        )}

        {/* Declined state */}
        {phase === 'declined' && (
          <div className="flex flex-col items-center gap-4 py-20">
            <p className="text-5xl">😔</p>
            <p className="text-lg font-bold text-red-300">Match avbruten</p>
            <p className="text-sm text-text-muted">
              Matchen nekades eller tiden rann ut.
            </p>
            <button
              onClick={handleReset}
              className="mt-6 rounded-xl bg-surface-card px-6 py-3 text-sm font-semibold text-text-muted ring-1 ring-white/10 transition hover:ring-brand/40"
            >
              ← Testa igen
            </button>
          </div>
        )}

        {/* Event log */}
        {log.length > 0 && (
          <div className="mt-8">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase text-text-muted">Event Log</h3>
              {phase !== 'idle' && (
                <button
                  onClick={handleReset}
                  className="text-xs text-text-muted underline hover:text-brand-light"
                >
                  Återställ
                </button>
              )}
            </div>

            {(phase === 'overlay' || phase === 'countdown') && players.length === 2 && (
              <div className="mb-2 flex gap-2">
                <button
                  onClick={forceOpponentAcceptNow}
                  className="rounded-lg bg-green-500/15 px-3 py-1.5 text-xs font-semibold text-green-300 ring-1 ring-green-500/30"
                >
                  Simulera spelare B accepterar
                </button>
                <button
                  onClick={forceOpponentDeclineNow}
                  className="rounded-lg bg-red-500/15 px-3 py-1.5 text-xs font-semibold text-red-300 ring-1 ring-red-500/30"
                >
                  Simulera spelare B nekar
                </button>
                {realtimeStorm && (
                  <span className="self-center text-[11px] text-amber-300">stormTick: {stormTick}</span>
                )}
              </div>
            )}

            <div className="max-h-48 overflow-y-auto rounded-xl bg-black/30 p-3 font-mono text-[11px] leading-relaxed text-text-muted ring-1 ring-white/5">
              {log.map((entry, i) => (
                <div key={i} className={i === 0 ? 'text-brand-light' : ''}>
                  {entry}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* The actual overlay — renders as a portal-like fixed layer */}
      <MatchFoundOverlay
        visible={overlayVisible}
        players={players}
        timeLimit={15}
        myId="me"
        onAccept={handleAccept}
        onDecline={handleDecline}
        noTimeout={inviteMode}
      />
    </div>
  );
}
