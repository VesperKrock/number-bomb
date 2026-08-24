import { describe, expect, it } from 'vitest'
import type { OnlineGameState, OnlinePlayer, OnlineRoom } from '../types'
import { isValidProvisionalSelection } from './provisional'

const room: OnlineRoom = {
  id: 'room',
  code: 'K7X4P',
  status: 'PLAYING',
  hostPlayerId: 'actor',
  settings: {
    maxPlayers: 2,
    turnTimeoutSeconds: 20,
    timeoutPolicy: 'RANDOM_PICK',
    starterMode: 'FIRST_SEAT',
    showLiveSelection: true,
  },
  version: 3,
  lastActivityAt: '',
  expiresAt: '',
}

const game: OnlineGameState = {
  id: 'game',
  roomId: 'room',
  roundNumber: 1,
  phase: 'PLAYING_TURN',
  lowerCandidate: 40,
  upperCandidate: 60,
  currentPlayerId: 'actor',
  startingPlayerId: 'actor',
  turnNumber: 2,
  version: 7,
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
}

const players: OnlinePlayer[] = [{
  id: 'actor',
  roomId: 'room',
  nickname: 'Actor',
  seat: 1,
  membershipStatus: 'ACTIVE',
  joinedAt: '',
  lastSeenAt: '',
}]

describe('provisional selection validation', () => {
  it('accepts a fresh monotonic event from the canonical actor', () => {
    const now = Date.now()
    expect(isValidProvisionalSelection({
      v: 1,
      roomId: 'room',
      gameId: 'game',
      gameVersion: 7,
      playerId: 'actor',
      candidate: 55,
      clientSeq: 4,
      sentAt: new Date(now).toISOString(),
    }, { room, game, players, lastClientSeq: 3, receivedAtMs: now })).toBe(true)
  })

  it('rejects stale, out-of-range, wrong-version, and privacy-disabled events', () => {
    const now = Date.now()
    const event = {
      v: 1 as const,
      roomId: 'room',
      gameId: 'game',
      gameVersion: 7,
      playerId: 'actor',
      candidate: 55,
      clientSeq: 4,
      sentAt: new Date(now).toISOString(),
    }
    const context = { room, game, players, lastClientSeq: 3, receivedAtMs: now }
    expect(isValidProvisionalSelection({ ...event, candidate: 61 }, context)).toBe(false)
    expect(isValidProvisionalSelection({ ...event, gameVersion: 8 }, context)).toBe(false)
    expect(isValidProvisionalSelection({ ...event, clientSeq: 3 }, context)).toBe(false)
    expect(isValidProvisionalSelection({ ...event, sentAt: new Date(now - 5_001).toISOString() }, context)).toBe(false)
    expect(isValidProvisionalSelection(event, {
      ...context,
      room: { ...room, settings: { ...room.settings, showLiveSelection: false } },
    })).toBe(false)
  })
})
