import { describe, expect, it } from 'vitest'
import { normalizeNickname, validateNickname } from './nickname'

describe('online nickname contract', () => {
  it('trims and collapses whitespace runs', () => {
    expect(normalizeNickname('  Thiên\t\n  An  ')).toBe('Thiên An')
  })

  it('accepts one to twenty Unicode code points', () => {
    expect(validateNickname('Người chơi ①')).toEqual({
      ok: true,
      nickname: 'Người chơi ①',
      nicknameKey: 'người chơi ①',
    })
    expect(validateNickname('😀'.repeat(20)).ok).toBe(true)
  })

  it('rejects empty, too-long, and remaining control characters', () => {
    expect(validateNickname('   ')).toEqual({ ok: false, code: 'INVALID_NICKNAME' })
    expect(validateNickname('a'.repeat(21))).toEqual({ ok: false, code: 'INVALID_NICKNAME' })
    expect(validateNickname(`An${String.fromCharCode(0)}Na`)).toEqual({
      ok: false,
      code: 'INVALID_NICKNAME',
    })
  })
})
