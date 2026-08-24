import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  isHapticsSupported,
  playHaptic,
  stopHaptics,
  type HapticCue,
} from './haptics'

const HAPTICS_STORAGE_KEY = 'bom-so:haptics'

function getInitialHapticsPreference(): boolean {
  try {
    return window.localStorage.getItem(HAPTICS_STORAGE_KEY) !== 'false'
  } catch {
    return true
  }
}

export interface GameHapticsControls {
  supported: boolean
  enabled: boolean
  toggleEnabled: () => void
  triggerHaptic: (cue: HapticCue) => boolean
  cancelHaptics: () => boolean
}

export function useGameHaptics(): GameHapticsControls {
  const [supported] = useState(() => isHapticsSupported())
  const [enabled, setEnabled] = useState(getInitialHapticsPreference)

  useEffect(() => {
    try {
      window.localStorage.setItem(HAPTICS_STORAGE_KEY, String(enabled))
    } catch {
      // The game still works when storage is unavailable.
    }
  }, [enabled])

  const cancelHaptics = useCallback(() => {
    if (!supported) return false
    return stopHaptics()
  }, [supported])

  const toggleEnabled = useCallback(() => {
    if (!supported) return
    if (enabled) cancelHaptics()
    setEnabled(!enabled)
  }, [cancelHaptics, enabled, supported])

  const triggerHaptic = useCallback(
    (cue: HapticCue) => {
      if (!supported || !enabled) return false
      return playHaptic(cue)
    },
    [enabled, supported],
  )

  return useMemo(
    () => ({
      supported,
      enabled,
      toggleEnabled,
      triggerHaptic,
      cancelHaptics,
    }),
    [cancelHaptics, enabled, supported, toggleEnabled, triggerHaptic],
  )
}
