import { getTensionProfile } from './tension'

export const SAFE_FEEDBACK_DURATION = 520

export function getResolutionDelayRange(candidateCount: number) {
  return getTensionProfile(candidateCount).resolutionDelay
}

export function getSuspenseDuration(
  candidateCount: number,
  random: () => number = Math.random,
): number {
  const { minMs, maxMs } = getResolutionDelayRange(candidateCount)
  const sampledValue = random()
  const boundedValue = Number.isFinite(sampledValue)
    ? Math.min(1, Math.max(0, sampledValue))
    : 0.5

  return Math.round(minMs + boundedValue * (maxMs - minMs))
}
