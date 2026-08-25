import { createContext } from 'react'
import type { ServerClock } from '../clock'
import type {
  OnlineConnectionState,
  OnlineRoomSettings,
  OnlineRpcResult,
  RealtimeSelectionEvent,
} from '../types'
import type { LiveGameTransition } from './liveGameTransition'

export interface RemoteSelection {
  event: RealtimeSelectionEvent
  expiresAtMs: number
}

export interface OnlineSessionValue {
  available: boolean
  configReason: 'READY' | 'MISSING_ENV' | 'INVALID_URL' | 'INVALID_KEY'
  connection: OnlineConnectionState
  snapshot: OnlineRpcResult | null
  busy: boolean
  lastCode: OnlineRpcResult['code'] | null
  presencePlayerIds: ReadonlySet<string>
  remoteSelection: RemoteSelection | null
  liveGameTransitions: readonly LiveGameTransition[]
  clock: ServerClock
  createRoom: (nickname: string, settings: OnlineRoomSettings) => Promise<boolean>
  joinRoom: (roomCode: string, nickname: string) => Promise<boolean>
  reconnect: () => Promise<boolean>
  updateSettings: (settings: OnlineRoomSettings) => Promise<boolean>
  kickPlayer: (playerId: string) => Promise<boolean>
  leaveRoom: () => Promise<void>
  claimHost: () => Promise<boolean>
  startGame: () => Promise<boolean>
  lockNumber: (candidate: number) => Promise<boolean>
  resolveTimeout: () => Promise<boolean>
  finalizeResolution: () => Promise<boolean>
  restartGame: () => Promise<boolean>
  returnToLobby: () => Promise<boolean>
  refreshSnapshot: () => Promise<boolean>
  broadcastSelection: (candidate: number) => Promise<void>
  clearBroadcastSelection: () => Promise<void>
  clearLastCode: () => void
  exitOnlineRoomLocally: () => void
}

export const OnlineSessionContext = createContext<OnlineSessionValue | null>(null)
