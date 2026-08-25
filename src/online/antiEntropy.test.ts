import { describe, expect, it } from 'vitest'
import {
  getAntiEntropyPhase,
  getAntiEntropyPolicy,
  getMaximumSnapshotRequestsPerMinute,
} from './antiEntropy'

describe('online anti-entropy policy', () => {
  it('defines explicit bounded convergence for every canonical phase', () => {
    expect(getAntiEntropyPhase(null)).toBe('LOBBY')
    expect(getAntiEntropyPhase('PLAYING_TURN')).toBe('PLAYING_TURN')

    expect(getAntiEntropyPolicy('LOBBY')).toEqual({
      intervalMs: 3_000,
      convergenceBoundMs: 4_000,
    })
    expect(getAntiEntropyPolicy('PLAYING_TURN').convergenceBoundMs).toBe(4_000)
    expect(getAntiEntropyPolicy('RESOLVING').convergenceBoundMs).toBe(2_000)
    expect(getAntiEntropyPolicy('FINISHED').convergenceBoundMs).toBe(6_000)
  })

  it('keeps the production request budget low and uses shorter deterministic E2E intervals', () => {
    expect(getMaximumSnapshotRequestsPerMinute('LOBBY')).toBe(20)
    expect(getMaximumSnapshotRequestsPerMinute('PLAYING_TURN')).toBe(20)
    expect(getMaximumSnapshotRequestsPerMinute('RESOLVING')).toBe(60)
    expect(getMaximumSnapshotRequestsPerMinute('FINISHED')).toBe(12)
    expect(getAntiEntropyPolicy('PLAYING_TURN', true).intervalMs).toBe(400)
  })
})
