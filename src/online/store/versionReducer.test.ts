import { describe, expect, it } from 'vitest'
import type { OnlineRpcResult } from '../types'
import {
  emptyCanonicalOnlineState,
  reconcileCanonicalSnapshot,
  reduceCanonicalVersion,
  shouldApplyCanonicalSnapshot,
} from './versionReducer'

function snapshot(roomVersion: number, gameVersion: number): OnlineRpcResult {
  return {
    ok: true,
    code: 'OK',
    serverNow: '2026-08-25T00:00:00.000Z',
    selfPlayerId: 'self',
    room: {
      id: 'room',
      code: 'K7X4P',
      status: 'PLAYING',
      hostPlayerId: 'self',
      settings: {
        maxPlayers: 2,
        turnTimeoutSeconds: 20,
        timeoutPolicy: 'RANDOM_PICK',
        starterMode: 'FIRST_SEAT',
        showLiveSelection: true,
      },
      version: roomVersion,
      lastActivityAt: '',
      expiresAt: '',
    },
    players: [],
    game: {
      id: 'game',
      roomId: 'room',
      roundNumber: 1,
      phase: 'PLAYING_TURN',
      lowerCandidate: 1,
      upperCandidate: 99,
      currentPlayerId: 'self',
      startingPlayerId: 'self',
      turnNumber: 1,
      version: gameVersion,
      turnStartedAt: '',
      turnDeadlineAt: '',
      pending: null,
      lastLockedNumber: null,
      lastActorPlayerId: null,
      lastActionOrigin: null,
      lastOutcome: null,
      loserPlayerId: null,
      finishReason: null,
      revealedBombNumber: null,
      updatedAt: '',
      finishedAt: null,
    },
    gamePlayers: [],
    action: null,
  }
}

describe('canonical online version reducer', () => {
  it('hydrates independent room and game versions from a snapshot', () => {
    expect(reduceCanonicalVersion(emptyCanonicalOnlineState, {
      kind: 'SNAPSHOT',
      snapshot: snapshot(4, 9),
    })).toMatchObject({ roomVersion: 4, gameVersion: 9, needsSnapshot: false })
  })

  it('ignores stale signals and requests repair for newer signals', () => {
    const hydrated = reduceCanonicalVersion(emptyCanonicalOnlineState, {
      kind: 'SNAPSHOT',
      snapshot: snapshot(4, 9),
    })
    expect(reduceCanonicalVersion(hydrated, { kind: 'GAME_VERSION', version: 9 })).toBe(hydrated)
    expect(reduceCanonicalVersion(hydrated, { kind: 'ROOM_VERSION', version: 6 }).needsSnapshot).toBe(true)
  })

  it('never downgrades canonical state or drops it for a network envelope', () => {
    const current = snapshot(8, 13)
    expect(reconcileCanonicalSnapshot(current, snapshot(8, 13))).toBe(current)
    const olderRoomNewerGame = reconcileCanonicalSnapshot(current, snapshot(7, 99))
    expect(olderRoomNewerGame.room?.version).toBe(8)
    expect(olderRoomNewerGame.game?.version).toBe(99)
    expect(shouldApplyCanonicalSnapshot(current, snapshot(8, 12))).toBe(false)
    expect(shouldApplyCanonicalSnapshot(current, snapshot(8, 14))).toBe(true)
    expect(shouldApplyCanonicalSnapshot(current, snapshot(9, 1))).toBe(true)
    expect(shouldApplyCanonicalSnapshot(current, {
      ...snapshot(0, 0),
      ok: false,
      code: 'ONLINE_UNAVAILABLE',
      room: null,
      game: null,
    })).toBe(false)
  })

  it('reconciles room and game version axes without allowing either to regress', () => {
    const current = snapshot(8, 13)
    const newerRoomOlderGame = snapshot(9, 12)
    newerRoomOlderGame.players = [{
      id: 'peer',
      roomId: 'room',
      nickname: 'Peer',
      seat: 2,
      membershipStatus: 'ACTIVE',
      joinedAt: '',
      lastSeenAt: '',
    }]

    const reconciledRoom = reconcileCanonicalSnapshot(current, newerRoomOlderGame)
    expect(reconciledRoom.room?.version).toBe(9)
    expect(reconciledRoom.players).toHaveLength(1)
    expect(reconciledRoom.game?.version).toBe(13)

    const olderRoomNewerGame = snapshot(7, 14)
    const reconciledGame = reconcileCanonicalSnapshot(reconciledRoom, olderRoomNewerGame)
    expect(reconciledGame.room?.version).toBe(9)
    expect(reconciledGame.players).toHaveLength(1)
    expect(reconciledGame.game?.version).toBe(14)
  })

  it('accepts same-version auxiliary membership freshness without rerendering identical payloads', () => {
    const current = snapshot(8, 13)
    current.players = [{
      id: 'peer',
      roomId: 'room',
      nickname: 'Peer',
      seat: 2,
      membershipStatus: 'ACTIVE',
      joinedAt: '',
      lastSeenAt: '2026-08-25T00:00:00.000Z',
    }]
    expect(reconcileCanonicalSnapshot(current, structuredClone(current))).toBe(current)

    const touched = structuredClone(current)
    touched.players[0].lastSeenAt = '2026-08-25T00:00:15.000Z'
    expect(reconcileCanonicalSnapshot(current, touched)).toBe(touched)
  })

  it('accepts canonical game creation/removal only with a newer room transition', () => {
    const playing = snapshot(8, 13)
    const lobby = { ...snapshot(9, 0), game: null }
    expect(reconcileCanonicalSnapshot(playing, lobby)).toBe(lobby)

    const staleLobby = { ...snapshot(8, 0), game: null }
    expect(reconcileCanonicalSnapshot(playing, staleLobby)).toBe(playing)

    const newerRound = snapshot(10, 1)
    newerRound.game = { ...newerRound.game!, id: 'next-game' }
    expect(reconcileCanonicalSnapshot(playing, newerRound)).toBe(newerRound)
  })
})
