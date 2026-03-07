export type PlatformGameKind = 'turn-based' | 'realtime';

export type PlatformRankMode = 'time' | 'score' | 'rounds' | 'custom';

export type PlatformGameLifecycle =
  | 'staging'
  | 'ready'
  | 'countdown'
  | 'playing'
  | 'finished'
  | 'cancelled';

export type PlatformMatchOutcome =
  | 'pending'
  | 'win'
  | 'loss'
  | 'draw'
  | 'forfeit'
  | 'cancelled';

export interface PlatformPlayerSlot {
  participantId: string;
  seat: number;
  isHost: boolean;
}

export interface PlatformInputBase {
  kind?: string;
  actorId?: string;
  sequence?: number;
  sentAt?: number;
}

export interface PlatformStateBase<TLifecycle extends string = PlatformGameLifecycle> {
  lifecycle: TLifecycle;
  revision: number;
  startedAt: number | null;
  finishedAt: number | null;
  winnerParticipantId: string | null;
}

export interface PlatformResultBase<TMetrics extends Record<string, unknown> = Record<string, unknown>> {
  outcome: PlatformMatchOutcome;
  completed: boolean;
  rankBy: PlatformRankMode;
  winnerParticipantId: string | null;
  score: number | null;
  elapsedMs: number | null;
  metrics: TMetrics;
}

export interface PlatformContractContext<TConfig> {
  config: TConfig;
  players: PlatformPlayerSlot[];
  seed?: number;
}