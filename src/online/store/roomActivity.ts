import type { MembershipStatus, OnlinePlayer, OnlineRpcResult } from '../types'

export type RoomActivityKind = 'PLAYER_LEFT' | 'PLAYER_KICKED' | 'HOST_CHANGED'
export type RoomActivityObservationMode = 'HYDRATE' | 'LIVE'

export interface RoomActivity {
  id: string
  kind: RoomActivityKind
  playerId: string
  playerName: string
  message: string
  observedAtMs: number
  expiresAtMs: number
}

interface KnownPlayer {
  nickname: string
  membershipStatus: MembershipStatus
}

const ACTIVITY_LIFETIME_MS = 4_200

function activityMessage(kind: RoomActivityKind, nickname: string): string {
  if (kind === 'PLAYER_LEFT') return `${nickname} ĐÃ RỜI PHÒNG.`
  if (kind === 'PLAYER_KICKED') return `${nickname} ĐÃ BỊ MỜI RỜI PHÒNG.`
  return `${nickname} HIỆN LÀ CHỦ PHÒNG.`
}

function toKnownPlayers(players: readonly OnlinePlayer[]): Map<string, KnownPlayer> {
  return new Map(players.map((player) => [player.id, {
    nickname: player.nickname,
    membershipStatus: player.membershipStatus,
  }]))
}

export class RoomActivityLedger {
  private roomId: string | null = null
  private hostPlayerId: string | null = null
  private knownPlayers = new Map<string, KnownPlayer>()
  private consumed = new Set<string>()

  reset(): void {
    this.roomId = null
    this.hostPlayerId = null
    this.knownPlayers.clear()
    this.consumed.clear()
  }

  observe(
    snapshot: OnlineRpcResult,
    mode: RoomActivityObservationMode,
    observedAtMs = Date.now(),
  ): RoomActivity[] {
    const room = snapshot.room
    if (!room) {
      this.reset()
      return []
    }

    const roomChanged = this.roomId !== room.id
    if (roomChanged) {
      this.roomId = room.id
      this.hostPlayerId = room.hostPlayerId
      this.knownPlayers = toKnownPlayers(snapshot.players)
      this.consumed.clear()
      return []
    }

    const nextPlayers = toKnownPlayers(snapshot.players)
    const activities: RoomActivity[] = []
    const append = (
      key: string,
      kind: RoomActivityKind,
      playerId: string,
      playerName: string,
    ) => {
      if (this.consumed.has(key)) return
      this.consumed.add(key)
      activities.push({
        id: key,
        kind,
        playerId,
        playerName,
        message: activityMessage(kind, playerName),
        observedAtMs,
        expiresAtMs: observedAtMs + ACTIVITY_LIFETIME_MS,
      })
    }

    if (mode === 'LIVE') {
      for (const player of snapshot.players) {
        if (player.id === snapshot.selfPlayerId) continue
        const previous = this.knownPlayers.get(player.id)
        if (previous?.membershipStatus !== 'ACTIVE') continue
        if (player.membershipStatus === 'LEFT') {
          append(
            `${room.id}:${player.id}:LEFT:${room.version}`,
            'PLAYER_LEFT',
            player.id,
            player.nickname,
          )
        } else if (player.membershipStatus === 'KICKED') {
          append(
            `${room.id}:${player.id}:KICKED:${room.version}`,
            'PLAYER_KICKED',
            player.id,
            player.nickname,
          )
        }
      }

      if (this.hostPlayerId && this.hostPlayerId !== room.hostPlayerId) {
        const nextHost = nextPlayers.get(room.hostPlayerId)
        if (nextHost?.membershipStatus === 'ACTIVE') {
          append(
            `${room.id}:HOST:${room.hostPlayerId}:${room.version}`,
            'HOST_CHANGED',
            room.hostPlayerId,
            nextHost.nickname,
          )
        }
      }
    }

    this.hostPlayerId = room.hostPlayerId
    this.knownPlayers = nextPlayers
    return activities
  }
}
