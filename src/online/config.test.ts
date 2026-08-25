import { describe, expect, it } from 'vitest'
import { parseOnlineConfig } from './config'

describe('optional Supabase configuration', () => {
  it('disables online cleanly when env values are absent', () => {
    expect(parseOnlineConfig(undefined, undefined)).toEqual({
      available: false,
      config: null,
      reason: 'MISSING_ENV',
    })
  })

  it('accepts browser-safe publishable and legacy anon keys', () => {
    expect(parseOnlineConfig('https://demo.supabase.co/', 'sb_publishable_test')).toEqual({
      available: true,
      config: {
        url: 'https://demo.supabase.co',
        publishableKey: 'sb_publishable_test',
      },
      reason: 'READY',
    })
    expect(parseOnlineConfig('http://127.0.0.1:56321', 'one.two.three').available).toBe(true)
  })

  it('rejects unsafe or malformed values without throwing', () => {
    expect(parseOnlineConfig('http://remote.example', 'sb_publishable_test').reason).toBe('INVALID_URL')
    expect(parseOnlineConfig('ftp://localhost', 'sb_publishable_test').reason).toBe('INVALID_URL')
    expect(parseOnlineConfig('https://demo.supabase.co/path', 'sb_publishable_test').reason).toBe('INVALID_URL')
    expect(parseOnlineConfig('https://demo.supabase.co', 'private-secret').reason).toBe('INVALID_KEY')
  })
})
