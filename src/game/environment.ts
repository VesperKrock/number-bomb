import { MAX_NUMBER, MIN_NUMBER } from './constants'
import { generateBombNumber } from './random'

export function createBombForEnvironment(): number {
  const forcedBomb = Number(import.meta.env.VITE_E2E_BOMB_NUMBER)
  if (
    import.meta.env.VITE_E2E_BOMB_NUMBER &&
    Number.isInteger(forcedBomb) &&
    forcedBomb >= MIN_NUMBER &&
    forcedBomb <= MAX_NUMBER
  ) {
    return forcedBomb
  }

  return generateBombNumber(MIN_NUMBER, MAX_NUMBER)
}
