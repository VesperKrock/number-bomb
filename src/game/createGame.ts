import { MAX_NUMBER, MAX_PLAYERS, MIN_NUMBER, MIN_PLAYERS } from './constants'
import type { GameState, Player } from './types'

export interface CreateGameOptions {
  players: Player[]
  secretBomb: number
  startingPlayerIndex?: number
  minimum?: number
  maximum?: number
}

export function createGame({
  players,
  secretBomb,
  startingPlayerIndex = 0,
  minimum = MIN_NUMBER,
  maximum = MAX_NUMBER,
}: CreateGameOptions): GameState {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    throw new RangeError(`A game requires ${MIN_PLAYERS}–${MAX_PLAYERS} players.`)
  }

  if (!Number.isInteger(secretBomb) || secretBomb < minimum || secretBomb > maximum) {
    throw new RangeError('The bomb number must be an integer inside the game range.')
  }

  if (
    !Number.isInteger(startingPlayerIndex) ||
    startingPlayerIndex < 0 ||
    startingPlayerIndex >= players.length
  ) {
    throw new RangeError('The starting player index is invalid.')
  }

  return {
    players: players.map((player) => ({ ...player })),
    currentPlayerIndex: startingPlayerIndex,
    secretBomb,
    lowerCandidate: minimum,
    upperCandidate: maximum,
    pendingSelection: null,
    phase: 'playing',
    losingPlayerId: null,
    turnCount: 0,
    lastPick: null,
    lastOutcome: null,
  }
}
