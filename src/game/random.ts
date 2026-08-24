export type RandomInteger = (minimum: number, maximum: number) => number

export function secureRandomInt(minimum: number, maximum: number): number {
  if (!Number.isInteger(minimum) || !Number.isInteger(maximum) || maximum < minimum) {
    throw new RangeError('Random integer bounds must be valid integers.')
  }

  const range = maximum - minimum + 1
  const maximumUint32 = 0x1_0000_0000
  const cutoff = maximumUint32 - (maximumUint32 % range)
  const randomBuffer = new Uint32Array(1)
  let randomValue: number

  do {
    crypto.getRandomValues(randomBuffer)
    randomValue = randomBuffer[0]
  } while (randomValue >= cutoff)

  return minimum + (randomValue % range)
}

export function generateBombNumber(
  minimum: number,
  maximum: number,
  randomInteger: RandomInteger = secureRandomInt,
): number {
  return randomInteger(minimum, maximum)
}

export function randomPlayerIndex(
  playerCount: number,
  randomInteger: RandomInteger = secureRandomInt,
): number {
  if (!Number.isInteger(playerCount) || playerCount < 1) {
    throw new RangeError('Player count must be a positive integer.')
  }

  return randomInteger(0, playerCount - 1)
}
