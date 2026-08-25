import { execFileSync } from 'node:child_process'
import { expect, test, type BrowserContext, type Page, type TestInfo } from '@playwright/test'

interface AudioDiagnostics {
  activeRingingSources: number
  lastBoomImpactGain: number | null
}

interface ConvergenceDiagnostic {
  sequence: number
  clientInstanceId: string
  kind: string
  atMs: number
  source?: string
  table?: string
  eventType?: string
  requestGeneration?: number
  roomVersion?: number | null
  gameVersion?: number | null
  playerCount?: number
  phase?: string | null
  reason?: string
  presentationKey?: string
}

type HapticCall = number | number[]

async function installHapticsMock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const calls: HapticCall[] = []
    Object.defineProperty(window, '__BOM_SO_HAPTIC_CALLS__', {
      configurable: true,
      value: calls,
    })
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: (pattern: HapticCall) => {
        calls.push(Array.isArray(pattern) ? [...pattern] : pattern)
        return true
      },
    })
  })
}

async function readHapticCalls(page: Page): Promise<HapticCall[]> {
  return page.evaluate(() => (
    window as typeof window & {
      __BOM_SO_HAPTIC_CALLS__?: HapticCall[]
    }
  ).__BOM_SO_HAPTIC_CALLS__ ?? [])
}

async function readAudioDiagnostics(page: Page): Promise<AudioDiagnostics> {
  return page.evaluate(() => {
    const diagnostics = (
      window as typeof window & {
        __BOM_SO_AUDIO_DIAGNOSTICS__?: () => AudioDiagnostics
      }
    ).__BOM_SO_AUDIO_DIAGNOSTICS__
    if (typeof diagnostics !== 'function') {
      throw new Error('E2E audio diagnostics are unavailable')
    }
    return diagnostics()
  })
}

async function attachConvergenceDiagnostics(
  testInfo: TestInfo,
  label: string,
  pages: ReadonlyArray<{ name: string; page: Page }>,
): Promise<void> {
  const diagnostics = await Promise.all(pages.map(async ({ name, page }) => ({
    name,
    url: page.url(),
    events: await page.evaluate(() => (
      window as typeof window & {
        __BOM_SO_ONLINE_CONVERGENCE_DIAGNOSTICS__?: ConvergenceDiagnostic[]
      }
    ).__BOM_SO_ONLINE_CONVERGENCE_DIAGNOSTICS__ ?? []),
  })))
  await testInfo.attach(`convergence-${label}`, {
    body: JSON.stringify(diagnostics, null, 2),
    contentType: 'application/json',
  })
}

async function readConvergenceDiagnostics(page: Page): Promise<ConvergenceDiagnostic[]> {
  return page.evaluate(() => (
    window as typeof window & {
      __BOM_SO_ONLINE_CONVERGENCE_DIAGNOSTICS__?: ConvergenceDiagnostic[]
    }
  ).__BOM_SO_ONLINE_CONVERGENCE_DIAGNOSTICS__ ?? [])
}

async function observeResultOnset(page: Page, selector: string): Promise<void> {
  await page.evaluate((resultSelector) => {
    const state = { observedAt: null as number | null, textContent: null as string | null }
    ;(
      window as typeof window & {
        __BOM_SO_ONLINE_RESULT_ONSET__?: typeof state
      }
    ).__BOM_SO_ONLINE_RESULT_ONSET__ = state

    const capture = () => {
      const result = document.querySelector(resultSelector)
      if (!result) return false
      state.observedAt = Date.now()
      state.textContent = result.textContent
      return true
    }
    if (capture()) return

    const observer = new MutationObserver(() => {
      if (!capture()) return
      observer.disconnect()
    })
    observer.observe(document.documentElement, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: ['class'],
    })
  }, selector)
}

async function readResultOnset(page: Page): Promise<number | null> {
  return page.evaluate(() => (
    window as typeof window & {
      __BOM_SO_ONLINE_RESULT_ONSET__?: { observedAt: number | null }
    }
  ).__BOM_SO_ONLINE_RESULT_ONSET__?.observedAt ?? null)
}

async function readResultText(page: Page): Promise<string | null> {
  return page.evaluate(() => (
    window as typeof window & {
      __BOM_SO_ONLINE_RESULT_ONSET__?: { textContent: string | null }
    }
  ).__BOM_SO_ONLINE_RESULT_ONSET__?.textContent ?? null)
}

async function expectSynchronizedOnset(left: Page, right: Page): Promise<void> {
  await expect.poll(() => readResultOnset(left)).not.toBeNull()
  await expect.poll(() => readResultOnset(right)).not.toBeNull()
  const [leftOnset, rightOnset] = await Promise.all([
    readResultOnset(left),
    readResultOnset(right),
  ])
  expect(Math.abs(leftOnset! - rightOnset!)).toBeLessThanOrEqual(200)
}

function setLocalBomb(roomCode: string, bombNumber: number) {
  if (!/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/u.test(roomCode)) {
    throw new Error('Unsafe room code in local E2E helper.')
  }
  if (!Number.isInteger(bombNumber) || bombNumber < 1 || bombNumber > 99) {
    throw new Error('Unsafe bomb number in local E2E helper.')
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
    'exec',
    'supabase_db_number-bomb',
    'psql',
    '-U',
    'postgres',
    '-d',
    'postgres',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    sql,
  ])
}

function readLocalRoomLifecycle(roomCode: string): {
  roomStatus: string
  activeMemberships: number
  gamePhase: string
  gameVersion: number
  actionCount: number
} {
  if (!/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/u.test(roomCode)) {
    throw new Error('Unsafe room code in local E2E helper.')
  }
  const sql = [
    'select room.status,',
    "count(*) filter (where player.membership_status = 'ACTIVE'),",
    'game.phase, game.version,',
    '(select count(*) from public.game_actions as action where action.game_id = game.id)',
    'from public.rooms as room',
    'join public.room_players as player on player.room_id = room.id',
    'join lateral (select current_game.* from public.room_games as current_game',
    'where current_game.room_id = room.id order by current_game.round_number desc limit 1) as game on true',
    `where room.code = '${roomCode}'`,
    'group by room.status, game.phase, game.version, game.id;',
  ].join(' ')
  const result = execFileSync('docker', [
    'exec',
    'supabase_db_number-bomb',
    'psql',
    '-U',
    'postgres',
    '-d',
    'postgres',
    '-At',
    '-F',
    '|',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    sql,
  ], { encoding: 'utf8' }).trim()
  const [roomStatus, activeMemberships, gamePhase, gameVersion, actionCount] = result.split('|')
  return {
    roomStatus,
    activeMemberships: Number(activeMemberships),
    gamePhase,
    gameVersion: Number(gameVersion),
    actionCount: Number(actionCount),
  }
}

function expireLocalTurn(roomCode: string) {
  if (!/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/u.test(roomCode)) {
    throw new Error('Unsafe room code in local E2E helper.')
  }
  const sql = [
    'update public.room_games as game',
    "set turn_deadline_at = clock_timestamp() - interval '1 millisecond'",
    'from public.rooms as room',
    'where room.id = game.room_id',
    `and room.code = '${roomCode}'`,
    "and game.phase = 'PLAYING_TURN';",
  ].join(' ')
  execFileSync('docker', [
    'exec',
    'supabase_db_number-bomb',
    'psql',
    '-U',
    'postgres',
    '-d',
    'postgres',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    sql,
  ])
}

async function createOnlinePage(context: BrowserContext): Promise<Page> {
  const page = await context.newPage()
  await installHapticsMock(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'CHƠI ONLINE' }).click()
  await expect(page.getByRole('tab', { name: 'TẠO PHÒNG' })).toBeVisible()
  return page
}

async function createLobbyRoom(page: Page, nickname: string): Promise<string> {
  await page.getByLabel('BIỆT DANH').fill(nickname)
  await page.getByRole('button', { name: 'TẠO PHÒNG', exact: true }).last().click()
  await expect(page.getByRole('heading', { name: 'CHỜ NGƯỜI CHƠI' })).toBeVisible()
  const roomCode = (await page.getByTestId('online-room-code').textContent())?.trim() ?? ''
  expect(roomCode).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/u)
  return roomCode
}

async function joinLobbyRoom(page: Page, roomCode: string, nickname: string): Promise<void> {
  await page.goto(`/?room=${roomCode}`)
  await page.getByLabel('BIỆT DANH').fill(nickname)
  await page.getByRole('button', { name: 'THAM GIA PHÒNG' }).click()
  await expect(page.getByRole('heading', { name: 'CHỜ NGƯỜI CHƠI' })).toBeVisible()
}

test('mobile lobby stays compact and keeps code/link copy actions independent', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const host = await createOnlinePage(context)
  const roomCode = await createLobbyRoom(host, 'Mobile Host')

  const assertCompactLobby = async () => {
    await expect(host.getByTestId('online-room-code')).toBeInViewport()
    await expect(host.getByTestId('online-roster-player')).toBeInViewport()
    await expect(host.getByRole('button', { name: 'BẮT ĐẦU ONLINE' })).toBeInViewport()
    await expect(host.getByRole('button', { name: 'RỜI PHÒNG' })).toBeInViewport()
    expect(await host.evaluate(() => ({
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
      scrollHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
      displayedEmptySeats: Array.from(document.querySelectorAll('.lobby-roster li.is-empty'))
        .filter((element) => window.getComputedStyle(element).display !== 'none').length,
    }))).toEqual({
      horizontalOverflow: false,
      scrollHeight: await host.evaluate(() => window.innerHeight),
      viewportHeight: await host.evaluate(() => window.innerHeight),
      displayedEmptySeats: 0,
    })
  }

  await assertCompactLobby()
  await host.setViewportSize({ width: 440, height: 956 })
  await assertCompactLobby()

  await host.getByRole('button', { name: 'SAO CHÉP MÃ' }).click()
  await expect(host.getByText('ĐÃ SAO CHÉP MÃ.')).toBeVisible()
  await expect.poll(() => host.evaluate(() => navigator.clipboard.readText())).toBe(roomCode)

  await host.getByRole('button', { name: 'SAO CHÉP LINK' }).click()
  await expect(host.getByText('ĐÃ SAO CHÉP LINK.')).toBeVisible()
  const copiedLink = await host.evaluate(() => navigator.clipboard.readText())
  const copiedUrl = new URL(copiedLink)
  expect(copiedUrl.pathname).toBe('/number-bomb/')
  expect(copiedUrl.searchParams.get('room')).toBe(roomCode)

  await expect(host.locator('.room-qr')).toBeHidden()
  await host.getByRole('button', { name: 'HIỆN QR' }).click()
  await expect(host.locator('.room-qr')).toBeVisible()
  await expect(host.locator('.lobby-settings-grid')).toBeHidden()
  await host.getByRole('button', { name: 'MỞ / CHỈNH' }).click()
  await expect(host.getByLabel('SỐ NGƯỜI TỐI ĐA')).toBeVisible()

  await context.close()
})

test('canonical lobby leave notifies once and does not replay after hydration', async ({ browser }) => {
  const hostContext = await browser.newContext()
  const peerContext = await browser.newContext()
  const host = await createOnlinePage(hostContext)
  const roomCode = await createLobbyRoom(host, 'Đức Thắng')
  const peer = await peerContext.newPage()
  await joinLobbyRoom(peer, roomCode, 'Minh Quang')
  await expect(host.getByTestId('online-roster-player')).toHaveCount(2)

  await peer.getByRole('button', { name: 'RỜI PHÒNG' }).click()
  await expect(host.getByTestId('online-roster-player')).toHaveCount(1)
  await expect(host.getByTestId('online-room-activity')).toHaveText(/Minh Quang ĐÃ RỜI PHÒNG\./u)
  await expect(host.getByTestId('online-room-activity')).toHaveCount(1)

  await host.reload()
  await expect(host.getByRole('heading', { name: 'CHỜ NGƯỜI CHƠI' })).toBeVisible()
  await expect(host.getByTestId('online-roster-player')).toHaveCount(1)
  await expect(host.getByTestId('online-room-activity')).toHaveCount(0)

  await hostContext.close()
  await peerContext.close()
})

test('canonical kick uses distinct activity copy', async ({ browser }) => {
  const hostContext = await browser.newContext()
  const peerContext = await browser.newContext()
  const host = await createOnlinePage(hostContext)
  const roomCode = await createLobbyRoom(host, 'Kick Host')
  const peer = await peerContext.newPage()
  await joinLobbyRoom(peer, roomCode, 'Lan Anh')
  await expect(host.getByTestId('online-roster-player')).toHaveCount(2)

  await host.getByRole('button', { name: 'MỜI RA' }).click()
  await expect(host.getByTestId('online-roster-player')).toHaveCount(1)
  await expect(host.getByTestId('online-room-activity')).toHaveText(
    /Lan Anh ĐÃ BỊ MỜI RỜI PHÒNG\./u,
  )
  await expect(host.getByTestId('online-room-activity')).toHaveCount(1)

  await hostContext.close()
  await peerContext.close()
})

test('Presence disconnect never fabricates a leave activity', async ({ browser }) => {
  const hostContext = await browser.newContext()
  const peerContext = await browser.newContext()
  const host = await createOnlinePage(hostContext)
  const roomCode = await createLobbyRoom(host, 'Presence Host')
  const peer = await peerContext.newPage()
  await joinLobbyRoom(peer, roomCode, 'Transient Peer')
  await expect(host.getByTestId('online-roster-player')).toHaveCount(2)

  await peer.close()
  await expect(host.getByTestId('online-roster-player').filter({ hasText: 'Transient Peer' })
    .locator('.is-offline')).toBeVisible()
  await expect(host.getByTestId('online-room-activity')).toHaveCount(0)

  await hostContext.close()
  await peerContext.close()
})

test('canonical leave activity remains available during gameplay', async ({ browser }) => {
  const hostContext = await browser.newContext()
  const peerContext = await browser.newContext()
  const host = await createOnlinePage(hostContext)
  const roomCode = await createLobbyRoom(host, 'Game Host')
  const peer = await peerContext.newPage()
  await joinLobbyRoom(peer, roomCode, 'Game Peer')
  await expect(host.getByTestId('online-roster-player')).toHaveCount(2)
  await host.getByRole('button', { name: 'BẮT ĐẦU ONLINE' }).click()
  await expect(peer.getByTestId('number-board')).toBeVisible()

  await peer.getByRole('button', { name: 'RỜI' }).click()
  await expect(host.getByTestId('number-board')).toBeVisible()
  await expect(host.getByTestId('online-room-activity')).toHaveText(
    /Game Peer ĐÃ RỜI PHÒNG\./u,
  )

  await hostContext.close()
  await peerContext.close()
})

test('two isolated devices synchronize lobby, SAFE, reconnect, and victim/spectator BOOM', async ({ browser }, testInfo) => {
  test.setTimeout(45_000)
  const hostContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
  })
  const peerContext = await browser.newContext()
  await hostContext.addInitScript(() => {
    window.__BOM_SO_ONLINE_CONVERGENCE_DIAGNOSTICS__ = []
  })
  await peerContext.addInitScript(() => {
    window.__BOM_SO_ONLINE_CONVERGENCE_DIAGNOSTICS__ = []
  })
  const host = await createOnlinePage(hostContext)

  await host.getByLabel('BIỆT DANH').fill('Thiên An')
  await host.getByRole('button', { name: 'TẠO PHÒNG', exact: true }).last().click()
  await expect(host.getByRole('heading', { name: 'CHỜ NGƯỜI CHƠI' })).toBeVisible()
  const roomCode = (await host.locator('.room-share-card strong').textContent())?.trim() ?? ''
  expect(roomCode).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/u)

  const peer = await peerContext.newPage()
  await installHapticsMock(peer)
  await peer.goto(`/?room=${roomCode}`)
  await expect(peer.getByRole('tab', { name: 'THAM GIA' })).toHaveAttribute('aria-selected', 'true')
  await peer.getByLabel('BIỆT DANH').fill('Minh Khoa')
  await peer.getByRole('button', { name: 'THAM GIA PHÒNG' }).click()

  try {
    await expect(host.getByTestId('online-roster-player')).toHaveCount(2)
    await expect(peer.getByTestId('online-roster-player')).toHaveCount(2)
  } catch (error) {
    await attachConvergenceDiagnostics(testInfo, 'roster-failure', [
      { name: 'host', page: host },
      { name: 'peer', page: peer },
    ])
    throw error
  }
  const startButton = host.getByRole('button', { name: 'BẮT ĐẦU ONLINE' })
  await expect(startButton).toBeEnabled()
  await startButton.click()

  await expect(host.getByTestId('number-board')).toBeVisible()
  await expect(peer.getByTestId('number-board')).toBeVisible()
  expect(await host.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  setLocalBomb(roomCode, 81)

  await expect(peer.getByRole('button', { name: 'Chọn số 25' })).toBeDisabled()
  await host.getByRole('button', { name: 'Chọn số 25' }).focus()
  await host.keyboard.press('Enter')
  await expect(peer.getByText('Thiên An đang chọn số 25')).toBeVisible()
  await Promise.all([
    observeResultOnset(host, '.resolution-overlay--safe'),
    observeResultOnset(peer, '.resolution-overlay--safe'),
  ])
  await host.getByRole('button', { name: 'KHÓA SỐ' }).focus()
  await host.keyboard.press('Enter')

  try {
    await expect.poll(() => readResultText(host)).toContain('AN TOÀN')
    await expect.poll(() => readResultText(peer)).toContain('AN TOÀN')
  } catch (error) {
    await attachConvergenceDiagnostics(testInfo, 'safe-failure', [
      { name: 'host', page: host },
      { name: 'peer', page: peer },
    ])
    throw error
  }
  await expect(host.getByTestId('online-valid-range')).toContainText('26')
  await expect(peer.getByTestId('online-valid-range')).toContainText('26')
  await expect(host.getByTestId('online-current-player')).toHaveText('Minh Khoa')
  await expectSynchronizedOnset(host, peer)

  await host.reload()
  await expect(host.getByTestId('number-board')).toBeVisible()
  await expect(host.getByTestId('online-current-player')).toHaveText('Minh Khoa')

  await peer.getByRole('button', { name: 'Chọn số 81' }).click()
  await Promise.all([
    observeResultOnset(host, '[data-testid="online-boom-result"]'),
    observeResultOnset(peer, '[data-testid="online-boom-result"]'),
  ])
  await peer.getByRole('button', { name: 'KHÓA SỐ' }).click()

  await expect(peer.getByTestId('online-boom-result')).toHaveAttribute('data-impact-profile', 'victim')
  await expect(host.getByTestId('online-boom-result')).toHaveAttribute('data-impact-profile', 'spectator')
  await expect(peer.getByTestId('online-boom-result')).toContainText('Minh Khoa đã kích nổ quả bom.')
  await expect(host.getByTestId('online-boom-result')).toContainText('81')
  await expectSynchronizedOnset(host, peer)
  await expect.poll(async () => (await readAudioDiagnostics(peer)).activeRingingSources).toBe(5)
  await expect.poll(async () => (await readAudioDiagnostics(host)).activeRingingSources).toBe(0)
  expect((await readAudioDiagnostics(peer)).lastBoomImpactGain).toBeCloseTo(1.65)
  expect((await readAudioDiagnostics(host)).lastBoomImpactGain).toBeCloseTo(0.7425)
  expect(await readHapticCalls(peer)).toContainEqual([70, 30, 120])
  expect(await readHapticCalls(host)).toContainEqual([30, 25, 45])

  await host.getByRole('button', { name: 'VỀ PHÒNG CHỜ' }).click()
  await expect(host.getByRole('heading', { name: 'CHỜ NGƯỜI CHƠI' })).toBeVisible()
  await expect(peer.getByRole('heading', { name: 'CHỜ NGƯỜI CHƠI' })).toBeVisible()
  await expect(host.getByRole('button', { name: 'BẮT ĐẦU ONLINE' })).toBeEnabled()
  await host.getByRole('button', { name: 'BẮT ĐẦU ONLINE' }).click()
  await expect(peer.getByTestId('number-board')).toBeVisible()
  setLocalBomb(roomCode, 81)
  await host.getByRole('button', { name: 'Chọn số 81' }).click()
  await host.getByRole('button', { name: 'KHÓA SỐ' }).click()
  await expect(host.getByTestId('online-boom-result')).toHaveAttribute('data-impact-profile', 'victim')
  await expect.poll(async () => (await readAudioDiagnostics(host)).activeRingingSources).toBe(5)
  expect(await host.getByTestId('online-boom-result').evaluate((element) =>
    window.getComputedStyle(element).animationName)).toBe('none')
  await host.getByRole('button', { name: 'CHƠI LẠI' }).click()
  await expect(host.getByTestId('online-candidate-count')).toHaveText('99')
  await expect(peer.getByTestId('online-candidate-count')).toHaveText('99')

  await hostContext.close()
  await peerContext.close()
})

test('a Postgres wake during bootstrap snapshot drains into a newer roster snapshot', async ({ browser }) => {
  test.setTimeout(30_000)
  const hostContext = await browser.newContext()
  const peerContext = await browser.newContext()
  await hostContext.addInitScript(() => {
    window.__BOM_SO_ONLINE_CONVERGENCE_DIAGNOSTICS__ = []
  })

  const host = await createOnlinePage(hostContext)
  let markSnapshotCaptured!: () => void
  const snapshotCaptured = new Promise<void>((resolve) => { markSnapshotCaptured = resolve })
  let releaseSnapshot!: () => void
  const snapshotRelease = new Promise<void>((resolve) => { releaseSnapshot = resolve })
  let holdFirstSnapshot = true

  await host.route('**/rest/v1/rpc/get_room_snapshot', async (route) => {
    if (!holdFirstSnapshot) {
      await route.continue()
      return
    }
    holdFirstSnapshot = false
    const response = await route.fetch()
    markSnapshotCaptured()
    await snapshotRelease
    await route.fulfill({ response })
  })

  await host.getByLabel('BIỆT DANH').fill('Bootstrap Host')
  await host.getByRole('button', { name: 'TẠO PHÒNG', exact: true }).last().click()
  await expect(host.getByRole('heading', { name: 'CHỜ NGƯỜI CHƠI' })).toBeVisible()
  const roomCode = (await host.locator('.room-share-card strong').textContent())?.trim() ?? ''
  await snapshotCaptured

  const peer = await peerContext.newPage()
  await installHapticsMock(peer)
  await peer.goto(`/?room=${roomCode}`)
  await peer.getByLabel('BIỆT DANH').fill('Bootstrap Peer')
  await peer.getByRole('button', { name: 'THAM GIA PHÒNG' }).click()
  await expect(peer.getByTestId('online-roster-player')).toHaveCount(2)

  await expect.poll(async () => {
    const events = await readConvergenceDiagnostics(host)
    return {
      playerInsert: events.some((event) => event.kind === 'POSTGRES_WAKE'
        && event.table === 'room_players'
        && event.eventType === 'INSERT'),
      roomVersion: events.some((event) => event.kind === 'POSTGRES_WAKE'
        && event.table === 'rooms'
        && event.roomVersion === 2),
      coalesced: events.some((event) => event.kind === 'SNAPSHOT_COALESCED'
        && event.reason === 'TRAILING_RECOVERY_QUEUED'),
    }
  }).toEqual({ playerInsert: true, roomVersion: true, coalesced: true })

  await peerContext.close()
  releaseSnapshot()
  await expect(host.getByTestId('online-roster-player')).toHaveCount(2)
  await expect.poll(async () => (await readConvergenceDiagnostics(host)).filter(
    (event) => event.kind === 'SNAPSHOT_REQUEST',
  ).length).toBeGreaterThanOrEqual(2)

  await hostContext.close()
})

test('four isolated devices keep canonical turn restrictions and seat rotation', async ({ browser }) => {
  test.setTimeout(60_000)
  const contexts = await Promise.all(Array.from({ length: 4 }, () => browser.newContext()))
  const host = await createOnlinePage(contexts[0])
  await host.getByLabel('BIỆT DANH').fill('P1 Host')
  await host.getByRole('button', { name: 'TẠO PHÒNG', exact: true }).last().click()
  await expect(host.getByRole('heading', { name: 'CHỜ NGƯỜI CHƠI' })).toBeVisible()
  const roomCode = (await host.locator('.room-share-card strong').textContent())?.trim() ?? ''

  const peers: Page[] = []
  for (let index = 1; index < contexts.length; index += 1) {
    const page = await contexts[index].newPage()
    peers.push(page)
    await page.goto(`/?room=${roomCode}`)
    await page.getByLabel('BIỆT DANH').fill(`P${index + 1} Peer`)
    await page.getByRole('button', { name: 'THAM GIA PHÒNG' }).click()
    await expect(page.getByRole('heading', { name: 'CHỜ NGƯỜI CHƠI' })).toBeVisible()
  }

  await expect(host.getByTestId('online-roster-player')).toHaveCount(4)
  await expect(host.getByRole('button', { name: 'BẮT ĐẦU ONLINE' })).toBeEnabled()
  await host.getByRole('button', { name: 'BẮT ĐẦU ONLINE' }).click()
  await expect(peers[2].getByTestId('number-board')).toBeVisible()
  setLocalBomb(roomCode, 81)

  const pages = [host, ...peers]
  const safePicks = [25, 90, 40, 85]
  for (let turn = 0; turn < safePicks.length; turn += 1) {
    const actor = pages[turn]
    const blocked = pages[(turn + 1) % pages.length]
    await expect(actor.getByTestId('online-current-player')).toHaveText(`P${turn + 1} ${turn === 0 ? 'Host' : 'Peer'}`)
    await expect(blocked.getByRole('button', { name: `Chọn số ${safePicks[turn]}` })).toBeDisabled()
    await actor.getByRole('button', { name: `Chọn số ${safePicks[turn]}` }).click()
    await actor.getByRole('button', { name: 'KHÓA SỐ' }).click()
    await expect(pages[(turn + 1) % pages.length].getByTestId('online-current-player'))
      .toHaveText(`P${(turn + 1) % pages.length + 1} ${(turn + 1) % pages.length === 0 ? 'Host' : 'Peer'}`)
  }

  await expect(host.getByTestId('online-current-player')).toHaveText('P1 Host')
  await Promise.all(contexts.map((context) => context.close()))
})

test('friends leaving are removed from turn order and current departure advances canonically', async ({ browser }) => {
  test.setTimeout(45_000)
  const contexts = await Promise.all(Array.from({ length: 4 }, () => browser.newContext()))
  const host = await createOnlinePage(contexts[0])
  const roomCode = await createLobbyRoom(host, 'Leave P1')
  const pages = [host]

  for (let index = 1; index < contexts.length; index += 1) {
    const peer = await contexts[index].newPage()
    await joinLobbyRoom(peer, roomCode, `Leave P${index + 1}`)
    pages.push(peer)
  }

  await expect(host.getByTestId('online-roster-player')).toHaveCount(4)
  await host.getByRole('button', { name: 'BẮT ĐẦU ONLINE' }).click()
  await expect(pages[3].getByTestId('number-board')).toBeVisible()
  setLocalBomb(roomCode, 81)

  await pages[3].getByRole('button', { name: 'RỜI', exact: true }).click()
  await expect(host.locator('.turn-order li')).toHaveCount(3)
  await expect(host.locator('.turn-order')).not.toContainText('Leave P4')
  await expect(host.getByTestId('online-current-player')).toHaveText('Leave P1')
  await expect(host.getByTestId('online-room-activity').filter({
    hasText: 'Leave P4 ĐÃ RỜI PHÒNG.',
  })).toHaveCount(1)

  await host.getByRole('button', { name: 'RỜI', exact: true }).click()
  await expect(pages[1].getByTestId('online-current-player')).toHaveText('Leave P2')
  await expect(pages[2].getByTestId('online-current-player')).toHaveText('Leave P2')
  await expect(pages[1].locator('.turn-order li')).toHaveCount(2)
  await expect(pages[1].locator('.turn-order')).not.toContainText('Leave P1')
  await expect(pages[1].locator('.turn-order')).not.toContainText('Leave P4')
  await expect(pages[1].getByTestId('online-room-activity').filter({
    hasText: 'Leave P1 ĐÃ RỜI PHÒNG.',
  })).toHaveCount(1)

  await pages[1].getByRole('button', { name: 'Chọn số 25' }).click()
  await pages[1].getByRole('button', { name: 'KHÓA SỐ' }).click()
  await expect(pages[1].getByTestId('online-valid-range')).toContainText('26')
  await expect(pages[2].getByTestId('online-current-player')).toHaveText('Leave P3')

  await Promise.all(contexts.map((context) => context.close()))
})

test('two friends shrink to solo SAFE continuation, then the empty room closes', async ({ browser }) => {
  test.setTimeout(35_000)
  const hostContext = await browser.newContext()
  const peerContext = await browser.newContext()
  const host = await createOnlinePage(hostContext)
  const roomCode = await createLobbyRoom(host, 'Solo Leaver')
  const peer = await peerContext.newPage()
  await joinLobbyRoom(peer, roomCode, 'Solo Friend')
  await expect(host.getByTestId('online-roster-player')).toHaveCount(2)

  await host.getByRole('button', { name: 'BẮT ĐẦU ONLINE' }).click()
  await expect(peer.getByTestId('number-board')).toBeVisible()
  setLocalBomb(roomCode, 81)

  await host.getByRole('button', { name: 'RỜI', exact: true }).click()
  await expect(peer.getByTestId('online-current-player')).toHaveText('Solo Friend')
  await expect(peer.locator('.turn-order li')).toHaveCount(1)
  await expect(peer.locator('.turn-order')).toHaveText(/Solo Friend/u)
  await expect(peer.getByTestId('online-room-activity').filter({
    hasText: 'Solo Leaver ĐÃ RỜI PHÒNG.',
  })).toHaveCount(1)

  await peer.getByRole('button', { name: 'Chọn số 25' }).click()
  await peer.getByRole('button', { name: 'KHÓA SỐ' }).click()
  await expect(peer.getByTestId('online-valid-range')).toContainText('26')
  await expect(peer.getByTestId('online-current-player')).toHaveText('Solo Friend')
  await expect(peer.locator('.turn-order li')).toHaveCount(1)

  const beforeClose = readLocalRoomLifecycle(roomCode)
  expect(beforeClose).toMatchObject({
    roomStatus: 'PLAYING',
    activeMemberships: 1,
    gamePhase: 'PLAYING_TURN',
    actionCount: 3,
  })

  await peer.getByRole('button', { name: 'RỜI', exact: true }).click()
  await expect(peer.getByRole('button', { name: 'CHƠI ONLINE' })).toBeVisible()
  await expect(peer.getByTestId('number-board')).toHaveCount(0)
  const closed = readLocalRoomLifecycle(roomCode)
  expect(closed).toMatchObject({
    roomStatus: 'CLOSED',
    activeMemberships: 0,
    gamePhase: 'PLAYING_TURN',
    actionCount: 3,
  })

  await hostContext.close()
  await peerContext.close()
})

test('Cron synchronizes SELF_DESTRUCT copy after a deadline reload', async ({ browser }) => {
  test.setTimeout(30_000)
  const hostContext = await browser.newContext()
  const peerContext = await browser.newContext()
  const host = await createOnlinePage(hostContext)

  await host.getByLabel('BIỆT DANH').fill('Deadline Host')
  await host.getByLabel('KHI HẾT GIỜ').selectOption('SELF_DESTRUCT')
  await host.getByRole('button', { name: 'TẠO PHÒNG', exact: true }).last().click()
  const roomCode = (await host.locator('.room-share-card strong').textContent())?.trim() ?? ''

  const peer = await peerContext.newPage()
  await peer.goto(`/?room=${roomCode}`)
  await peer.getByLabel('BIỆT DANH').fill('Deadline Peer')
  await peer.getByRole('button', { name: 'THAM GIA PHÒNG' }).click()
  await expect(host.getByTestId('online-roster-player')).toHaveCount(2)
  await host.getByRole('button', { name: 'BẮT ĐẦU ONLINE' }).click()
  await expect(peer.getByTestId('number-board')).toBeVisible()

  expireLocalTurn(roomCode)
  await host.reload()

  await expect(host.getByTestId('online-boom-result')).toHaveAttribute('data-impact-profile', 'victim')
  await expect(peer.getByTestId('online-boom-result')).toHaveAttribute('data-impact-profile', 'spectator')
  await expect(host.getByTestId('online-boom-result')).toContainText('Deadline Host đã để thời gian cạn kiệt.')
  await expect(peer.getByTestId('online-boom-result')).not.toContainText('đã kích nổ quả bom')

  await hostContext.close()
  await peerContext.close()
})
