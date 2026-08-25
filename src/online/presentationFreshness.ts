import type { LiveGamePresentationKind } from './store/liveGameTransition'

export const LIVE_PRESENTATION_WINDOW_MS: Readonly<Record<LiveGamePresentationKind, number>> = {
  LOCK: 2_500,
  SAFE: 1_800,
  BOOM: 2_800,
}

export function isLivePresentationFresh(
  kind: LiveGamePresentationKind,
  updatedAt: string,
  serverNowMs: number,
): boolean {
  const updatedAtMs = Date.parse(updatedAt)
  if (!Number.isFinite(updatedAtMs) || !Number.isFinite(serverNowMs)) return false
  const ageMs = serverNowMs - updatedAtMs
  return ageMs >= -1_000 && ageMs <= LIVE_PRESENTATION_WINDOW_MS[kind]
}
