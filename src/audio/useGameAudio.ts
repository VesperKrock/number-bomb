import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { TensionProfile } from '../presentation/tension'
import { GameAudio } from './GameAudio'
import {
  GAME_AUDIO_CONTRACT_VERSION,
  type GameAudioControls,
} from './contract'

export type { GameAudioControls } from './contract'

const MUTE_STORAGE_KEY = 'bom-so:muted'

function getInitialMutePreference() {
  try {
    return window.localStorage.getItem(MUTE_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

interface AudioManagerSlot {
  contractVersion: typeof GAME_AUDIO_CONTRACT_VERSION
  manager: GameAudio
}

function isCurrentManagerSlot(value: unknown): value is AudioManagerSlot {
  if (typeof value !== 'object' || value === null) return false
  const slot = value as Partial<AudioManagerSlot>
  return slot.contractVersion === GAME_AUDIO_CONTRACT_VERSION && slot.manager instanceof GameAudio
}

function disposeRetainedAudio(value: unknown) {
  if (typeof value !== 'object' || value === null) return
  const retained = value as { manager?: unknown; destroy?: unknown }
  const possibleManager = retained.manager ?? value
  if (typeof possibleManager !== 'object' || possibleManager === null) return
  const destroy = (possibleManager as { destroy?: unknown }).destroy
  if (typeof destroy === 'function') destroy.call(possibleManager)
}

function restoreCurrentManagerSlot(value: unknown): AudioManagerSlot {
  if (isCurrentManagerSlot(value)) return value
  disposeRetainedAudio(value)
  return {
    contractVersion: GAME_AUDIO_CONTRACT_VERSION,
    manager: new GameAudio(),
  }
}

export function useGameAudio(): GameAudioControls {
  const managerRef = useRef<unknown>(null)
  const managerSlot = restoreCurrentManagerSlot(managerRef.current)
  managerRef.current = managerSlot
  const manager = managerSlot.manager
  const [muted, setMuted] = useState(getInitialMutePreference)

  useEffect(() => {
    manager.setMuted(muted)
    try {
      window.localStorage.setItem(MUTE_STORAGE_KEY, String(muted))
    } catch {
      // The game still works when storage is unavailable.
    }
  }, [manager, muted])

  useEffect(() => () => manager.destroy(), [manager])

  const toggleMuted = useCallback(() => {
    const nextMuted = !muted
    manager.setMuted(nextMuted)
    if (!nextMuted) void manager.unlock()
    setMuted(nextMuted)
  }, [manager, muted])
  const unlock = useCallback(() => manager.unlock(), [manager])
  const playSelection = useCallback(
    (profile: TensionProfile) => manager.playSelection(profile),
    [manager],
  )
  const playLock = useCallback(
    (profile: TensionProfile) => manager.playLock(profile),
    [manager],
  )
  const playSafe = useCallback(() => manager.playSafe(), [manager])
  const playExplosion = useCallback(
    (profile: TensionProfile) => manager.playExplosion(profile),
    [manager],
  )
  const startSoundscape = useCallback(
    (profile: TensionProfile) => manager.startSoundscape(profile),
    [manager],
  )
  const duckSoundscape = useCallback(() => manager.duckSoundscape(), [manager])
  const stopSoundscape = useCallback(() => manager.stopSoundscape(), [manager])
  const cleanupSession = useCallback(() => manager.cleanupSession(), [manager])

  useEffect(() => {
    if (import.meta.env.VITE_E2E_AUDIO_DIAGNOSTICS !== '1') return
    const testWindow = window as typeof window & {
      __BOM_SO_AUDIO_DIAGNOSTICS__?: () => ReturnType<GameAudio['getDiagnostics']>
    }
    testWindow.__BOM_SO_AUDIO_DIAGNOSTICS__ = () => manager.getDiagnostics()
    return () => {
      delete testWindow.__BOM_SO_AUDIO_DIAGNOSTICS__
    }
  }, [manager])

  return useMemo(
    () => ({
      contractVersion: GAME_AUDIO_CONTRACT_VERSION,
      muted,
      toggleMuted,
      unlock,
      playSelection,
      playLock,
      playSafe,
      playExplosion,
      startSoundscape,
      duckSoundscape,
      stopSoundscape,
      cleanupSession,
    }) satisfies GameAudioControls,
    [
      muted,
      toggleMuted,
      unlock,
      playSelection,
      playLock,
      playSafe,
      playExplosion,
      startSoundscape,
      duckSoundscape,
      stopSoundscape,
      cleanupSession,
    ],
  )
}
