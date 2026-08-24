export interface Player {
  id: string
  name: string
}

export type GamePhase = 'playing' | 'resolving' | 'finished'
export type MoveOutcome = 'safe' | 'boom' | null

export interface GameState {
  players: Player[]
  currentPlayerIndex: number
  secretBomb: number
  lowerCandidate: number
  upperCandidate: number
  pendingSelection: number | null
  phase: GamePhase
  losingPlayerId: string | null
  turnCount: number
  lastPick: number | null
  lastOutcome: MoveOutcome
}

export type GameAction =
  | { type: 'select'; value: number }
  | { type: 'clearSelection' }
  | { type: 'lockSelection' }
  | { type: 'lockNumber'; value: number }
  | { type: 'resolveSelection' }
  | {
      type: 'restart'
      secretBomb: number
      startingPlayerIndex?: number
    }
