export interface SnapshotRecoveryContext {
  generation: number
  reason: string
  isCurrent: () => boolean
}

export type SnapshotRecoveryRun = (context: SnapshotRecoveryContext) => Promise<boolean>

export type SnapshotRecoveryEvent =
  | { kind: 'QUEUED'; reason: string; generation: number | null }
  | { kind: 'REQUEST'; reason: string; generation: number }
  | { kind: 'INVALIDATED' }

interface ActiveRecovery {
  epoch: number
  generation: number | null
  promise: Promise<boolean>
}

export class SnapshotConvergenceCoordinator {
  private epoch = 0
  private requestedRevision = 0
  private generation = 0
  private latestReason = 'UNKNOWN'
  private active: ActiveRecovery | null = null

  constructor(private readonly observe?: (event: SnapshotRecoveryEvent) => void) {}

  request(reason: string, run: SnapshotRecoveryRun): Promise<boolean> {
    this.requestedRevision += 1
    this.latestReason = reason
    const epoch = this.epoch
    const active = this.active
    if (active?.epoch === epoch) {
      this.observe?.({ kind: 'QUEUED', reason, generation: active.generation })
      return active.promise
    }

    const entry: ActiveRecovery = {
      epoch,
      generation: null,
      promise: Promise.resolve(false),
    }
    const promise = Promise.resolve().then(async () => {
      let anySuccessfulPass = false
      while (epoch === this.epoch) {
        const revisionAtStart = this.requestedRevision
        const reasonForPass = this.latestReason
        this.generation += 1
        const generation = this.generation
        entry.generation = generation
        this.observe?.({ kind: 'REQUEST', reason: reasonForPass, generation })
        const isCurrent = () => epoch === this.epoch
        const successful = await run({ generation, reason: reasonForPass, isCurrent })
        if (!isCurrent()) return anySuccessfulPass
        anySuccessfulPass = successful || anySuccessfulPass
        if (revisionAtStart === this.requestedRevision) return anySuccessfulPass
      }
      return anySuccessfulPass
    }).finally(() => {
      if (this.active === entry) this.active = null
    })
    entry.promise = promise
    this.active = entry
    return promise
  }

  invalidate(): void {
    this.epoch += 1
    this.requestedRevision = 0
    this.latestReason = 'UNKNOWN'
    this.active = null
    this.observe?.({ kind: 'INVALIDATED' })
  }
}
