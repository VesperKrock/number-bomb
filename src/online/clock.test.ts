import { describe, expect, it } from 'vitest'
import { createClockSample, medianOffset, ServerClock } from './clock'

describe('server clock estimator', () => {
  it('uses the request midpoint for an RTT sample', () => {
    expect(createClockSample(1_000, 1_200, new Date(1_600).toISOString())).toEqual({
      offsetMs: 500,
      roundTripMs: 200,
      sampledAtMs: 1_200,
    })
  })

  it('uses the median and retains only the latest five samples', () => {
    const clock = new ServerClock()
    for (const offset of [10, 20, 2_000, 30, 40, 50]) {
      clock.addSample(1_000, 1_000, new Date(1_000 + offset).toISOString())
    }
    expect(clock.offsetMs).toBe(40)
    expect(medianOffset([{ offsetMs: 10, roundTripMs: 0, sampledAtMs: 0 }, {
      offsetMs: 20,
      roundTripMs: 0,
      sampledAtMs: 0,
    }])).toBe(15)
  })

  it('renders a non-negative server-authoritative countdown', () => {
    const clock = new ServerClock()
    clock.addSample(1_000, 1_200, new Date(1_600).toISOString())
    expect(clock.remainingSeconds(new Date(4_050).toISOString(), 2_500)).toBe(2)
    expect(clock.remainingSeconds(new Date(2_000).toISOString(), 2_500)).toBe(0)
  })

  it('ignores malformed timing samples', () => {
    const clock = new ServerClock()
    clock.addSample(2_000, 1_000, new Date(3_000).toISOString())
    clock.addSample(1_000, 1_100, 'not-a-date')
    expect(clock.offsetMs).toBe(0)
  })
})
