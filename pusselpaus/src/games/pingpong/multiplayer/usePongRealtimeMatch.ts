import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../../auth';
import type { MultiplayerMatch, MultiplayerMatchPlayer } from '../../../lib/database.types';
import { supabase } from '../../../lib/supabaseClient';
import { createSupabaseBroadcastTransport } from '../../../multiplayer/realtime/supabaseBroadcastTransport';
import type { RealtimeConnectionState, RealtimeParticipant, RealtimeSnapshotEnvelope } from '../../../multiplayer';
import { activateFireBoost, createInitialPongState, stepPong } from '../core/engine';
import { PONG_CONFIG, type PongControlState, type PongInputs, type PongSide, type PongState } from '../core/types';
import { pongRealtimeAdapter } from './adapter';
import type { PongRealtimeConfig, PongRealtimeInput } from './types';

interface UsePongRealtimeMatchArgs {
  enabled: boolean;
  config?: Record<string, unknown>;
  localInput: PongControlState;
  matchId?: string | null;
  seed?: number;
}

interface UsePongRealtimeMatchResult {
  connectedPlayers: number;
  connection: RealtimeConnectionState;
  error: string | null;
  isHost: boolean;
  liveState: PongState | null;
  localSide: PongSide | null;
  ready: boolean;
  remoteConnected: boolean;
  requestBoost: () => void;
}

const EMPTY_CONNECTION: RealtimeConnectionState = {
  connected: false,
  reconnecting: false,
  latencyMs: null,
  lastMessageAt: null,
};

function sideForSeat(seat: number): PongSide {
  return seat === 0 ? 'left' : 'right';
}

function sortParticipants(players: Pick<MultiplayerMatchPlayer, 'user_id' | 'created_at'>[], hostId: string): RealtimeParticipant[] {
  return [...players]
    .sort((left, right) => {
      if (left.user_id === hostId) return -1;
      if (right.user_id === hostId) return 1;
      return left.created_at.localeCompare(right.created_at) || left.user_id.localeCompare(right.user_id);
    })
    .map((player, index) => ({
      userId: player.user_id,
      seat: index,
      isHost: player.user_id === hostId,
      connected: true,
    }));
}

export function usePongRealtimeMatch({ enabled, config, localInput, matchId, seed }: UsePongRealtimeMatchArgs): UsePongRealtimeMatchResult {
  const { user } = useAuth();
  const [connection, setConnection] = useState<RealtimeConnectionState>(EMPTY_CONNECTION);
  const [error, setError] = useState<string | null>(null);
  const [liveState, setLiveState] = useState<PongState | null>(null);
  const [participants, setParticipants] = useState<RealtimeParticipant[]>([]);
  const transportRef = useRef(createSupabaseBroadcastTransport<Record<string, unknown>, Record<string, unknown>>());
  const latestLocalInputRef = useRef<PongRealtimeInput>({ up: false, down: false, boostNonce: 0 });
  const remoteInputsRef = useRef(new Map<string, PongRealtimeInput>());
  const currentStateRef = useRef<PongState | null>(null);
  const tickRef = useRef(0);
  const lastSnapshotTickRef = useRef(0);
  const animationFrameRef = useRef<number | null>(null);
  const accumulatorRef = useRef(0);
  const lastFrameAtRef = useRef(0);
  const processedBoostNonceRef = useRef(new Map<string, number>());

  useEffect(() => {
    latestLocalInputRef.current = {
      ...latestLocalInputRef.current,
      up: localInput.up,
      down: localInput.down,
    };
  }, [localInput.down, localInput.up]);

  const localParticipant = useMemo(
    () => participants.find((participant) => participant.userId === user?.id) ?? null,
    [participants, user?.id],
  );

  const localSide = localParticipant ? sideForSeat(localParticipant.seat) : null;
  const isHost = localParticipant?.isHost === true;
  const connectedPlayers = participants.filter((participant) => participant.connected).length;
  const remoteConnected = connectedPlayers >= 2;

  useEffect(() => {
    if (!enabled || !matchId || !user?.id) {
      currentStateRef.current = null;
      remoteInputsRef.current.clear();
      processedBoostNonceRef.current.clear();
      return;
    }

    let cancelled = false;
    const transport = transportRef.current;

    const bootstrap = async () => {
      setError(null);
      setConnection((current) => ({ ...current, reconnecting: true }));

      const [{ data: matchRow, error: matchError }, { data: playerRows, error: playerError }] = await Promise.all([
        supabase
          .from('multiplayer_matches')
          .select('id, host_id, config, config_seed')
          .eq('id', matchId)
          .maybeSingle<Pick<MultiplayerMatch, 'id' | 'host_id' | 'config' | 'config_seed'>>(),
        supabase
          .from('multiplayer_match_players')
          .select('user_id, created_at, status')
          .eq('match_id', matchId)
          .in('status', ['accepted', 'matched'])
          .returns<Pick<MultiplayerMatchPlayer, 'user_id' | 'created_at' | 'status'>[]>(),
      ]);

      if (cancelled) return;

      if (matchError || playerError || !matchRow) {
        setError(matchError?.message ?? playerError?.message ?? 'Kunde inte starta live-matchen');
        setConnection(EMPTY_CONNECTION);
        return;
      }

      const nextParticipants = sortParticipants(playerRows ?? [], matchRow.host_id).slice(0, 2);
      setParticipants(nextParticipants);

      await transport.connect({ matchId, gameId: 'pingpong', userId: user.id });
      if (cancelled) {
        await transport.disconnect();
        return;
      }

      const mergedConfig = (matchRow.config ?? config ?? {}) as PongRealtimeConfig;
      const hostInitialState = pongRealtimeAdapter.createInitialState({
        config: mergedConfig,
        seed: matchRow.config_seed ?? seed,
        participants: nextParticipants,
      });

      if (nextParticipants[0]?.userId === user.id) {
        currentStateRef.current = hostInitialState;
        setLiveState(hostInitialState);
      } else {
        const idleState = createInitialPongState('versus', 'medium');
        currentStateRef.current = idleState;
        setLiveState(idleState);
      }

      setConnection(transport.getConnectionState?.() ?? EMPTY_CONNECTION);
    };

    const unsubscribers: Array<() => void> = [];

    unsubscribers.push(transport.onInput((envelope) => {
      if (!enabled) return;
      if (envelope.userId === user.id) return;
      remoteInputsRef.current.set(envelope.userId, pongRealtimeAdapter.deserializeInput(envelope.input));
      setConnection(transport.getConnectionState?.() ?? EMPTY_CONNECTION);
    }));

    unsubscribers.push(transport.onSnapshot((snapshot: RealtimeSnapshotEnvelope<Record<string, unknown>>) => {
      if (snapshot.authoritativeUserId === user?.id) return;
      const nextState = pongRealtimeAdapter.deserializeState(snapshot.state);
      currentStateRef.current = nextState;
      setLiveState(nextState);
      setConnection(transport.getConnectionState?.() ?? EMPTY_CONNECTION);
    }));

    if (transport.onPresence) {
      unsubscribers.push(transport.onPresence((presenceParticipants) => {
        setParticipants((current) => current.map((participant) => ({
          ...participant,
          connected: presenceParticipants.some((entry) => entry.userId === participant.userId),
        })));
        setConnection(transport.getConnectionState?.() ?? EMPTY_CONNECTION);
      }));
    }

    void bootstrap();

    return () => {
      cancelled = true;
      for (const unsubscribe of unsubscribers) {
        unsubscribe();
      }
      if (animationFrameRef.current != null) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
      animationFrameRef.current = null;
      accumulatorRef.current = 0;
      lastFrameAtRef.current = 0;
      void transport.disconnect();
    };
  }, [config, enabled, matchId, seed, user?.id]);

  useEffect(() => {
    if (!enabled || !matchId || !user?.id || !localParticipant) return;
    if (isHost) return;

    const transport = transportRef.current;
    const envelope = {
      matchId,
      userId: user.id,
      tick: tickRef.current,
      sentAt: Date.now(),
      input: pongRealtimeAdapter.serializeInput(latestLocalInputRef.current),
    };

    void transport.sendInput(envelope);
  }, [enabled, isHost, localInput.down, localInput.up, localParticipant, matchId, user?.id]);

  useEffect(() => {
    if (!enabled || !matchId || !user?.id || !isHost || !localParticipant) return;

    const transport = transportRef.current;
    const participantBySide = new Map<PongSide, RealtimeParticipant>();
    for (const participant of participants) {
      participantBySide.set(sideForSeat(participant.seat), participant);
    }

    const sendSnapshot = async (state: PongState) => {
      const envelope = {
        matchId,
        tick: tickRef.current,
        sentAt: Date.now(),
        authoritativeUserId: user.id,
        state: pongRealtimeAdapter.serializeState(state),
      };
      await transport.sendEvent?.({
        matchId,
        type: 'tick',
        sentAt: envelope.sentAt,
        payload: { tick: envelope.tick },
      });
      await (transport as typeof transport & { sendSnapshot?: (snapshot: typeof envelope) => Promise<void> }).sendSnapshot?.(envelope);
    };

    const loop = (now: number) => {
      if (lastFrameAtRef.current === 0) {
        lastFrameAtRef.current = now;
      }

      const delta = Math.min(32, now - lastFrameAtRef.current);
      lastFrameAtRef.current = now;
      accumulatorRef.current += delta;
      let nextState = currentStateRef.current ?? pongRealtimeAdapter.createInitialState({
        config: (config ?? {}) as PongRealtimeConfig,
        seed,
        participants,
      });
      const previousStatus = nextState.status;
      let changed = false;

      while (accumulatorRef.current >= PONG_CONFIG.fixedStepMs) {
        const leftParticipant = participantBySide.get('left');
        const rightParticipant = participantBySide.get('right');
        const leftUserId = leftParticipant?.userId ?? null;
        const rightUserId = rightParticipant?.userId ?? null;
        const leftInput = leftUserId === user.id ? latestLocalInputRef.current : (leftUserId ? remoteInputsRef.current.get(leftUserId) : undefined);
        const rightInput = rightUserId === user.id ? latestLocalInputRef.current : (rightUserId ? remoteInputsRef.current.get(rightUserId) : undefined);

        const inputs: PongInputs = {
          left: {
            up: leftInput?.up ?? false,
            down: leftInput?.down ?? false,
          },
          right: {
            up: rightInput?.up ?? false,
            down: rightInput?.down ?? false,
          },
        };

        for (const [side, participant] of participantBySide.entries()) {
          const latestInput = participant.userId === user.id ? latestLocalInputRef.current : (remoteInputsRef.current.get(participant.userId) ?? { up: false, down: false, boostNonce: 0 });
          const processedNonce = processedBoostNonceRef.current.get(participant.userId) ?? 0;
          if (latestInput.boostNonce > processedNonce) {
            nextState = activateFireBoost(nextState, side);
            processedBoostNonceRef.current.set(participant.userId, latestInput.boostNonce);
          }
        }

        nextState = stepPong(nextState, inputs, PONG_CONFIG.fixedStepMs);
        tickRef.current += 1;
        accumulatorRef.current -= PONG_CONFIG.fixedStepMs;
        changed = true;
      }

      if (changed) {
        currentStateRef.current = nextState;
        setLiveState(nextState);
        const shouldSendSnapshot = tickRef.current === 1 || tickRef.current - lastSnapshotTickRef.current >= 3 || nextState.status !== previousStatus;
        if (shouldSendSnapshot) {
          lastSnapshotTickRef.current = tickRef.current;
          void sendSnapshot(nextState);
        }
      }

      animationFrameRef.current = window.requestAnimationFrame(loop);
    };

    animationFrameRef.current = window.requestAnimationFrame(loop);
    return () => {
      if (animationFrameRef.current != null) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
      animationFrameRef.current = null;
      accumulatorRef.current = 0;
      lastFrameAtRef.current = 0;
    };
  }, [config, enabled, isHost, localParticipant, matchId, participants, seed, user?.id]);

  const requestBoost = () => {
    latestLocalInputRef.current = {
      ...latestLocalInputRef.current,
      boostNonce: latestLocalInputRef.current.boostNonce + 1,
    };

    if (!enabled || isHost || !matchId || !user?.id) return;

    void transportRef.current.sendInput({
      matchId,
      userId: user.id,
      tick: tickRef.current,
      sentAt: Date.now(),
      input: pongRealtimeAdapter.serializeInput(latestLocalInputRef.current),
    });
  };

  return {
    connectedPlayers,
    connection: enabled ? connection : EMPTY_CONNECTION,
    error: enabled ? error : null,
    isHost,
    liveState: enabled ? liveState : null,
    localSide: enabled ? localSide : null,
    ready: enabled && !!localParticipant,
    remoteConnected,
    requestBoost,
  };
}
