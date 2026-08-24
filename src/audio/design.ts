import type { TensionProfile } from '../presentation/tension'
import type { ExplosionAudioProfile } from './contract'

export const MASTER_DYNAMICS = {
  masterGain: 0.95,
  safetyGain: 1.0,

  compressor: {
    threshold: -10,
    knee: 10,
    ratio: 3,
    attack: 0.01,
    release: 0.18,
  },

  limiter: {
    threshold: -1,
    knee: 0,
    ratio: 20,
    attack: 0.001,
    release: 0.1,
  },
} as const

export const INTERACTION_SFX = {
  selection: {
    snapFrequency: 1_650,
    snapVolume: 0.1,

    bodyFrequency: 780,
    bodyVolume: 0.045,
    bodyDuration: 0.055,
  },

  lock: {
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
  },
} as const

export const BOOM_MIX = {
  transient: {
    duration: 0.068,
    startFrequency: 4_200,
    endFrequency: 1_450,
    volume: 0.68,
  },

  audibleBody: {
    startFrequency: 172,
    endFrequency: 86,
    duration: 0.46,
    volume: 0.62,
  },

  subImpact: {
    startFrequency: 60,
    endFrequency: 35,
    duration: 0.82,
    volume: 0.56,
  },

  midDestruction: {
    startFrequency: 940,
    endFrequency: 270,
    duration: 0.46,
    volume: 0.46,
  },

  electricalFailure: {
    delay: 0.052,
    startFrequency: 3_800,
    endFrequency: 980,
    duration: 0.3,
    volume: 0.36,
  },

  tail: {
    delay: 0.085,
    startFrequency: 620,
    endFrequency: 96,
    duration: 1.34,
    volume: 0.4,
  },

  aftermath: {
    initialCutoff: 1_500,
    muffledCutoff: 430,
    recoveryCutoff: 780,
    duration: 1.5,
  },

  ringing: {
    delay: 0.14,
    duration: 1.74,
    busGain: 0.034,

    frequencies: [3_120, 3_228, 6_280],
    partialGains: [1, 0.46, 0.08],
    driftHz: [-54, 38, -72],

    flutterFrequency: 5.4,
    flutterDepth: 0.002,
  },
} as const

export const EXPLOSION_PRESENTATION_MIX = {
  victim: {
    perceivedImpact: 1,
    transient: 1,
    audibleBody: 1,
    subImpact: 1,
    destruction: 1,
    electrical: 1,
    tail: 1,
    muffledAftermath: true,
    ringing: true,
  },
  spectator: {
    perceivedImpact: 0.45,
    transient: 0.45,
    audibleBody: 0.4,
    subImpact: 0.3,
    destruction: 0.4,
    electrical: 0.4,
    tail: 0.35,
    muffledAftermath: false,
    ringing: false,
  },
} as const

export function getInteractionSfxMix(profile: TensionProfile) {
  return {
    selection: {
      multiplier: profile.audio.selectionMultiplier,
      snapVolume: INTERACTION_SFX.selection.snapVolume * profile.audio.selectionMultiplier,
      bodyVolume: INTERACTION_SFX.selection.bodyVolume * profile.audio.selectionMultiplier,
    },
    lock: {
      multiplier: profile.audio.lockMultiplier,
      snapVolume: INTERACTION_SFX.lock.snapVolume * profile.audio.lockMultiplier,
      bodyVolume: INTERACTION_SFX.lock.bodyVolume * profile.audio.lockMultiplier,
      lowVolume: INTERACTION_SFX.lock.lowVolume * profile.audio.lockMultiplier,
      secondaryVolume: INTERACTION_SFX.lock.secondaryVolume * profile.audio.lockMultiplier,
    },
  }
}

export function getBoomImpactGain(profile: TensionProfile): number {
  return profile.audio.boomImpactGain
}

export function getExplosionPresentationMix(
  profile: TensionProfile,
  presentation: ExplosionAudioProfile,
) {
  const mix = EXPLOSION_PRESENTATION_MIX[presentation]
  return {
    ...mix,
    impactGain: getBoomImpactGain(profile) * mix.perceivedImpact,
  }
}

export function getHeartbeatDubDelay(heartbeatBpm: number): number {
  return Math.max(112, Math.min(150, 164 - heartbeatBpm * 0.45))
}
