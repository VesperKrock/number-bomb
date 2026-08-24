import { describe, expect, it, vi } from 'vitest'
import {
  HAPTIC_PATTERNS,
  isHapticsSupported,
  playHaptic,
  stopHaptics,
  type HapticCue,
  type HapticPattern,
} from './haptics'

describe('semantic mobile haptics', () => {
  it('uses the restrained NB-2R event patterns', () => {
    expect(HAPTIC_PATTERNS).toEqual({
      select: 10,
      lock: 28,
      safe: [16, 32, 16],
      boom: [70, 30, 120],
    })
  })

  it('feature-detects vibration support without user-agent checks', () => {
    expect(isHapticsSupported(undefined)).toBe(false)
    expect(isHapticsSupported({})).toBe(false)
    expect(isHapticsSupported({ vibrate: () => true })).toBe(true)
  })

  it.each([
    ['select', 10],
    ['lock', 28],
    ['safe', [16, 32, 16]],
    ['boom', [70, 30, 120]],
  ] as const)('sends %s only as its semantic event pattern', (cue, expectedPattern) => {
    const vibrate = vi.fn<(pattern: HapticPattern) => boolean>(() => true)

    expect(playHaptic(cue as HapticCue, { vibrate })).toBe(true)
    expect(vibrate).toHaveBeenCalledOnce()
    expect(vibrate).toHaveBeenCalledWith(expectedPattern)
  })

  it('cancels an active pattern explicitly with zero', () => {
    const vibrate = vi.fn<(pattern: HapticPattern) => boolean>(() => true)

    expect(stopHaptics({ vibrate })).toBe(true)
    expect(vibrate).toHaveBeenCalledWith(0)
  })

  it('is a safe no-op when unsupported or when the implementation rejects vibration', () => {
    expect(playHaptic('boom', undefined)).toBe(false)
    expect(stopHaptics(undefined)).toBe(false)

    const rejectingTarget = {
      vibrate: () => {
        throw new Error('blocked')
      },
    }
    expect(playHaptic('select', rejectingTarget)).toBe(false)
    expect(stopHaptics(rejectingTarget)).toBe(false)
  })
})
