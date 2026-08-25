import type { OnlineRpcResult } from '../types'

export interface CanonicalOnlineState {
  snapshot: OnlineRpcResult | null
  roomVersion: number
  gameVersion: number
  needsSnapshot: boolean
}

export const emptyCanonicalOnlineState: CanonicalOnlineState = {
  snapshot: null,
  roomVersion: 0,
  gameVersion: 0,
  needsSnapshot: false,
}

export type CanonicalVersionSignal =
  | { kind: 'SNAPSHOT'; snapshot: OnlineRpcResult }
  | { kind: 'ROOM_VERSION'; version: number }
  | { kind: 'GAME_VERSION'; version: number }
  | { kind: 'RESET' }

export function shouldApplyCanonicalSnapshot(
  current: OnlineRpcResult | null,
  incoming: OnlineRpcResult,
): boolean {
  return reconcileCanonicalSnapshot(current, incoming) !== current
}

export function reconcileCanonicalSnapshot(
  current: OnlineRpcResult | null,
  incoming: OnlineRpcResult,
): OnlineRpcResult {
  if (!current?.room) return incoming
  if (!incoming.room) return incoming.code === 'ONLINE_UNAVAILABLE' ? current : incoming
  if (incoming.room.id !== current.room.id) return incoming

  const roomComparison = Math.sign(incoming.room.version - current.room.version)
  const bothWithoutGame = !current.game && !incoming.game
  const sameGame = Boolean(current.game && incoming.game && current.game.id === incoming.game.id)

  if (!sameGame && !bothWithoutGame) {
    return roomComparison > 0 ? incoming : current
  }

  const gameComparison = bothWithoutGame
    ? 0
    : sameGame
    ? Math.sign(incoming.game!.version - current.game!.version)
    : incoming.game
      ? 1
      : current.game
        ? -1
        : 0

  if (roomComparison === 0
    && gameComparison === 0
    && JSON.stringify({
      selfPlayerId: current.selfPlayerId,
      room: current.room,
      players: current.players,
      game: current.game,
      gamePlayers: current.gamePlayers,
      action: current.action,
    }) === JSON.stringify({
      selfPlayerId: incoming.selfPlayerId,
      room: incoming.room,
      players: incoming.players,
      game: incoming.game,
      gamePlayers: incoming.gamePlayers,
      action: incoming.action,
    })
  ) return current
  if (roomComparison < 0 && gameComparison <= 0) return current
  if (roomComparison === 0 && gameComparison < 0) return current

  const roomSource = roomComparison < 0 ? current : incoming
  const gameSource = gameComparison < 0 ? current : incoming

  if (roomSource === current && gameSource === current) return current
  if (roomSource === incoming && gameSource === incoming) return incoming

  return {
    ...incoming,
    selfPlayerId: roomSource.selfPlayerId,
    room: roomSource.room,
    players: roomSource.players,
    game: gameSource.game,
    gamePlayers: gameSource.gamePlayers,
    action: gameSource.action,
  }
}

export function reduceCanonicalVersion(
  state: CanonicalOnlineState,
  signal: CanonicalVersionSignal,
): CanonicalOnlineState {
  if (signal.kind === 'RESET') return emptyCanonicalOnlineState

  if (signal.kind === 'SNAPSHOT') {
    return {
      snapshot: signal.snapshot,
      roomVersion: signal.snapshot.room?.version ?? 0,
      gameVersion: signal.snapshot.game?.version ?? 0,
      needsSnapshot: false,
    }
  }

  const currentVersion = signal.kind === 'ROOM_VERSION'
    ? state.roomVersion
    : state.gameVersion

  if (signal.version <= currentVersion) return state

  return {
    ...state,
    needsSnapshot: signal.version > currentVersion,
  }
}
