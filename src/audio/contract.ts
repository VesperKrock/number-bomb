import type { TensionProfile } from '../presentation/tension'

export const GAME_AUDIO_CONTRACT_VERSION = 'nb-2m-v1' as const

export interface GameAudioLifecycle {
  startSoundscape: (profile: TensionProfile) => void
  duckSoundscape: () => void
  stopSoundscape: () => void
  cleanupSession: () => void
}

export interface GameAudioControls extends GameAudioLifecycle {
  contractVersion: typeof GAME_AUDIO_CONTRACT_VERSION
  muted: boolean
  toggleMuted: () => void
  unlock: () => Promise<void>
  playSelection: (profile: TensionProfile) => void
  playLock: (profile: TensionProfile) => void
  playSafe: () => void
  playExplosion: (profile: TensionProfile) => void
}

export interface GameAudioDiagnostics {
  soundscapeSources: number
  soundscapeTransientSources: number
  activeEffectSources: number
  activeRingingSources: number
  pendingEffectTimers: number
  activeSoundscapeTimers: number
  releasePending: boolean
  contextState: AudioContextState | 'none'
  lastSelectionMultiplier: number | null
  lastLockMultiplier: number | null
  lastBoomImpactGain: number | null
}
