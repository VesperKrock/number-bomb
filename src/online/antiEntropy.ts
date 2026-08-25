import type { GamePhase } from './types'

export type AntiEntropyPhase = 'LOBBY' | GamePhase

export interface AntiEntropyPolicy {
  intervalMs: number
  convergenceBoundMs: number
}

const PRODUCTION_POLICY: Readonly<Record<AntiEntropyPhase, AntiEntropyPolicy>> = {
  LOBBY: { intervalMs: 3_000, convergenceBoundMs: 4_000 },
  PLAYING_TURN: { intervalMs: 3_000, convergenceBoundMs: 4_000 },
  RESOLVING: { intervalMs: 1_000, convergenceBoundMs: 2_000 },
  FINISHED: { intervalMs: 5_000, convergenceBoundMs: 6_000 },
}

const E2E_POLICY: Readonly<Record<AntiEntropyPhase, AntiEntropyPolicy>> = {
  LOBBY: { intervalMs: 300, convergenceBoundMs: 1_000 },
  PLAYING_TURN: { intervalMs: 400, convergenceBoundMs: 1_100 },
  RESOLVING: { intervalMs: 200, convergenceBoundMs: 800 },
  FINISHED: { intervalMs: 500, convergenceBoundMs: 1_200 },
}

export function getAntiEntropyPhase(gamePhase: GamePhase | null | undefined): AntiEntropyPhase {
  return gamePhase ?? 'LOBBY'
}

export function getAntiEntropyPolicy(
  phase: AntiEntropyPhase,
  fastE2E = false,
): AntiEntropyPolicy {
  return (fastE2E ? E2E_POLICY : PRODUCTION_POLICY)[phase]
}

export function getMaximumSnapshotRequestsPerMinute(phase: AntiEntropyPhase): number {
  return Math.ceil(60_000 / PRODUCTION_POLICY[phase].intervalMs)
}
