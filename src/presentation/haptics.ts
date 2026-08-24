export type HapticCue = 'select' | 'lock' | 'safe' | 'boom' | 'boomSpectator'

export type HapticPattern = number | number[]

export interface VibrationTarget {
  vibrate: (pattern: HapticPattern) => boolean
}

export const HAPTIC_PATTERNS = {
  select: 10,
  lock: 28,
  safe: [16, 32, 16],
  boom: [70, 30, 120],
  boomSpectator: [30, 25, 45],
} as const

function getDefaultTarget(): VibrationTarget | undefined {
  if (typeof navigator === 'undefined') return undefined
  return navigator
}

export function isHapticsSupported(
  target: Partial<VibrationTarget> | null | undefined = getDefaultTarget(),
): target is VibrationTarget {
  return typeof target?.vibrate === 'function'
}

export function playHaptic(
  cue: HapticCue,
  target: Partial<VibrationTarget> | null | undefined = getDefaultTarget(),
): boolean {
  if (!isHapticsSupported(target)) return false

  const pattern = HAPTIC_PATTERNS[cue]
  const safePattern: HapticPattern =
    typeof pattern === 'number' ? pattern : Array.from(pattern)

  try {
    return target.vibrate(safePattern)
  } catch {
    return false
  }
}

export function stopHaptics(
  target: Partial<VibrationTarget> | null | undefined = getDefaultTarget(),
): boolean {
  if (!isHapticsSupported(target)) return false

  try {
    return target.vibrate(0)
  } catch {
    return false
  }
}
