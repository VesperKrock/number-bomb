import type {
  OnlineGameState,
  OnlinePlayer,
  OnlineRoom,
  RealtimeSelectionEvent,
} from '../types'

export const PROVISIONAL_SELECTION_TTL_MS = 5_000

export interface ProvisionalValidationContext {
  room: OnlineRoom
  game: OnlineGameState
  players: OnlinePlayer[]
  lastClientSeq: number
  receivedAtMs: number
}

export function isValidProvisionalSelection(
  event: RealtimeSelectionEvent,
  context: ProvisionalValidationContext,
): boolean {
  const sentAtMs = Date.parse(event.sentAt)
  const actor = context.players.find((player) => player.id === event.playerId)

  return event.v === 1
    && context.room.settings.showLiveSelection
    && event.roomId === context.room.id
    && event.gameId === context.game.id
    && event.gameVersion === context.game.version
    && context.game.phase === 'PLAYING_TURN'
    && event.playerId === context.game.currentPlayerId
    && actor?.membershipStatus === 'ACTIVE'
    && Number.isInteger(event.candidate)
    && event.candidate >= context.game.lowerCandidate
    && event.candidate <= context.game.upperCandidate
    && Number.isInteger(event.clientSeq)
    && event.clientSeq > context.lastClientSeq
    && Number.isFinite(sentAtMs)
    && Math.abs(context.receivedAtMs - sentAtMs) <= PROVISIONAL_SELECTION_TTL_MS
}
