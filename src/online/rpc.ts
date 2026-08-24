import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  OnlineRoomSettings,
  OnlineRpcResult,
} from './types'

type RpcArguments = Record<string, boolean | number | string | null>

function unavailableResult(): OnlineRpcResult {
  return {
    ok: false,
    code: 'ONLINE_UNAVAILABLE',
    serverNow: new Date().toISOString(),
    selfPlayerId: null,
    room: null,
    players: [],
    game: null,
    gamePlayers: [],
    action: null,
  }
}

export async function callOnlineRpc(
  client: SupabaseClient,
  functionName: string,
  args: RpcArguments,
): Promise<OnlineRpcResult> {
  const invoke = () => client.rpc(functionName, args)
  let { data, error } = await invoke()
  if (error) {
    const retry = await invoke()
    data = retry.data
    error = retry.error
  }
  if (error || !data || typeof data !== 'object') return unavailableResult()
  return data as OnlineRpcResult
}

export function requestId(): string {
  return crypto.randomUUID()
}

export const onlineRpc = {
  snapshot: (client: SupabaseClient, roomId: string) =>
    callOnlineRpc(client, 'get_room_snapshot', { p_room_id: roomId }),
  touch: (client: SupabaseClient, roomId: string) =>
    callOnlineRpc(client, 'touch_connection', { p_room_id: roomId }),
  createRoom: (
    client: SupabaseClient,
    nickname: string,
    settings: OnlineRoomSettings,
    mutationId = requestId(),
  ) => callOnlineRpc(client, 'create_room', {
    p_nickname: nickname,
    p_max_players: settings.maxPlayers,
    p_turn_timeout_seconds: settings.turnTimeoutSeconds,
    p_timeout_policy: settings.timeoutPolicy,
    p_starter_mode: settings.starterMode,
    p_show_live_selection: settings.showLiveSelection,
    p_request_id: mutationId,
  }),
  joinRoom: (
    client: SupabaseClient,
    roomCode: string,
    nickname: string,
    mutationId = requestId(),
  ) => callOnlineRpc(client, 'join_room', {
    p_room_code: roomCode,
    p_nickname: nickname,
    p_request_id: mutationId,
  }),
  updateSettings: (
    client: SupabaseClient,
    roomId: string,
    expectedRoomVersion: number,
    settings: OnlineRoomSettings,
    mutationId = requestId(),
  ) => callOnlineRpc(client, 'update_room_settings', {
    p_room_id: roomId,
    p_expected_room_version: expectedRoomVersion,
    p_max_players: settings.maxPlayers,
    p_turn_timeout_seconds: settings.turnTimeoutSeconds,
    p_timeout_policy: settings.timeoutPolicy,
    p_starter_mode: settings.starterMode,
    p_show_live_selection: settings.showLiveSelection,
    p_request_id: mutationId,
  }),
  kick: (
    client: SupabaseClient,
    roomId: string,
    targetPlayerId: string,
    expectedRoomVersion: number,
    mutationId = requestId(),
  ) => callOnlineRpc(client, 'kick_player', {
    p_room_id: roomId,
    p_target_player_id: targetPlayerId,
    p_expected_room_version: expectedRoomVersion,
    p_request_id: mutationId,
  }),
  leave: (client: SupabaseClient, roomId: string, mutationId = requestId()) =>
    callOnlineRpc(client, 'leave_room', {
      p_room_id: roomId,
      p_request_id: mutationId,
    }),
  claimHost: (
    client: SupabaseClient,
    roomId: string,
    expectedHostPlayerId: string,
    expectedRoomVersion: number,
    mutationId = requestId(),
  ) => callOnlineRpc(client, 'claim_host', {
    p_room_id: roomId,
    p_expected_host_player_id: expectedHostPlayerId,
    p_expected_room_version: expectedRoomVersion,
    p_request_id: mutationId,
  }),
  start: (
    client: SupabaseClient,
    roomId: string,
    expectedRoomVersion: number,
    mutationId = requestId(),
  ) => callOnlineRpc(client, 'start_game', {
    p_room_id: roomId,
    p_expected_room_version: expectedRoomVersion,
    p_request_id: mutationId,
  }),
  lock: (
    client: SupabaseClient,
    roomId: string,
    gameId: string,
    expectedGameVersion: number,
    selectedNumber: number,
    mutationId = requestId(),
  ) => callOnlineRpc(client, 'lock_number', {
    p_room_id: roomId,
    p_game_id: gameId,
    p_expected_game_version: expectedGameVersion,
    p_selected_number: selectedNumber,
    p_request_id: mutationId,
  }),
  timeout: (
    client: SupabaseClient,
    roomId: string,
    gameId: string,
    expectedGameVersion: number,
    expectedCurrentPlayerId: string,
    mutationId = requestId(),
  ) => callOnlineRpc(client, 'resolve_turn_timeout', {
    p_room_id: roomId,
    p_game_id: gameId,
    p_expected_game_version: expectedGameVersion,
    p_expected_current_player_id: expectedCurrentPlayerId,
    p_request_id: mutationId,
  }),
  finalize: (
    client: SupabaseClient,
    roomId: string,
    gameId: string,
    expectedGameVersion: number,
    mutationId = requestId(),
  ) => callOnlineRpc(client, 'finalize_resolution', {
    p_room_id: roomId,
    p_game_id: gameId,
    p_expected_game_version: expectedGameVersion,
    p_request_id: mutationId,
  }),
  restart: (
    client: SupabaseClient,
    roomId: string,
    expectedRoomVersion: number,
    mutationId = requestId(),
  ) => callOnlineRpc(client, 'restart_game', {
    p_room_id: roomId,
    p_expected_room_version: expectedRoomVersion,
    p_request_id: mutationId,
  }),
  lobby: (
    client: SupabaseClient,
    roomId: string,
    expectedRoomVersion: number,
    mutationId = requestId(),
  ) => callOnlineRpc(client, 'return_to_lobby', {
    p_room_id: roomId,
    p_expected_room_version: expectedRoomVersion,
    p_request_id: mutationId,
  }),
}
