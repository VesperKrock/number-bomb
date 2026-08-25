import { describe, expect, it } from 'vitest'
import { PresentationLedger, presentationKey } from './presentationLedger'

describe('online presentation ledger', () => {
  it('consumes each canonical game/version/presentation once', () => {
    const ledger = new PresentationLedger()
    const key = presentationKey('game', 4, 'BOOM')
    expect(ledger.consume(key)).toBe(true)
    expect(ledger.consume(key)).toBe(false)
    expect(ledger.has(key)).toBe(true)
  })

  it('can be reset on room teardown', () => {
    const ledger = new PresentationLedger()
    const key = presentationKey('game', 4, 'SAFE')
    ledger.consume(key)
    ledger.clear()
    expect(ledger.consume(key)).toBe(true)
  })
})
