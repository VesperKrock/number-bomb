import {
  type PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
  SupabaseClient,
} from '@supabase/supabase-js'
import { ensureAnonymousIdentity } from '../auth'
import { ServerClock } from '../clock'
import { getSupabaseClient } from '../client'
import { getOnlineConfig } from '../config'
import { isValidProvisionalSelection } from '../realtime/provisional'
import { onlineRpc } from '../rpc'
import { clearRoomPointer, readRoomPointer, writeRoomPointer } from '../storage'
import type {
  OnlineConnectionState,
  OnlineRoomSettings,
  OnlineRpcResult,
  PresencePayload,
  RealtimeSelectionClearedEvent,
  RealtimeSelectionEvent,
} from '../types'
import {
  OnlineSessionContext,
  type OnlineSessionValue,
  type RemoteSelection,
} from './OnlineSessionContext'

const TERMINAL_POINTER_CODES = new Set<OnlineRpcResult['code']>([
  'KICKED',
  'NOT_ROOM_MEMBER',
  'ROOM_EXPIRED',
  'ROOM_NOT_FOUND',
])

function isCanonicalResult(result: OnlineRpcResult): boolean {
  return result.room !== null && result.selfPlayerId !== null
}

export function OnlineSessionProvider({ children }: PropsWithChildren) {
  const config = getOnlineConfig()
  const clientRef = useRef<SupabaseClient | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const snapshotRef = useRef<OnlineRpcResult | null>(null)
  const refreshPromiseRef = useRef<Promise<boolean> | null>(null)
  const mountedRef = useRef(true)
  const selectionSeqRef = useRef(0)
  const remoteSelectionTimerRef = useRef<number | null>(null)
  const remoteSelectionRef = useRef<RemoteSelection | null>(null)
  const clockRef = useRef(new ServerClock())
  const [connection, setConnection] = useState<OnlineConnectionState>(
    config.available ? 'authenticating' : 'unavailable',
  )
  const [snapshot, setSnapshot] = useState<OnlineRpcResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [lastCode, setLastCode] = useState<OnlineRpcResult['code'] | null>(null)
  const [presencePlayerIds, setPresencePlayerIds] = useState<ReadonlySet<string>>(new Set())
  const [remoteSelection, setRemoteSelection] = useState<RemoteSelection | null>(null)

  const updateSnapshot = useCallback((result: OnlineRpcResult) => {
    if (!mountedRef.current) return
    snapshotRef.current = result
    setSnapshot(result)
    setLastCode(result.ok ? null : result.code)

    if (result.room && result.selfPlayerId && result.players.some(
      (player) => player.id === result.selfPlayerId && player.membershipStatus === 'ACTIVE',
    )) {
      writeRoomPointer({ roomId: result.room.id, roomCode: result.room.code })
    }

    if (TERMINAL_POINTER_CODES.has(result.code)) clearRoomPointer()
  }, [])

  const recordRpcClock = useCallback((
    result: OnlineRpcResult,
    sentAtMs: number,
    receivedAtMs: number,
  ) => {
    clockRef.current.addSample(sentAtMs, receivedAtMs, result.serverNow)
  }, [])

  const removeRoomChannel = useCallback(() => {
    const channel = channelRef.current
    channelRef.current = null
    if (channel && clientRef.current) void clientRef.current.removeChannel(channel)
    setPresencePlayerIds(new Set())
    remoteSelectionRef.current = null
    setRemoteSelection(null)
    if (remoteSelectionTimerRef.current !== null) {
      window.clearTimeout(remoteSelectionTimerRef.current)
      remoteSelectionTimerRef.current = null
    }
  }, [])

  const refreshSnapshot = useCallback(async (): Promise<boolean> => {
    const current = snapshotRef.current
    const client = clientRef.current
    if (!current?.room || !client) return false
    if (refreshPromiseRef.current) return refreshPromiseRef.current

    const request = (async () => {
      const sentAt = Date.now()
      const result = await onlineRpc.snapshot(client, current.room!.id)
      recordRpcClock(result, sentAt, Date.now())
      updateSnapshot(result)
      if (TERMINAL_POINTER_CODES.has(result.code)) {
        removeRoomChannel()
        setConnection('offline')
        return false
      }
      return isCanonicalResult(result)
    })().finally(() => {
      refreshPromiseRef.current = null
    })

    refreshPromiseRef.current = request
    return request
  }, [recordRpcClock, removeRoomChannel, updateSnapshot])

  const expireRemoteSelection = useCallback((selection: RemoteSelection) => {
    remoteSelectionRef.current = selection
    setRemoteSelection(selection)
    if (remoteSelectionTimerRef.current !== null) {
      window.clearTimeout(remoteSelectionTimerRef.current)
    }
    remoteSelectionTimerRef.current = window.setTimeout(() => {
      setRemoteSelection((current) => current?.event.clientSeq === selection.event.clientSeq
        ? (remoteSelectionRef.current = null)
        : current)
      remoteSelectionTimerRef.current = null
    }, Math.max(0, selection.expiresAtMs - Date.now()))
  }, [])

  const subscribeToRoom = useCallback(async (initial: OnlineRpcResult): Promise<void> => {
    const client = clientRef.current
    const room = initial.room
    const selfPlayerId = initial.selfPlayerId
    if (!client || !room || !selfPlayerId) return

    removeRoomChannel()
    setConnection('connecting')

    const channel = client.channel(`room:${room.id}`, {
      config: {
        private: true,
        presence: { key: selfPlayerId },
        broadcast: { self: false },
      },
    })
    channelRef.current = channel

    const wakeFromPostgres = (
      payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
    ) => {
      const current = snapshotRef.current
      if (!current?.room) return
      const nextRow = payload.new as Record<string, unknown>
      const incomingVersion = typeof nextRow.version === 'number' ? nextRow.version : null
      const knownVersion = payload.table === 'rooms'
        ? current.room.version
        : current.game?.version ?? 0
      if (incomingVersion !== null && incomingVersion <= knownVersion) return
      void refreshSnapshot()
    }

    channel
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'rooms',
        filter: `id=eq.${room.id}`,
        select: [
          'id', 'code', 'status', 'host_player_id', 'max_players',
          'turn_timeout_seconds', 'timeout_policy', 'starter_mode',
          'show_live_selection', 'version', 'last_activity_at', 'expires_at',
          'created_at', 'updated_at',
        ],
      }, wakeFromPostgres)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'room_players',
        filter: `room_id=eq.${room.id}`,
        select: [
          'id', 'room_id', 'nickname', 'seat', 'membership_status',
          'joined_at', 'last_seen_at', 'left_at',
        ],
      }, wakeFromPostgres)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'room_games',
        filter: `room_id=eq.${room.id}`,
        select: [
          'id', 'room_id', 'round_number', 'phase', 'lower_candidate',
          'upper_candidate', 'current_player_id', 'starting_player_id',
          'turn_number', 'version', 'turn_started_at', 'turn_deadline_at',
          'pending_locked_number', 'pending_actor_player_id',
          'pending_action_origin', 'resolution_at', 'last_locked_number',
          'last_actor_player_id', 'last_action_origin', 'last_outcome',
          'loser_player_id', 'finish_reason', 'revealed_bomb_number',
          'created_at', 'updated_at', 'finished_at',
        ],
      }, wakeFromPostgres)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'game_players',
        filter: `room_id=eq.${room.id}`,
        select: [
          'game_id', 'room_id', 'player_id', 'seat', 'timeout_strikes',
          'participation_status', 'created_at',
        ],
      }, wakeFromPostgres)
      .on('presence', { event: 'sync' }, () => {
        const ids = new Set<string>()
        const state = channel.presenceState<PresencePayload>()
        for (const presences of Object.values(state)) {
          for (const presence of presences) {
            if (typeof presence.playerId === 'string') ids.add(presence.playerId)
          }
        }
        setPresencePlayerIds(ids)
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        const leftIds = new Set(leftPresences
          .map((presence) => (presence as Partial<PresencePayload>).playerId)
          .filter((playerId): playerId is string => typeof playerId === 'string'))
        setRemoteSelection((selection) => {
          const nextSelection = selection && leftIds.has(selection.event.playerId)
            ? null
            : selection
          remoteSelectionRef.current = nextSelection
          return nextSelection
        })
      })
      .on('broadcast', { event: 'player_selection_changed' }, ({ payload }) => {
        const event = payload as RealtimeSelectionEvent
        const current = snapshotRef.current
        if (!current?.room || !current.game) return
        const currentRemote = remoteSelectionRef.current
        if (!isValidProvisionalSelection(event, {
          room: current.room,
          game: current.game,
          players: current.players,
          lastClientSeq: currentRemote?.event.playerId === event.playerId
            ? currentRemote.event.clientSeq
            : -1,
          receivedAtMs: Date.now(),
        })) return
        expireRemoteSelection({ event, expiresAtMs: Date.now() + 5_000 })
      })
      .on('broadcast', { event: 'player_selection_cleared' }, ({ payload }) => {
        const event = payload as RealtimeSelectionClearedEvent
        const current = snapshotRef.current
        if (!current?.game
          || event.roomId !== current.room?.id
          || event.gameId !== current.game.id
          || event.gameVersion !== current.game.version
        ) return
        setRemoteSelection((selection) => {
          if (selection
            && selection.event.playerId === event.playerId
            && event.clientSeq > selection.event.clientSeq
          ) {
            remoteSelectionRef.current = null
            return null
          }
          return selection
        })
      })
      .subscribe((status) => {
        if (channelRef.current !== channel) return
        if (status === 'SUBSCRIBED') {
          const payload: PresencePayload = {
            playerId: selfPlayerId,
            onlineSince: new Date().toISOString(),
            clientInstanceId: crypto.randomUUID(),
          }
          void channel.track(payload)
          setConnection('connected')
          void refreshSnapshot()
          void onlineRpc.touch(client, room.id)
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setConnection('reconnecting')
        } else if (status === 'CLOSED') {
          setConnection('offline')
        }
      })
  }, [expireRemoteSelection, refreshSnapshot, removeRoomChannel])

  const connectCanonicalResult = useCallback(async (result: OnlineRpcResult): Promise<boolean> => {
    updateSnapshot(result)
    if (!isCanonicalResult(result)) return false
    await subscribeToRoom(result)
    return true
  }, [subscribeToRoom, updateSnapshot])

  const reconnect = useCallback(async (): Promise<boolean> => {
    const client = clientRef.current
    const pointer = readRoomPointer()
    if (!client || !pointer) return false
    setConnection('connecting')
    const sentAt = Date.now()
    const result = await onlineRpc.snapshot(client, pointer.roomId)
    recordRpcClock(result, sentAt, Date.now())
    if (TERMINAL_POINTER_CODES.has(result.code)) {
      clearRoomPointer()
      updateSnapshot(result)
      setConnection('offline')
      return false
    }
    return connectCanonicalResult(result)
  }, [connectCanonicalResult, recordRpcClock, updateSnapshot])

  useEffect(() => {
    mountedRef.current = true
    if (!config.available) return () => { mountedRef.current = false }
    const client = getSupabaseClient()
    clientRef.current = client
    if (!client) {
      setConnection('unavailable')
      return () => { mountedRef.current = false }
    }

    void ensureAnonymousIdentity(client)
      .then(async () => {
        if (!mountedRef.current) return
        setConnection('offline')
        await reconnect()
      })
      .catch(() => {
        if (mountedRef.current) setConnection('unavailable')
      })

    return () => {
      mountedRef.current = false
      removeRoomChannel()
    }
  }, [config.available, reconnect, removeRoomChannel])

  useEffect(() => {
    if (connection !== 'connected' || !snapshot?.room) return
    const roomId = snapshot.room.id
    const intervalId = window.setInterval(() => {
      const client = clientRef.current
      if (client && document.visibilityState === 'visible') {
        void onlineRpc.touch(client, roomId)
      }
    }, 15_000)
    return () => window.clearInterval(intervalId)
  }, [connection, snapshot?.room])

  useEffect(() => {
    if (connection !== 'connected' || !snapshot?.room) return
    const intervalId = window.setInterval(() => void refreshSnapshot(), 60_000)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refreshSnapshot()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [connection, refreshSnapshot, snapshot?.room])

  useEffect(() => {
    remoteSelectionRef.current = null
    setRemoteSelection(null)
  }, [snapshot?.game?.currentPlayerId, snapshot?.game?.phase, snapshot?.game?.version])

  const runEntryMutation = useCallback(async (
    request: (client: SupabaseClient) => Promise<OnlineRpcResult>,
  ): Promise<boolean> => {
    const client = clientRef.current
    if (!client) return false
    setBusy(true)
    setLastCode(null)
    try {
      const sentAt = Date.now()
      const result = await request(client)
      recordRpcClock(result, sentAt, Date.now())
      return await connectCanonicalResult(result)
    } finally {
      if (mountedRef.current) setBusy(false)
    }
  }, [connectCanonicalResult, recordRpcClock])

  const runRoomMutation = useCallback(async (
    request: (client: SupabaseClient, current: OnlineRpcResult) => Promise<OnlineRpcResult>,
  ): Promise<boolean> => {
    const client = clientRef.current
    const current = snapshotRef.current
    if (!client || !current?.room) return false
    setBusy(true)
    setLastCode(null)
    try {
      const sentAt = Date.now()
      const result = await request(client, current)
      recordRpcClock(result, sentAt, Date.now())
      updateSnapshot(result)
      return result.ok
    } finally {
      if (mountedRef.current) setBusy(false)
    }
  }, [recordRpcClock, updateSnapshot])

  const createRoom = useCallback((nickname: string, settings: OnlineRoomSettings) =>
    runEntryMutation((client) => onlineRpc.createRoom(client, nickname, settings)), [runEntryMutation])

  const joinRoom = useCallback((roomCode: string, nickname: string) =>
    runEntryMutation((client) => onlineRpc.joinRoom(client, roomCode, nickname)), [runEntryMutation])

  const updateSettings = useCallback((settings: OnlineRoomSettings) =>
    runRoomMutation((client, current) => onlineRpc.updateSettings(
      client,
      current.room!.id,
      current.room!.version,
      settings,
    )), [runRoomMutation])

  const kickPlayer = useCallback((playerId: string) =>
    runRoomMutation((client, current) => onlineRpc.kick(
      client,
      current.room!.id,
      playerId,
      current.room!.version,
    )), [runRoomMutation])

  const leaveRoom = useCallback(async () => {
    await runRoomMutation((client, current) => onlineRpc.leave(client, current.room!.id))
    clearRoomPointer()
    removeRoomChannel()
    snapshotRef.current = null
    setSnapshot(null)
    setConnection('offline')
  }, [removeRoomChannel, runRoomMutation])

  const claimHost = useCallback(() => runRoomMutation((client, current) =>
    onlineRpc.claimHost(
      client,
      current.room!.id,
      current.room!.hostPlayerId,
      current.room!.version,
    )), [runRoomMutation])

  const startGame = useCallback(() => runRoomMutation((client, current) =>
    onlineRpc.start(client, current.room!.id, current.room!.version)), [runRoomMutation])

  const lockNumber = useCallback((candidate: number) => runRoomMutation((client, current) =>
    onlineRpc.lock(
      client,
      current.room!.id,
      current.game!.id,
      current.game!.version,
      candidate,
    )), [runRoomMutation])

  const resolveTimeout = useCallback(() => runRoomMutation((client, current) =>
    onlineRpc.timeout(
      client,
      current.room!.id,
      current.game!.id,
      current.game!.version,
      current.game!.currentPlayerId,
    )), [runRoomMutation])

  const finalizeResolution = useCallback(() => runRoomMutation((client, current) =>
    onlineRpc.finalize(
      client,
      current.room!.id,
      current.game!.id,
      current.game!.version,
    )), [runRoomMutation])

  const restartGame = useCallback(() => runRoomMutation((client, current) =>
    onlineRpc.restart(client, current.room!.id, current.room!.version)), [runRoomMutation])

  const returnToLobby = useCallback(() => runRoomMutation((client, current) =>
    onlineRpc.lobby(client, current.room!.id, current.room!.version)), [runRoomMutation])

  const broadcastSelection = useCallback(async (candidate: number) => {
    const channel = channelRef.current
    const current = snapshotRef.current
    if (!channel || !current?.room || !current.game || !current.selfPlayerId) return
    if (!current.room.settings.showLiveSelection
      || current.game.currentPlayerId !== current.selfPlayerId
      || current.game.phase !== 'PLAYING_TURN') return
    selectionSeqRef.current += 1
    const event: RealtimeSelectionEvent = {
      v: 1,
      roomId: current.room.id,
      gameId: current.game.id,
      gameVersion: current.game.version,
      playerId: current.selfPlayerId,
      candidate,
      clientSeq: selectionSeqRef.current,
      sentAt: new Date().toISOString(),
    }
    await channel.send({ type: 'broadcast', event: 'player_selection_changed', payload: event })
  }, [])

  const clearBroadcastSelection = useCallback(async () => {
    const channel = channelRef.current
    const current = snapshotRef.current
    if (!channel || !current?.room || !current.game || !current.selfPlayerId) return
    selectionSeqRef.current += 1
    const event: RealtimeSelectionClearedEvent = {
      v: 1,
      roomId: current.room.id,
      gameId: current.game.id,
      gameVersion: current.game.version,
      playerId: current.selfPlayerId,
      clientSeq: selectionSeqRef.current,
      sentAt: new Date().toISOString(),
    }
    await channel.send({ type: 'broadcast', event: 'player_selection_cleared', payload: event })
  }, [])

  const exitOnlineRoomLocally = useCallback(() => {
    clearRoomPointer()
    removeRoomChannel()
    snapshotRef.current = null
    setSnapshot(null)
    setLastCode(null)
    setConnection(config.available ? 'offline' : 'unavailable')
  }, [config.available, removeRoomChannel])

  const value = useMemo<OnlineSessionValue>(() => ({
    available: config.available,
    configReason: config.reason,
    connection,
    snapshot,
    busy,
    lastCode,
    presencePlayerIds,
    remoteSelection,
    clock: clockRef.current,
    createRoom,
    joinRoom,
    reconnect,
    updateSettings,
    kickPlayer,
    leaveRoom,
    claimHost,
    startGame,
    lockNumber,
    resolveTimeout,
    finalizeResolution,
    restartGame,
    returnToLobby,
    refreshSnapshot,
    broadcastSelection,
    clearBroadcastSelection,
    clearLastCode: () => setLastCode(null),
    exitOnlineRoomLocally,
  }), [
    broadcastSelection,
    busy,
    claimHost,
    clearBroadcastSelection,
    config.available,
    config.reason,
    connection,
    createRoom,
    exitOnlineRoomLocally,
    finalizeResolution,
    joinRoom,
    kickPlayer,
    lastCode,
    leaveRoom,
    lockNumber,
    presencePlayerIds,
    reconnect,
    refreshSnapshot,
    remoteSelection,
    resolveTimeout,
    restartGame,
    returnToLobby,
    snapshot,
    startGame,
    updateSettings,
  ])

  return (
    <OnlineSessionContext.Provider value={value}>
      {children}
    </OnlineSessionContext.Provider>
  )
}
