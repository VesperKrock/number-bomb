import { describe, expect, it } from 'vitest'
import { getBoardDensity, getTensionProfile } from './tension'
import { getResolutionDelayRange, getSuspenseDuration } from './timings'

describe('shared tension model', () => {
  it.each([
    [99, 'calm', 'compact'],
    [31, 'calm', 'compact'],
    [30, 'uneasy', 'focused'],
    [16, 'uneasy', 'focused'],
    [15, 'danger', 'danger'],
    [8, 'danger', 'danger'],
    [7, 'critical', 'critical'],
    [4, 'critical', 'critical'],
    [3, 'terminal', 'terminal'],
    [1, 'terminal', 'terminal'],
  ] as const)('maps %i candidates to %s tension and %s density', (count, level, density) => {
    expect(getTensionProfile(count).level).toBe(level)
    expect(getBoardDensity(count)).toBe(density)
  })

  it('escalates drone, texture, and heartbeat parameters as choices shrink', () => {
    const profiles = [99, 23, 10, 5, 3].map(getTensionProfile)

    expect(profiles.map(({ audio }) => audio.droneGain)).toEqual([
      0.009,
      0.0115,
      0.015,
      0.019,
      0.022,
    ])
    expect(profiles.map(({ audio }) => audio.bodyFrequency)).toEqual([92, 94, 96, 98, 101])
    expect(profiles.map(({ audio }) => audio.heartbeatBpm)).toEqual([0, 48, 62, 78, 96])
    expect(profiles.map(({ audio }) => audio.textureMinDelayMs)).toEqual([
      4_000,
      2_800,
      1_800,
      950,
      650,
    ])
  })

  it.each([
    [99, 450, 550],
    [23, 520, 640],
    [10, 600, 740],
    [5, 700, 860],
    [3, 820, 1_000],
  ] as const)(
    'keeps 1,000 deterministic samples inside the %i-candidate delay range',
    (count, expectedMin, expectedMax) => {
      const range = getResolutionDelayRange(count)
      expect(range).toEqual({ minMs: expectedMin, maxMs: expectedMax })

      let seed = count
      const deterministicRandom = () => {
        seed = (seed * 1_664_525 + 1_013_904_223) >>> 0
        return seed / 0x1_0000_0000
      }

      for (let sample = 0; sample < 1_000; sample += 1) {
        const delay = getSuspenseDuration(count, deterministicRandom)
        expect(delay).toBeGreaterThanOrEqual(expectedMin)
        expect(delay).toBeLessThanOrEqual(expectedMax)
      }

      expect(getSuspenseDuration(count, () => 0)).toBe(expectedMin)
      expect(getSuspenseDuration(count, () => 1)).toBe(expectedMax)
    },
  )

  it('meaningfully separates opening and terminal pacing', () => {
    expect(getResolutionDelayRange(99).maxMs).toBeLessThan(
      getResolutionDelayRange(3).minMs,
    )
  })

  it('uses one result-agnostic delay policy for SAFE and BOOM', () => {
    const sample = () => 0.37
    const safeCandidateCount = 3
    const boomCandidateCount = 3

    expect(getSuspenseDuration(safeCandidateCount, sample)).toBe(
      getSuspenseDuration(boomCandidateCount, sample),
    )
  })
})
