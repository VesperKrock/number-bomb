import { describe, expect, it } from 'vitest'
import { createGame } from './createGame'
import { generateBombNumber } from './random'
import { gameReducer } from './reducer'
import { getCandidateNumbers, isValidCandidate } from './selectors'
import type { GameState, Player } from './types'

const makePlayers = (count: number): Player[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `player-${index + 1}`,
    name: `Player ${index + 1}`,
  }))

const makeGame = (playerCount = 2, bomb = 81) =>
  createGame({ players: makePlayers(playerCount), secretBomb: bomb })

function play(state: GameState, value: number): GameState {
  const selected = gameReducer(state, { type: 'select', value })
  const locked = gameReducer(selected, { type: 'lockSelection' })
  return gameReducer(locked, { type: 'resolveSelection' })
}

describe('bomb generation', () => {
  it('always remains inside inclusive bounds', () => {
    for (let index = 0; index < 500; index += 1) {
      expect(generateBombNumber(1, 99)).toBeGreaterThanOrEqual(1)
      expect(generateBombNumber(1, 99)).toBeLessThanOrEqual(99)
    }
  })
})

describe('game reducer', () => {
  it('updates the lower candidate after a safe pick below the bomb', () => {
    const state = play(makeGame(), 58)
    expect(state.lowerCandidate).toBe(59)
    expect(state.upperCandidate).toBe(99)
  })

  it('updates the upper candidate after a safe pick above the bomb', () => {
    const state = play(makeGame(), 87)
    expect(state.lowerCandidate).toBe(1)
    expect(state.upperCandidate).toBe(86)
  })

  it('does not allow a chosen safe number to be selected again', () => {
    const state = play(makeGame(), 58)
    const attemptedReplay = gameReducer(state, { type: 'select', value: 58 })
    expect(attemptedReplay).toBe(state)
    expect(attemptedReplay.pendingSelection).toBeNull()
  })

  it('ends the game when the exact bomb is picked', () => {
    const state = play(makeGame(), 81)
    expect(state.phase).toBe('finished')
    expect(state.lastOutcome).toBe('boom')
  })

  it('records the correct losing player', () => {
    const secondPlayersTurn = play(makeGame(), 58)
    const finished = play(secondPlayersTurn, 81)
    expect(finished.losingPlayerId).toBe('player-2')
  })

  it.each([2, 3, 4])('rotates correctly through %i players', (playerCount) => {
    let state = makeGame(playerCount, 99)
    for (let index = 0; index < playerCount; index += 1) {
      expect(state.currentPlayerIndex).toBe(index)
      state = play(state, index + 1)
    }
    expect(state.currentPlayerIndex).toBe(0)
  })

  it.each([0, 100, 12.5])('rejects invalid or out-of-range pick %s', (value) => {
    const state = makeGame()
    expect(gameReducer(state, { type: 'select', value })).toBe(state)
  })

  it('rejects a number outside the reduced candidate range', () => {
    const state = play(makeGame(), 58)
    expect(gameReducer(state, { type: 'select', value: 40 })).toBe(state)
  })

  it('creates a fresh game state on restart', () => {
    const progressed = play(makeGame(), 58)
    const restarted = gameReducer(progressed, {
      type: 'restart',
      secretBomb: 42,
      startingPlayerIndex: 1,
    })

    expect(restarted).toMatchObject({
      secretBomb: 42,
      lowerCandidate: 1,
      upperCandidate: 99,
      currentPlayerIndex: 1,
      pendingSelection: null,
      phase: 'playing',
      losingPlayerId: null,
      turnCount: 0,
    })
  })

  it('only leaves exact valid candidate numbers selectable', () => {
    let state = play(makeGame(), 58)
    state = play(state, 76)
    state = play(state, 87)

    expect(getCandidateNumbers(state)).toEqual(
      Array.from({ length: 10 }, (_, index) => 77 + index),
    )
    expect(isValidCandidate(state, 76)).toBe(false)
    expect(isValidCandidate(state, 77)).toBe(true)
    expect(isValidCandidate(state, 86)).toBe(true)
    expect(isValidCandidate(state, 87)).toBe(false)
  })

  it('does not resolve before a selection is explicitly locked', () => {
    const selected = gameReducer(makeGame(), { type: 'select', value: 58 })
    expect(gameReducer(selected, { type: 'resolveSelection' })).toBe(selected)
  })
})
