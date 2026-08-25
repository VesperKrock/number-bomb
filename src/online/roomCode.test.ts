import { describe, expect, it } from 'vitest'
import {
  createRoomJoinUrl,
  getDeepLinkedRoomCode,
  isValidRoomCode,
  normalizeRoomCode,
} from './roomCode'

describe('online room code contract', () => {
  it('normalizes surrounding whitespace and case', () => {
    expect(normalizeRoomCode('  k7x4p\n')).toBe('K7X4P')
  })

  it('accepts only the canonical five-symbol alphabet', () => {
    expect(isValidRoomCode('K7X4P')).toBe(true)
    expect(isValidRoomCode('K7I4P')).toBe(false)
    expect(isValidRoomCode('K7X4')).toBe(false)
    expect(isValidRoomCode('K7X40')).toBe(false)
  })

  it('builds a Pages-safe deep link without hardcoding a host', () => {
    expect(
      createRoomJoinUrl('k7x4p', 'https://example.test', '/number-bomb/').toString(),
    ).toBe('https://example.test/number-bomb/?room=K7X4P')
  })

  it('reads only valid deep-linked codes', () => {
    expect(getDeepLinkedRoomCode('?room=k7x4p')).toBe('K7X4P')
    expect(getDeepLinkedRoomCode('?room=invalid')).toBeNull()
  })
})
