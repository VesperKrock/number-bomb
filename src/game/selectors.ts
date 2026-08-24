import type { GameState } from './types'

export function isValidCandidate(state: GameState, value: number): boolean {
  return (
    Number.isInteger(value) &&
    value >= state.lowerCandidate &&
    value <= state.upperCandidate
  )
}

export function getCandidateCount(state: GameState): number {
  return state.upperCandidate - state.lowerCandidate + 1
}

export function getCandidateNumbers(state: GameState): number[] {
  return Array.from(
    { length: getCandidateCount(state) },
    (_, index) => state.lowerCandidate + index,
  )
}

export function getCurrentPlayer(state: GameState) {
  return state.players[state.currentPlayerIndex]
}

export function getLosingPlayer(state: GameState) {
  return state.players.find((player) => player.id === state.losingPlayerId) ?? null
}
