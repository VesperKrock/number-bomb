import { execFileSync } from 'node:child_process'
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'

interface DropRule {
  table: string
  eventType?: string
  phases?: string[]
  remaining?: number
}

interface DroppedChange {
  table: string
  eventType: string
  new: Record<string, unknown>
  old: Record<string, unknown>
}

interface EventLossControl {
  rules: DropRule[]
  suppressPresenceWake?: boolean
  dropped: DroppedChange[]
  inject?: (change: DroppedChange) => void
}

interface Diagnostic {
  sequence?: number
  kind: string
  source?: string
  table?: string
  gameVersion?: number | null
  playerCount?: number
  phase?: string | null
  reason?: string
  presentationKey?: string
}

type ControlledWindow = typeof window & {
  __BOM_SO_ONLINE_REALTIME_EVENT_LOSS__?: EventLossControl
  __BOM_SO_ONLINE_CONVERGENCE_DIAGNOSTICS__?: Diagnostic[]
  __BOM_SO_HAPTIC_CALLS__?: Array<number | number[]>
}

async function installControlledRuntime(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const controlledWindow = window as ControlledWindow
    controlledWindow.__BOM_SO_ONLINE_CONVERGENCE_DIAGNOSTICS__ = []
    controlledWindow.__BOM_SO_ONLINE_REALTIME_EVENT_LOSS__ = {
      rules: [],
      dropped: [],
    }
    const hapticCalls: Array<number | number[]> = []
    controlledWindow.__BOM_SO_HAPTIC_CALLS__ = hapticCalls
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: (pattern: number | number[]) => {
        hapticCalls.push(Array.isArray(pattern) ? [...pattern] : pattern)
        return true
      },
    })
  })
}

async function setDropRules(
  page: Page,
  rules: DropRule[],
  suppressPresenceWake = false,
): Promise<void> {
  await page.evaluate(({ nextRules, suppressPresence }) => {
    const control = (window as ControlledWindow).__BOM_SO_ONLINE_REALTIME_EVENT_LOSS__
    if (!control) throw new Error('Realtime event-loss control is unavailable')
    control.rules = nextRules
    control.suppressPresenceWake = suppressPresence
    control.dropped = []
  }, { nextRules: rules, suppressPresence: suppressPresenceWake })
}

async function readDropped(page: Page): Promise<DroppedChange[]> {
  return page.evaluate(() => (
    window as ControlledWindow
  ).__BOM_SO_ONLINE_REALTIME_EVENT_LOSS__?.dropped ?? [])
}

async function readDiagnostics(page: Page): Promise<Diagnostic[]> {
  return page.evaluate(() => (
    window as ControlledWindow
  ).__BOM_SO_ONLINE_CONVERGENCE_DIAGNOSTICS__ ?? [])
}

async function injectDroppedChange(page: Page, change: DroppedChange): Promise<void> {
  await page.evaluate((nextChange) => {
    const control = (window as ControlledWindow).__BOM_SO_ONLINE_REALTIME_EVENT_LOSS__
    if (typeof control?.inject !== 'function') {
      throw new Error('Realtime event-loss injector is unavailable')
    }
    control.inject(nextChange)
  }, change)
}

async function expectChannelSubscribed(page: Page): Promise<void> {
  await expect.poll(async () => (
    (await readDiagnostics(page)).some(
      (event) => event.kind === 'CHANNEL_STATUS' && event.source === 'SUBSCRIBED',
    )
  )).toBe(true)
}

async function openOnlineEntry(page: Page, roomCode?: string): Promise<void> {
  await page.goto(roomCode ? `/?room=${roomCode}` : '/')
  if (!roomCode) await page.locator('.mode-card--online').click()
  await expect(page.locator('.online-entry-panel')).toBeVisible()
}

async function createRoom(page: Page, nickname: string): Promise<string> {
  await openOnlineEntry(page)
  await page.locator('input[autocomplete="nickname"]').fill(nickname)
  await page.locator('.online-primary-button').click()
  await expect(page.locator('.online-lobby-screen')).toBeVisible()
  const roomCode = (await page.locator('.room-share-card strong').textContent())?.trim() ?? ''
  expect(roomCode).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/u)
  return roomCode
}

async function joinRoom(page: Page, roomCode: string, nickname: string): Promise<void> {
  await openOnlineEntry(page, roomCode)
  await page.locator('input[autocomplete="nickname"]').fill(nickname)
  await page.locator('.online-primary-button').click()
  await expect(page.locator('.online-lobby-screen')).toBeVisible()
}

async function startTwoPlayerGame(host: Page, peer: Page, roomCode: string): Promise<void> {
  await expect(host.getByTestId('online-roster-player')).toHaveCount(2)
  await expect(peer.getByTestId('online-roster-player')).toHaveCount(2)
  const start = host.locator('.lobby-actions .online-primary-button')
  await expect(start).toBeEnabled()
  await start.click()
  await expect(host.getByTestId('number-board')).toBeVisible()
  await expect(peer.getByTestId('number-board')).toBeVisible()
  setLocalBomb(roomCode, 81)
}

async function chooseAndLock(page: Page, candidate: number): Promise<void> {
  await page.locator('.number-cell', { hasText: String(candidate).padStart(2, '0') }).click()
  await page.locator('.lock-button:not(:disabled)').click()
}

function setLocalBomb(roomCode: string, bombNumber: number): void {
  if (!/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/u.test(roomCode)) {
    throw new Error('Unsafe room code in local E2E helper.')
  }
  const sql = [
    'update private.game_secrets as secret',
    `set bomb_number = ${bombNumber}`,
    'from public.room_games as game',
    'join public.rooms as room on room.id = game.room_id',
    'where secret.game_id = game.id',
    `and room.code = '${roomCode}'`,
    "and game.phase <> 'FINISHED';",
  ].join(' ')
  execFileSync('docker', [
    'exec', 'supabase_db_number-bomb', 'psql', '-U', 'postgres', '-d', 'postgres',
    '-v', 'ON_ERROR_STOP=1', '-c', sql,
  ])
}

async function twoControlledPages(browser: Browser) {
  const hostContext = await browser.newContext()
  const peerContext = await browser.newContext()
  await installControlledRuntime(hostContext)
  await installControlledRuntime(peerContext)
  return {
    hostContext,
    peerContext,
    host: await hostContext.newPage(),
    peer: await peerContext.newPage(),
  }
}

test.describe('deterministic missed-event anti-entropy', () => {
  test('repairs a completely silent JOIN and rejects duplicate/out-of-order wakes after recovery', async ({ browser }) => {
    const { hostContext, peerContext, host, peer } = await twoControlledPages(browser)
    const roomCode = await createRoom(host, 'Silent Host')
    await expectChannelSubscribed(host)
    await setDropRules(host, [
      { table: 'rooms' },
      { table: 'room_players' },
    ], true)
    const beforeJoinDiagnostics = await readDiagnostics(host)
    const joinStartSequence = beforeJoinDiagnostics.at(-1)?.sequence ?? 0

    await joinRoom(peer, roomCode, 'Silent Peer')
    await injectDroppedChange(host, {
      table: 'room_players',
      eventType: 'INSERT',
      new: { membership_status: 'ACTIVE' },
      old: {},
    })
    await expect(peer.getByTestId('online-roster-player')).toHaveCount(2)
    await expect(host.getByTestId('online-roster-player')).toHaveCount(2, { timeout: 2_000 })

    const dropped = await readDropped(host)
    expect(dropped.some((change) => (
      change.table === 'rooms' || change.table === 'room_players'
    ))).toBe(true)
    const diagnostics = (await readDiagnostics(host)).filter(
      (event) => (event.sequence ?? 0) > joinStartSequence,
    )
    expect(diagnostics.some((event) => event.kind === 'ANTI_ENTROPY_APPLIED'
      && event.source === 'LOBBY'
      && event.playerCount === 2)).toBe(true)

    expect(diagnostics.some(
      (event) => event.kind === 'POSTGRES_WAKE'
        && (event.table === 'rooms' || event.table === 'room_players'),
    )).toBe(false)

    await setDropRules(host, [
      { table: 'rooms' },
      { table: 'room_players' },
    ], true)
    const beforeDepartureDiagnostics = await readDiagnostics(host)
    const departureStartSequence = beforeDepartureDiagnostics.at(-1)?.sequence ?? 0
    await peer.getByRole('button', { name: 'RỜI PHÒNG' }).click()
    await injectDroppedChange(host, {
      table: 'room_players',
      eventType: 'UPDATE',
      new: { membership_status: 'LEFT' },
      old: { membership_status: 'ACTIVE' },
    })
    await expect(host.getByTestId('online-roster-player')).toHaveCount(1, { timeout: 2_000 })
    await expect(host.getByTestId('online-room-activity')).toHaveText(
      /Silent Peer ĐÃ RỜI PHÒNG\./u,
    )
    await expect(host.getByTestId('online-room-activity')).toHaveCount(1)
    const departureDiagnostics = (await readDiagnostics(host)).filter(
      (event) => (event.sequence ?? 0) > departureStartSequence,
    )
    expect(departureDiagnostics.some((event) => event.kind === 'ANTI_ENTROPY_APPLIED'
      && event.source === 'LOBBY'
      && event.playerCount === 2)).toBe(true)
    expect(departureDiagnostics.some((event) => event.kind === 'POSTGRES_WAKE'
      && (event.table === 'rooms' || event.table === 'room_players'))).toBe(false)

    await hostContext.close()
    await peerContext.close()
  })

  test('repairs dropped SAFE finalization, missed RESOLVING, and loss of both transitions', async ({ browser }) => {
    test.setTimeout(30_000)
    const { hostContext, peerContext, host, peer } = await twoControlledPages(browser)
    const roomCode = await createRoom(host, 'Safe Host')
    await joinRoom(peer, roomCode, 'Safe Peer')
    await startTwoPlayerGame(host, peer, roomCode)

    await setDropRules(peer, [{ table: 'room_games', phases: ['PLAYING_TURN'] }])
    await chooseAndLock(host, 25)
    await expect(peer.getByTestId('online-valid-range')).toContainText('26')
    await expect(peer.locator('.online-game-screen')).toHaveAttribute('data-game-version', '3')
    expect((await readDiagnostics(peer)).some(
      (event) => event.kind === 'WATCHDOG_WAKE'
        || (event.kind === 'ANTI_ENTROPY_APPLIED' && event.gameVersion === 3),
    )).toBe(true)

    await setDropRules(host, [{ table: 'room_games', phases: ['RESOLVING'] }])
    await chooseAndLock(peer, 30)
    await expect(host.getByTestId('online-valid-range')).toContainText('31')
    await expect(host.locator('.online-game-screen')).toHaveAttribute('data-game-version', '5')
    expect((await readDropped(host)).some(
      (change) => change.table === 'room_games' && change.new.phase === 'RESOLVING',
    )).toBe(true)
    expect((await readDiagnostics(host)).filter(
      (event) => event.kind === 'PRESENTATION_CONSUMED'
        && event.presentationKey?.endsWith(':5:SAFE'),
    )).toHaveLength(1)

    await setDropRules(peer, [{
      table: 'room_games',
      phases: ['RESOLVING', 'PLAYING_TURN'],
    }], true)
    await chooseAndLock(host, 35)
    await expect(peer.getByTestId('online-valid-range')).toContainText('36', { timeout: 2_000 })
    await expect(peer.locator('.online-game-screen')).toHaveAttribute('data-game-version', '7')
    const bothDropped = await readDropped(peer)
    expect(bothDropped.some((change) => change.new.phase === 'RESOLVING')).toBe(true)
    const recoveredDiagnostics = await readDiagnostics(peer)
    expect(recoveredDiagnostics.some(
      (event) => event.kind === 'ANTI_ENTROPY_APPLIED'
        && (event.gameVersion ?? 0) >= 6,
    )).toBe(true)
    expect(recoveredDiagnostics.some(
      (event) => event.kind === 'WATCHDOG_WAKE'
        && event.source === 'FINALIZE_RESOLUTION',
    )).toBe(true)
    await peer.evaluate(() => {
      const control = (window as ControlledWindow).__BOM_SO_ONLINE_REALTIME_EVENT_LOSS__!
      control.rules = []
      const resolving = control.dropped.find((change) => change.new.phase === 'RESOLVING')
      if (!resolving) throw new Error('Expected a captured RESOLVING change')
      control.inject?.(resolving)
      control.inject?.({
        ...resolving,
        new: { ...resolving.new, version: Number(resolving.new.version) - 1 },
      })
      control.inject?.({
        ...resolving,
        new: { ...resolving.new, version: 9 },
      })
    })
    await expect(peer.locator('.online-game-screen')).toHaveAttribute('data-game-version', '7')
    await expect(peer.getByTestId('online-valid-range')).toContainText('36')
    await expect.poll(async () => (await readDiagnostics(peer)).some(
      (event) => event.kind === 'POSTGRES_WAKE'
        && event.table === 'room_games'
        && event.reason === 'STALE_OR_DUPLICATE',
    )).toBe(true)
    await expect.poll(async () => (await readDiagnostics(peer)).some(
      (event) => event.kind === 'SNAPSHOT_REQUEST'
        && event.source?.endsWith(':VERSION_GAP'),
    )).toBe(true)

    await hostContext.close()
    await peerContext.close()
  })

  test('recovers a dropped FINISHED state as settled without replaying stale suspense', async ({ browser }) => {
    test.setTimeout(30_000)
    const { hostContext, peerContext, host, peer } = await twoControlledPages(browser)
    const roomCode = await createRoom(host, 'Boom Host')
    await joinRoom(peer, roomCode, 'Boom Peer')
    await startTwoPlayerGame(host, peer, roomCode)

    await setDropRules(peer, [{
      table: 'room_games',
      phases: ['RESOLVING', 'FINISHED'],
    }], true)
    let delayedSnapshot = false
    await peer.route('**/rest/v1/rpc/get_room_snapshot', async (route) => {
      if (delayedSnapshot) {
        await route.continue()
        return
      }
      delayedSnapshot = true
      const response = await route.fetch()
      await new Promise((resolve) => setTimeout(resolve, 6_500))
      await route.fulfill({ response })
    })

    await chooseAndLock(host, 81)
    await expect(peer.getByTestId('online-boom-result')).toBeVisible({ timeout: 8_000 })
    await expect(peer.getByTestId('online-boom-result')).toHaveClass(/is-settled/u)
    await expect(peer.locator('.online-game-screen')).not.toHaveClass(/has-spectator-impact/u)

    const dropped = await readDropped(peer)
    expect(dropped.some((change) => change.new.phase === 'RESOLVING')).toBe(true)
    expect(dropped.some((change) => change.new.phase === 'FINISHED')).toBe(true)
    const diagnostics = await readDiagnostics(peer)
    expect(diagnostics.some((event) => event.kind === 'PRESENTATION_SKIPPED'
      && event.reason === 'RECOVERED_OUTSIDE_LIVE_WINDOW'
      && event.presentationKey?.endsWith(':BOOM'))).toBe(true)
    expect(diagnostics.some((event) => event.kind === 'PRESENTATION_CONSUMED'
      && event.presentationKey?.endsWith(':BOOM'))).toBe(false)
    expect(await peer.evaluate(() => (
      window as ControlledWindow
    ).__BOM_SO_HAPTIC_CALLS__)).not.toContainEqual([30, 25, 45])

    await hostContext.close()
    await peerContext.close()
  })
})
