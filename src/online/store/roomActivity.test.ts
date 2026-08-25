import { describe, expect, it } from 'vitest'
import type { MembershipStatus, OnlinePlayer, OnlineRpcResult } from '../types'
import { RoomActivityLedger } from './roomActivity'

function player(
  id: string,
  nickname: string,
  membershipStatus: MembershipStatus = 'ACTIVE',
): OnlinePlayer {
  return {
    id,
    roomId: 'room',
    nickname,
    seat: id === 'host' ? 1 : 2,
    membershipStatus,
    joinedAt: '2026-08-25T00:00:00.000Z',
    lastSeenAt: '2026-08-25T00:00:00.000Z',
  }
}

function snapshot(
  players: OnlinePlayer[],
  roomVersion = 1,
  hostPlayerId = 'host',
): OnlineRpcResult {
  return {
    ok: true,
    code: 'OK',
    serverNow: '2026-08-25T00:00:00.000Z',
    selfPlayerId: 'host',
    room: {
      id: 'room',
      code: 'P3FSS',
      status: 'LOBBY',
      hostPlayerId,
      settings: {
        maxPlayers: 4,
        turnTimeoutSeconds: 20,
        timeoutPolicy: 'RANDOM_PICK_WITH_2_STRIKES',
        starterMode: 'FIRST_SEAT',
        showLiveSelection: true,
      },
      version: roomVersion,
      lastActivityAt: '',
      expiresAt: '',
    },
    players,
    game: null,
    gamePlayers: [],
    action: null,
  }
}

describe('canonical room activity ledger', () => {
  it('emits the canonical nickname once for ACTIVE to LEFT', () => {
    const ledger = new RoomActivityLedger()
    ledger.observe(snapshot([player('host', 'Đức Thắng'), player('peer', 'Minh Quang')]), 'HYDRATE')
    const left = snapshot([
      player('host', 'Đức Thắng'),
      player('peer', 'Minh Quang', 'LEFT'),
    ], 2)

    expect(ledger.observe(left, 'LIVE', 1_000)).toEqual([expect.objectContaining({
      kind: 'PLAYER_LEFT',
      playerId: 'peer',
      playerName: 'Minh Quang',
      message: 'Minh Quang ĐÃ RỜI PHÒNG.',
    })])
    expect(ledger.observe(left, 'LIVE', 1_100)).toEqual([])
  })

  it('emits ACTIVE to KICKED with distinct copy', () => {
    const ledger = new RoomActivityLedger()
    ledger.observe(snapshot([player('host', 'Host'), player('peer', 'Lan Anh')]), 'HYDRATE')
    const activities = ledger.observe(snapshot([
      player('host', 'Host'),
      player('peer', 'Lan Anh', 'KICKED'),
    ], 2), 'LIVE')

    expect(activities).toEqual([expect.objectContaining({
      kind: 'PLAYER_KICKED',
      message: 'Lan Anh ĐÃ BỊ MỜI RỜI PHÒNG.',
    })])
  })

  it('does not infer departure from Presence-only disappearance', () => {
    const ledger = new RoomActivityLedger()
    const canonical = snapshot([player('host', 'Host'), player('peer', 'Peer')])
    ledger.observe(canonical, 'HYDRATE')
    expect(ledger.observe(structuredClone(canonical), 'LIVE')).toEqual([])
  })

  it('does not replay historical LEFT or KICKED rows during cold hydration', () => {
    const ledger = new RoomActivityLedger()
    const historical = snapshot([
      player('host', 'Host'),
      player('left', 'Left Before Load', 'LEFT'),
      { ...player('kicked', 'Kicked Before Load', 'KICKED'), seat: 3 },
    ], 8)
    expect(ledger.observe(historical, 'HYDRATE')).toEqual([])
    expect(ledger.observe(structuredClone(historical), 'LIVE')).toEqual([])
  })

  it('treats reconnect hydration as a new truthful baseline without a toast', () => {
    const ledger = new RoomActivityLedger()
    ledger.observe(snapshot([player('host', 'Host'), player('peer', 'Peer')]), 'HYDRATE')
    const departed = snapshot([
      player('host', 'Host'),
      player('peer', 'Peer', 'LEFT'),
    ], 2)
    expect(ledger.observe(departed, 'HYDRATE')).toEqual([])
    expect(ledger.observe(departed, 'LIVE')).toEqual([])
  })

  it('reports a live transition discovered by anti-entropy exactly once', () => {
    const ledger = new RoomActivityLedger()
    ledger.observe(snapshot([player('host', 'Host'), player('peer', 'Recovered Peer')]), 'HYDRATE')
    const recovered = snapshot([
      player('host', 'Host'),
      player('peer', 'Recovered Peer', 'LEFT'),
    ], 4)
    expect(ledger.observe(recovered, 'LIVE')).toHaveLength(1)
    expect(ledger.observe(structuredClone(recovered), 'LIVE')).toHaveLength(0)
  })

  it('emits a later leave after the same member rejoins as a new canonical transition', () => {
    const ledger = new RoomActivityLedger()
    ledger.observe(snapshot([player('host', 'Host'), player('peer', 'Returning Peer')]), 'HYDRATE')
    expect(ledger.observe(snapshot([
      player('host', 'Host'),
      player('peer', 'Returning Peer', 'LEFT'),
    ], 2), 'LIVE')).toHaveLength(1)
    expect(ledger.observe(snapshot([
      player('host', 'Host'),
      player('peer', 'Returning Peer'),
    ], 3), 'LIVE')).toHaveLength(0)
    expect(ledger.observe(snapshot([
      player('host', 'Host'),
      player('peer', 'Returning Peer', 'LEFT'),
    ], 4), 'LIVE')).toHaveLength(1)
  })

  it('ignores self departure because only remaining clients receive activity', () => {
    const ledger = new RoomActivityLedger()
    ledger.observe(snapshot([player('host', 'Host'), player('peer', 'Peer')]), 'HYDRATE')
    expect(ledger.observe(snapshot([
      player('host', 'Host', 'LEFT'),
      player('peer', 'Peer'),
    ], 2, 'peer'), 'LIVE')).toEqual([expect.objectContaining({
      kind: 'HOST_CHANGED',
      playerId: 'peer',
    })])
  })

  it('announces a canonical host migration once', () => {
    const ledger = new RoomActivityLedger()
    ledger.observe(snapshot([player('host', 'Host'), player('peer', 'Mai')]), 'HYDRATE')
    const migrated = snapshot([
      player('host', 'Host', 'LEFT'),
      player('peer', 'Mai'),
    ], 2, 'peer')
    const activities = ledger.observe(migrated, 'LIVE')
    expect(activities.map((activity) => activity.message)).toEqual([
      'Mai HIỆN LÀ CHỦ PHÒNG.',
    ])
    expect(ledger.observe(migrated, 'LIVE')).toEqual([])
  })
})
