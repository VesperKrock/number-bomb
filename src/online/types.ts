export type RoomStatus = 'LOBBY' | 'PLAYING' | 'FINISHED' | 'CLOSED'
export type MembershipStatus = 'ACTIVE' | 'LEFT' | 'KICKED'
export type ParticipationStatus = 'ACTIVE' | 'LEFT'
export type StarterMode = 'FIRST_SEAT' | 'RANDOM'
export type TimeoutPolicy =
  | 'SELF_DESTRUCT'
  | 'RANDOM_PICK'
  | 'RANDOM_PICK_WITH_2_STRIKES'
export type GamePhase = 'PLAYING_TURN' | 'RESOLVING' | 'FINISHED'
export type PendingOrigin =
  | 'PLAYER_LOCK'
  | 'TIMEOUT_RANDOM'
  | 'TIMEOUT_SELF_DESTRUCT'
  | 'TIMEOUT_STRIKES_EXCEEDED'
export type GameOutcome = 'SAFE' | 'BOOM' | 'TIMEOUT_LOSS'
export type FinishReason =
  | 'BOMB_HIT'
  | 'TIMEOUT_SELF_DESTRUCT'
  | 'TIMEOUT_STRIKES_EXCEEDED'

export type OnlineResultCode =
  | 'OK'
  | 'ALREADY_APPLIED'
  | 'ALREADY_JOINED'
  | 'ALREADY_RESOLVED'
  | 'UNAUTHENTICATED'
  | 'INVALID_NICKNAME'
  | 'INVALID_ROOM_CODE'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_EXPIRED'
  | 'ROOM_FULL'
  | 'ROOM_ALREADY_PLAYING'
  | 'NICKNAME_TAKEN'
  | 'ROOM_CODE_EXHAUSTED'
  | 'KICKED'
  | 'NOT_ROOM_MEMBER'
  | 'NOT_HOST'
  | 'INVALID_SETTINGS'
  | 'NOT_ENOUGH_PLAYERS'
  | 'STALE_ROOM_VERSION'
  | 'GAME_NOT_FOUND'
  | 'STALE_GAME_VERSION'
  | 'NOT_YOUR_TURN'
  | 'INVALID_CANDIDATE'
  | 'DEADLINE_PASSED'
  | 'TOO_EARLY'
  | 'INVALID_PHASE'
  | 'REQUEST_ID_REUSED'
  | 'HOST_STILL_ACTIVE'
  | 'NO_HOST_CANDIDATE'
  | 'ONLINE_UNAVAILABLE'

export interface OnlineRoomSettings {
  maxPlayers: 2 | 3 | 4
  turnTimeoutSeconds: number
  timeoutPolicy: TimeoutPolicy
  starterMode: StarterMode
  showLiveSelection: boolean
}

export interface OnlineRoom {
  id: string
  code: string
  status: RoomStatus
  hostPlayerId: string
  settings: OnlineRoomSettings
  version: number
  lastActivityAt: string
  expiresAt: string
}

export interface OnlinePlayer {
  id: string
  roomId: string
  nickname: string
  seat: number
  membershipStatus: MembershipStatus
  joinedAt: string
  lastSeenAt: string
}

export interface OnlineGamePlayer {
  gameId: string
  playerId: string
  seat: number
  timeoutStrikes: number
  participationStatus: ParticipationStatus
}

export interface PendingResolution {
  lockedNumber: number | null
  actorPlayerId: string
  origin: PendingOrigin
  resolutionAt: string
}

export interface OnlineGameState {
  id: string
  roomId: string
  roundNumber: number
  phase: GamePhase
  lowerCandidate: number
  upperCandidate: number
  currentPlayerId: string
  startingPlayerId: string
  turnNumber: number
  version: number
  turnStartedAt: string
  turnDeadlineAt: string
  pending: PendingResolution | null
  lastLockedNumber: number | null
  lastActorPlayerId: string | null
  lastActionOrigin: PendingOrigin | null
  lastOutcome: GameOutcome | null
  loserPlayerId: string | null
  finishReason: FinishReason | null
  revealedBombNumber: number | null
  updatedAt: string
  finishedAt: string | null
}

export interface CanonicalAction {
  id: number
  gameId: string
  gameVersion: number
  turnNumber: number
  actorPlayerId: string | null
  type:
    | 'GAME_STARTED'
    | 'NUMBER_LOCKED'
    | 'TURN_TIMEOUT'
    | 'RESOLUTION_FINALIZED'
  origin: string
  selectedNumber: number | null
  outcome: GameOutcome | null
  finishReason: FinishReason | null
  createdAt: string
}

export interface OnlineRpcResult {
  ok: boolean
  code: OnlineResultCode
  serverNow: string
  selfPlayerId: string | null
  room: OnlineRoom | null
  players: OnlinePlayer[]
  game: OnlineGameState | null
  gamePlayers: OnlineGamePlayer[]
  action: CanonicalAction | null
}

export interface OnlineRoomPointer {
  roomId: string
  roomCode: string
}

export type OnlineConnectionState =
  | 'offline'
  | 'authenticating'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'unavailable'

export interface RealtimeSelectionEvent {
  v: 1
  roomId: string
  gameId: string
  gameVersion: number
  playerId: string
  candidate: number
  clientSeq: number
  sentAt: string
}

export interface RealtimeSelectionClearedEvent {
  v: 1
  roomId: string
  gameId: string
  gameVersion: number
  playerId: string
  clientSeq: number
  sentAt: string
}

export interface PresencePayload {
  playerId: string
  onlineSince: string
  clientInstanceId: string
}

export type ExplosionPresentationVariant = 'victim' | 'spectator'

export function getCandidateCount(game: OnlineGameState): number {
  return game.upperCandidate - game.lowerCandidate + 1
}

export function getActiveOnlinePlayers(players: OnlinePlayer[]): OnlinePlayer[] {
  return players
    .filter((player) => player.membershipStatus === 'ACTIVE')
    .sort((left, right) => left.seat - right.seat)
}
