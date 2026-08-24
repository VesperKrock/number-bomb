import { MAX_NUMBER, MIN_NUMBER } from './constants'
import { createGame } from './createGame'
import { isValidCandidate } from './selectors'
import type { GameAction, GameState } from './types'

function canSelect(state: GameState, value: number): boolean {
  return state.phase === 'playing' && isValidCandidate(state, value)
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'select': {
      if (!canSelect(state, action.value)) return state

      return {
        ...state,
        pendingSelection: action.value,
        lastOutcome: null,
      }
    }

    case 'clearSelection': {
      if (state.phase !== 'playing' || state.pendingSelection === null) return state
      return { ...state, pendingSelection: null }
    }

    case 'lockSelection': {
      if (
        state.phase !== 'playing' ||
        state.pendingSelection === null ||
        !isValidCandidate(state, state.pendingSelection)
      ) {
        return state
      }

      return { ...state, phase: 'resolving' }
    }

    case 'lockNumber': {
      if (!canSelect(state, action.value)) return state
      return {
        ...state,
        pendingSelection: action.value,
        phase: 'resolving',
        lastOutcome: null,
      }
    }

    case 'resolveSelection': {
      const pickedNumber = state.pendingSelection
      if (
        state.phase !== 'resolving' ||
        pickedNumber === null ||
        !isValidCandidate(state, pickedNumber)
      ) {
        return state
      }

      if (pickedNumber === state.secretBomb) {
        return {
          ...state,
          pendingSelection: null,
          phase: 'finished',
          losingPlayerId: state.players[state.currentPlayerIndex].id,
          turnCount: state.turnCount + 1,
          lastPick: pickedNumber,
          lastOutcome: 'boom',
        }
      }

      const pickedBelowBomb = pickedNumber < state.secretBomb

      return {
        ...state,
        lowerCandidate: pickedBelowBomb ? pickedNumber + 1 : state.lowerCandidate,
        upperCandidate: pickedBelowBomb ? state.upperCandidate : pickedNumber - 1,
        pendingSelection: null,
        phase: 'playing',
        currentPlayerIndex: (state.currentPlayerIndex + 1) % state.players.length,
        turnCount: state.turnCount + 1,
        lastPick: pickedNumber,
        lastOutcome: 'safe',
      }
    }

    case 'restart':
      return createGame({
        players: state.players,
        secretBomb: action.secretBomb,
        startingPlayerIndex: action.startingPlayerIndex ?? 0,
        minimum: MIN_NUMBER,
        maximum: MAX_NUMBER,
      })

    default:
      return state
  }
}
