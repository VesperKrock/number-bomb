import { describe, expect, it } from 'vitest'
import { getTensionProfile } from '../presentation/tension'
import {
  BOOM_MIX,
  EXPLOSION_PRESENTATION_MIX,
  INTERACTION_SFX,
  MASTER_DYNAMICS,
  getBoomImpactGain,
  getExplosionPresentationMix,
  getHeartbeatDubDelay,
  getInteractionSfxMix,
} from './design'

describe('controlled audio product design', () => {
  it('defines a full-spectrum BOOM with a laptop body and headphone sub layer', () => {
    expect(BOOM_MIX.transient.startFrequency).toBeGreaterThanOrEqual(1_000)
    expect(BOOM_MIX.audibleBody.startFrequency).toBeGreaterThanOrEqual(80)
    expect(BOOM_MIX.audibleBody.startFrequency).toBeLessThanOrEqual(180)
    expect(BOOM_MIX.subImpact.startFrequency).toBeLessThanOrEqual(60)
    expect(BOOM_MIX.midDestruction.startFrequency).toBeGreaterThanOrEqual(250)
    expect(BOOM_MIX.electricalFailure.startFrequency).toBeGreaterThan(1_000)
    expect(BOOM_MIX.tail.duration).toBeGreaterThanOrEqual(0.8)
    expect(BOOM_MIX.tail.duration).toBeLessThanOrEqual(1.5)
  })

  it('schedules controlled multi-part ringing after impact', () => {
    expect(BOOM_MIX.ringing.delay).toBeGreaterThanOrEqual(0.08)
    expect(BOOM_MIX.ringing.delay).toBeLessThanOrEqual(0.25)
    expect(BOOM_MIX.ringing.duration).toBeGreaterThanOrEqual(1.2)
    expect(BOOM_MIX.ringing.duration).toBeLessThanOrEqual(2)
    expect(BOOM_MIX.ringing.frequencies).toHaveLength(3)
    expect(BOOM_MIX.ringing.busGain).toBeLessThanOrEqual(0.04)
    expect(BOOM_MIX.ringing.partialGains[2]).toBeLessThan(0.1)
  })

  it('keeps LUB-DUB spacing organic across tension BPM values', () => {
    const delays = [48, 62, 78, 96].map(getHeartbeatDubDelay)
    expect(delays.every((delay) => delay >= 100 && delay <= 170)).toBe(true)
    expect(delays).toEqual([...delays].sort((left, right) => right - left))
  })

  it('uses the reduced NB-2M interaction baselines', () => {
    expect(INTERACTION_SFX.selection).toMatchObject({
      snapFrequency: 1_650,
      snapVolume: 0.1,
      bodyFrequency: 780,
      bodyVolume: 0.045,
      bodyDuration: 0.055,
    })
    expect(INTERACTION_SFX.lock).toMatchObject({
      snapFrequency: 2_400,
      snapVolume: 0.2,
      bodyFrequency: 920,
      bodyVolume: 0.11,
      bodyDuration: 0.09,
      lowFrequency: 210,
      lowVolume: 0.075,
      lowDuration: 0.11,
      secondaryFrequency: 560,
      secondaryVolume: 0.06,
      secondaryDelayMs: 72,
    })
  })

  it('recedes Select and LOCK while modestly escalating BOOM by shared tension', () => {
    const profiles = [99, 23, 10, 5, 3].map(getTensionProfile)
    const mixes = profiles.map(getInteractionSfxMix)

    expect(mixes.map(({ selection }) => selection.multiplier)).toEqual([
      1,
      0.9,
      0.75,
      0.55,
      0.35,
    ])
    expect(mixes.map(({ lock }) => lock.multiplier)).toEqual([1, 0.9, 0.78, 0.62, 0.45])
    expect(profiles.map(getBoomImpactGain)).toEqual([1.65, 1.7, 1.75, 1.8, 1.85])

    expect(mixes[0].selection.snapVolume).toBeCloseTo(0.1)
    expect(mixes[4].selection.snapVolume).toBeCloseTo(0.035)
    expect(mixes[0].lock.snapVolume).toBeCloseTo(0.2)
    expect(mixes[4].lock.snapVolume).toBeCloseTo(0.09)
  })

  it('keeps ringing independent from the adaptive BOOM impact bus', () => {
    expect(BOOM_MIX.ringing.busGain).toBe(0.034)
  })

  it('uses a dedicated spectator mix without ringing or aggressive aftermath', () => {
    expect(EXPLOSION_PRESENTATION_MIX.spectator).toMatchObject({
      perceivedImpact: 0.45,
      transient: 0.45,
      audibleBody: 0.4,
      subImpact: 0.3,
      tail: 0.35,
      muffledAftermath: false,
      ringing: false,
    })
    expect(EXPLOSION_PRESENTATION_MIX.victim).toMatchObject({
      perceivedImpact: 1,
      muffledAftermath: true,
      ringing: true,
    })

    const profile = getTensionProfile(5)
    expect(getExplosionPresentationMix(profile, 'victim').impactGain).toBe(1.8)
    expect(getExplosionPresentationMix(profile, 'spectator').impactGain).toBeCloseTo(0.81)
  })

  it('reserves headroom and caps the final graph with a limiter', () => {
    expect(MASTER_DYNAMICS.masterGain).toBeLessThan(1)
    expect(MASTER_DYNAMICS.safetyGain).toBeLessThanOrEqual(1)
    expect(MASTER_DYNAMICS.limiter.threshold).toBeLessThanOrEqual(-1)
    expect(MASTER_DYNAMICS.limiter.ratio).toBeGreaterThanOrEqual(12)
    expect(MASTER_DYNAMICS.limiter.attack).toBeLessThanOrEqual(0.003)
  })
})
