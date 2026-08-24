const MAX_CLOCK_SAMPLES = 5

export interface ClockSample {
  offsetMs: number
  roundTripMs: number
  sampledAtMs: number
}

export function createClockSample(
  clientSentAtMs: number,
  clientReceivedAtMs: number,
  serverNow: string,
): ClockSample | null {
  const serverNowMs = Date.parse(serverNow)
  if (
    !Number.isFinite(clientSentAtMs)
    || !Number.isFinite(clientReceivedAtMs)
    || clientReceivedAtMs < clientSentAtMs
    || !Number.isFinite(serverNowMs)
  ) {
    return null
  }

  const midpoint = clientSentAtMs + (clientReceivedAtMs - clientSentAtMs) / 2
  return {
    offsetMs: serverNowMs - midpoint,
    roundTripMs: clientReceivedAtMs - clientSentAtMs,
    sampledAtMs: clientReceivedAtMs,
  }
}

export function medianOffset(samples: ClockSample[]): number {
  if (samples.length === 0) return 0
  const values = samples.map((sample) => sample.offsetMs).sort((left, right) => left - right)
  const middle = Math.floor(values.length / 2)
  return values.length % 2 === 0
    ? (values[middle - 1] + values[middle]) / 2
    : values[middle]
}

export class ServerClock {
  private samples: ClockSample[] = []

  addSample(clientSentAtMs: number, clientReceivedAtMs: number, serverNow: string): void {
    const sample = createClockSample(clientSentAtMs, clientReceivedAtMs, serverNow)
    if (!sample) return
    this.samples = [...this.samples, sample].slice(-MAX_CLOCK_SAMPLES)
  }

  get offsetMs(): number {
    return medianOffset(this.samples)
  }

  now(clientNowMs = Date.now()): number {
    return clientNowMs + this.offsetMs
  }

  remainingSeconds(deadline: string, clientNowMs = Date.now()): number {
    const deadlineMs = Date.parse(deadline)
    if (!Number.isFinite(deadlineMs)) return 0
    return Math.max(0, Math.ceil((deadlineMs - this.now(clientNowMs)) / 1000))
  }

  clear(): void {
    this.samples = []
  }
}
