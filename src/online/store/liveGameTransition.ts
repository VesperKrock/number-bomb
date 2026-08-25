import type {
  FinishReason,
  GameOutcome,
  GamePhase,
  OnlineGameState,
  PendingOrigin,
} from '../types'

export type LiveGamePresentationKind = 'LOCK' | 'SAFE' | 'BOOM'

export interface LiveGameTransition {
  gameId: string
  roomId: string
  version: number
  phase: GamePhase
  kind: LiveGamePresentationKind
  lockedNumber: number | null
  outcome: GameOutcome | null
  loserPlayerId: string | null
  updatedAt: string
}

const GAME_PHASES = new Set<GamePhase>(['PLAYING_TURN', 'RESOLVING', 'FINISHED'])
const GAME_OUTCOMES = new Set<GameOutcome>(['SAFE', 'BOOM', 'TIMEOUT_LOSS'])
const PENDING_ORIGINS = new Set<PendingOrigin>([
  'PLAYER_LOCK',
  'TIMEOUT_RANDOM',
  'TIMEOUT_SELF_DESTRUCT',
  'TIMEOUT_STRIKES_EXCEEDED',
])
const FINISH_REASONS = new Set<FinishReason>([
  'BOMB_HIT',
  'TIMEOUT_SELF_DESTRUCT',
  'TIMEOUT_STRIKES_EXCEEDED',
])
const MAX_LIVE_TRANSITIONS = 64

export function parseLiveGameTransition(
  row: Record<string, unknown>,
): LiveGameTransition | null {
  const gameId = row.id
  const roomId = row.room_id
  const version = row.version
  const phase = row.phase
  if (typeof gameId !== 'string'
    || typeof roomId !== 'string'
    || typeof version !== 'number'
    || !GAME_PHASES.has(phase as GamePhase)
  ) return null

  const outcome = row.last_outcome === null || row.last_outcome === undefined
    ? null
    : GAME_OUTCOMES.has(row.last_outcome as GameOutcome)
      ? row.last_outcome as GameOutcome
      : null
  const pendingLockedNumber = typeof row.pending_locked_number === 'number'
    ? row.pending_locked_number
    : null
  const lastLockedNumber = typeof row.last_locked_number === 'number'
    ? row.last_locked_number
    : null
  const updatedAt = typeof row.updated_at === 'string' ? row.updated_at : null
  if (!updatedAt) return null

  if (phase === 'RESOLVING') {
    return {
      gameId,
      roomId,
      version,
      phase,
      kind: 'LOCK',
      lockedNumber: pendingLockedNumber,
      outcome: null,
      loserPlayerId: null,
      updatedAt,
    }
  }
  if (phase === 'PLAYING_TURN' && outcome === 'SAFE') {
    return {
      gameId,
      roomId,
      version,
      phase,
      kind: 'SAFE',
      lockedNumber: lastLockedNumber,
      outcome,
      loserPlayerId: null,
      updatedAt,
    }
  }
  if (phase === 'FINISHED' && outcome !== null) {
    return {
      gameId,
      roomId,
      version,
      phase,
      kind: 'BOOM',
      lockedNumber: lastLockedNumber,
      outcome,
      loserPlayerId: typeof row.loser_player_id === 'string' ? row.loser_player_id : null,
      updatedAt,
    }
  }
  return null
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' ? value : null
}

export function parseRealtimeGameState(
  row: Record<string, unknown>,
): OnlineGameState | null {
  const id = row.id
  const roomId = row.room_id
  const phase = row.phase
  const version = row.version
  if (typeof id !== 'string'
    || typeof roomId !== 'string'
    || !GAME_PHASES.has(phase as GamePhase)
    || typeof version !== 'number'
    || typeof row.round_number !== 'number'
    || typeof row.lower_candidate !== 'number'
    || typeof row.upper_candidate !== 'number'
    || typeof row.current_player_id !== 'string'
    || typeof row.starting_player_id !== 'string'
    || typeof row.turn_number !== 'number'
    || typeof row.turn_started_at !== 'string'
    || typeof row.turn_deadline_at !== 'string'
    || typeof row.updated_at !== 'string'
  ) return null

  const pendingOrigin = PENDING_ORIGINS.has(row.pending_action_origin as PendingOrigin)
    ? row.pending_action_origin as PendingOrigin
    : null
  const pendingActor = nullableString(row.pending_actor_player_id)
  const resolutionAt = nullableString(row.resolution_at)
  const pending = phase === 'RESOLVING' && pendingOrigin && pendingActor && resolutionAt
    ? {
        lockedNumber: nullableNumber(row.pending_locked_number),
        actorPlayerId: pendingActor,
        origin: pendingOrigin,
        resolutionAt,
      }
    : null
  const lastOutcome = GAME_OUTCOMES.has(row.last_outcome as GameOutcome)
    ? row.last_outcome as GameOutcome
    : null
  const lastActionOrigin = PENDING_ORIGINS.has(row.last_action_origin as PendingOrigin)
    ? row.last_action_origin as PendingOrigin
    : null
  const finishReason = FINISH_REASONS.has(row.finish_reason as FinishReason)
    ? row.finish_reason as FinishReason
    : null

  return {
    id,
    roomId,
    roundNumber: row.round_number,
    phase: phase as GamePhase,
    lowerCandidate: row.lower_candidate,
    upperCandidate: row.upper_candidate,
    currentPlayerId: row.current_player_id,
    startingPlayerId: row.starting_player_id,
    turnNumber: row.turn_number,
    version,
    turnStartedAt: row.turn_started_at,
    turnDeadlineAt: row.turn_deadline_at,
    pending,
    lastLockedNumber: nullableNumber(row.last_locked_number),
    lastActorPlayerId: nullableString(row.last_actor_player_id),
    lastActionOrigin,
    lastOutcome,
    loserPlayerId: nullableString(row.loser_player_id),
    finishReason,
    revealedBombNumber: nullableNumber(row.revealed_bomb_number),
    updatedAt: row.updated_at,
    finishedAt: nullableString(row.finished_at),
  }
}

export function appendLiveGameTransition(
  current: readonly LiveGameTransition[],
  incoming: LiveGameTransition,
): readonly LiveGameTransition[] {
  if (current.some((transition) => transition.gameId === incoming.gameId
    && transition.version === incoming.version
    && transition.kind === incoming.kind
  )) return current
  const next = [...current, incoming]
  return next.length > MAX_LIVE_TRANSITIONS
    ? next.slice(next.length - MAX_LIVE_TRANSITIONS)
    : next
}
