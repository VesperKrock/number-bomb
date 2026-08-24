import { describe, expect, it } from 'vitest'
import type { OnlineRpcResult } from '../types'
import {
  emptyCanonicalOnlineState,
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
    expect(shouldApplyCanonicalSnapshot(current, snapshot(7, 99))).toBe(false)
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
})
