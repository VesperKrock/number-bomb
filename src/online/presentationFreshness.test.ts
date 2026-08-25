import { describe, expect, it } from 'vitest'
import { isLivePresentationFresh, LIVE_PRESENTATION_WINDOW_MS } from './presentationFreshness'

describe('online presentation freshness', () => {
  const updatedAt = '2026-08-25T00:00:00.000Z'
  const updatedAtMs = Date.parse(updatedAt)

  it('allows truthful recent canonical transitions', () => {
    expect(isLivePresentationFresh('SAFE', updatedAt, updatedAtMs + 500)).toBe(true)
    expect(isLivePresentationFresh('BOOM', updatedAt, updatedAtMs + 1_500)).toBe(true)
  })

  it('rejects hydrated old outcomes and malformed timestamps', () => {
    expect(isLivePresentationFresh(
      'SAFE',
      updatedAt,
      updatedAtMs + LIVE_PRESENTATION_WINDOW_MS.SAFE + 1,
    )).toBe(false)
    expect(isLivePresentationFresh('BOOM', 'not-a-date', updatedAtMs)).toBe(false)
  })
})
