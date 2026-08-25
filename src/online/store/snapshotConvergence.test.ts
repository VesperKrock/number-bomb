import { describe, expect, it } from 'vitest'
import { SnapshotConvergenceCoordinator, type SnapshotRecoveryEvent } from './snapshotConvergence'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => { resolve = next })
  return { promise, resolve }
}

describe('snapshot convergence coordinator', () => {
  it('drains a wake received while an older snapshot is in flight', async () => {
    const first = deferred<boolean>()
    const second = deferred<boolean>()
    const secondStarted = deferred<void>()
    const calls: number[] = []
    const events: SnapshotRecoveryEvent[] = []
    const coordinator = new SnapshotConvergenceCoordinator((event) => events.push(event))
    const run = async ({ generation }: { generation: number }) => {
      calls.push(generation)
      if (generation === 1) return first.promise
      secondStarted.resolve()
      return second.promise
    }

    const recovery = coordinator.request('SUBSCRIBED', run)
    await Promise.resolve()
    expect(calls).toEqual([1])
    expect(coordinator.request('ROOM_PLAYERS_INSERT', run)).toBe(recovery)
    expect(coordinator.request('ROOM_VERSION_2', run)).toBe(recovery)

    first.resolve(true)
    await secondStarted.promise
    expect(calls).toEqual([1, 2])
    second.resolve(true)

    await expect(recovery).resolves.toBe(true)
    expect(events.filter((event) => event.kind === 'QUEUED')).toHaveLength(2)
    expect(events.filter((event) => event.kind === 'REQUEST')).toHaveLength(2)
  })

  it('coalesces multiple wakes into one serial trailing pass', async () => {
    const first = deferred<boolean>()
    let calls = 0
    const coordinator = new SnapshotConvergenceCoordinator()
    const run = async () => {
      calls += 1
      if (calls === 1) return first.promise
      return true
    }

    const recovery = coordinator.request('INITIAL', run)
    await Promise.resolve()
    coordinator.request('PLAYER_INSERT', run)
    coordinator.request('ROOM_UPDATE', run)
    coordinator.request('PLAYER_TOUCH', run)
    first.resolve(true)

    await expect(recovery).resolves.toBe(true)
    expect(calls).toBe(2)
  })

  it('invalidates an old recovery without clearing a newer room recovery', async () => {
    const oldRoom = deferred<boolean>()
    const newRoom = deferred<boolean>()
    const coordinator = new SnapshotConvergenceCoordinator()
    const oldRecovery = coordinator.request('OLD_ROOM', async () => oldRoom.promise)
    await Promise.resolve()

    coordinator.invalidate()
    const newRecovery = coordinator.request('NEW_ROOM', async () => newRoom.promise)
    oldRoom.resolve(true)
    await expect(oldRecovery).resolves.toBe(false)
    newRoom.resolve(true)
    await expect(newRecovery).resolves.toBe(true)
  })
})
