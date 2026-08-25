import { describe, expect, it } from 'vitest'
import { PresentationLedger, presentationKey } from '../presentationLedger'
import {
  appendLiveGameTransition,
  parseLiveGameTransition,
  parseRealtimeGameState,
} from './liveGameTransition'

function gameRow(version: number, phase: string, outcome: string | null = null) {
  return {
    id: 'game',
    room_id: 'room',
    version,
    phase,
    pending_locked_number: phase === 'RESOLVING' ? 25 : null,
    last_locked_number: phase === 'RESOLVING' ? null : 25,
    last_outcome: outcome,
    round_number: 1,
    lower_candidate: outcome === 'SAFE' ? 26 : 1,
    upper_candidate: 99,
    current_player_id: 'peer',
    starting_player_id: 'self',
    turn_number: version,
    turn_started_at: '2026-08-25T00:00:00.000Z',
    turn_deadline_at: '2026-08-25T00:00:20.000Z',
    pending_actor_player_id: phase === 'RESOLVING' ? 'self' : null,
    pending_action_origin: phase === 'RESOLVING' ? 'PLAYER_LOCK' : null,
    resolution_at: phase === 'RESOLVING' ? '2026-08-25T00:00:01.000Z' : null,
    last_actor_player_id: phase === 'RESOLVING' ? null : 'self',
    last_action_origin: phase === 'RESOLVING' ? null : 'PLAYER_LOCK',
    loser_player_id: null,
    finish_reason: null,
    revealed_bomb_number: null,
    updated_at: '2026-08-25T00:00:01.000Z',
    finished_at: null,
  }
}

describe('live canonical game transitions', () => {
  it('retains RESOLVING and finalized SAFE when a snapshot can jump to the final version', () => {
    const resolving = parseLiveGameTransition(gameRow(2, 'RESOLVING'))!
    const safe = parseLiveGameTransition(gameRow(3, 'PLAYING_TURN', 'SAFE'))!
    const transitions = appendLiveGameTransition(
      appendLiveGameTransition([], resolving),
      safe,
    )

    expect(transitions.map(({ version, kind }) => ({ version, kind }))).toEqual([
      { version: 2, kind: 'LOCK' },
      { version: 3, kind: 'SAFE' },
    ])
  })

  it('keeps duplicate and out-of-order finalized events harmless', () => {
    const safe = parseLiveGameTransition(gameRow(3, 'PLAYING_TURN', 'SAFE'))!
    const once = appendLiveGameTransition([], safe)
    expect(appendLiveGameTransition(once, safe)).toBe(once)
    expect(safe.lockedNumber).toBe(25)
  })

  it('presents finalized SAFE exactly once when the settled snapshot applies before its event', () => {
    const ledger = new PresentationLedger()
    const finalizedRow = gameRow(3, 'PLAYING_TURN', 'SAFE')
    const settledSnapshotGame = parseRealtimeGameState(finalizedRow)
    const safe = parseLiveGameTransition(finalizedRow)!
    const transitions = appendLiveGameTransition(
      appendLiveGameTransition([], safe),
      safe,
    )
    const key = presentationKey(safe.gameId, safe.version, safe.kind)

    expect(settledSnapshotGame?.version).toBe(3)
    expect(settledSnapshotGame?.phase).toBe('PLAYING_TURN')
    expect(transitions).toHaveLength(1)
    expect(ledger.consume(key)).toBe(true)
    expect(ledger.consume(key)).toBe(false)
  })

  it('does not create presentation events from hydrated ordinary turns', () => {
    expect(parseLiveGameTransition(gameRow(1, 'PLAYING_TURN'))).toBeNull()
  })

  it('parses a complete safe Postgres row as canonical game state', () => {
    expect(parseRealtimeGameState(gameRow(3, 'PLAYING_TURN', 'SAFE'))).toMatchObject({
      id: 'game',
      roomId: 'room',
      version: 3,
      phase: 'PLAYING_TURN',
      lowerCandidate: 26,
      lastOutcome: 'SAFE',
      lastLockedNumber: 25,
    })
  })
})
