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
