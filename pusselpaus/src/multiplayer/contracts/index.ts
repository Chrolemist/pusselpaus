export type {
  PlatformContractContext,
  PlatformGameKind,
  PlatformGameLifecycle,
  PlatformInputBase,
  PlatformMatchOutcome,
  PlatformPlayerSlot,
  PlatformRankMode,
  PlatformResultBase,
  PlatformStateBase,
} from './shared';

export type {
  TurnBasedGameContract,
  TurnBasedMoveEnvelope,
  TurnBasedStateEnvelope,
  TurnBasedTransport,
  TurnBasedValidationResult,
} from './turnBased';

export type {
  RealtimeFrameContext,
  RealtimeGameContract,
  RealtimeInputApplyContext,
  RealtimeTransportContract,
} from './realtime';