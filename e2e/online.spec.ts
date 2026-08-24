import { execFileSync } from 'node:child_process'
import { expect, test, type BrowserContext, type Page } from '@playwright/test'

interface AudioDiagnostics {
  activeRingingSources: number
  lastBoomImpactGain: number | null
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

async function observeResultOnset(page: Page, selector: string): Promise<void> {
  await page.evaluate((resultSelector) => {
    const state = { observedAt: null as number | null }
    ;(
      window as typeof window & {
        __BOM_SO_ONLINE_RESULT_ONSET__?: typeof state
      }
    ).__BOM_SO_ONLINE_RESULT_ONSET__ = state

    const capture = () => {
      if (!document.querySelector(resultSelector)) return false
      state.observedAt = Date.now()
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

async function createOnlinePage(context: BrowserContext): Promise<Page> {
  const page = await context.newPage()
  await installHapticsMock(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'CHƠI ONLINE' }).click()
  await expect(page.getByRole('tab', { name: 'TẠO PHÒNG' })).toBeVisible()
  return page
}

test('two isolated devices synchronize lobby, SAFE, reconnect, and victim/spectator BOOM', async ({ browser }) => {
  test.setTimeout(45_000)
  const hostContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
  })
  const peerContext = await browser.newContext()
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

  await expect(host.getByTestId('online-roster-player')).toHaveCount(2)
  await expect(peer.getByTestId('online-roster-player')).toHaveCount(2)
  const startButton = host.getByRole('button', { name: 'BẮT ĐẦU ONLINE' })
  await expect(startButton).toBeEnabled()
  await startButton.click()

  await expect(host.getByTestId('number-board')).toBeVisible()
  await expect(peer.getByTestId('number-board')).toBeVisible()
  expect(await host.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  setLocalBomb(roomCode, 81)

  await expect(peer.getByRole('button', { name: 'Chọn số 25' })).toBeDisabled()
  await host.getByRole('button', { name: 'Chọn số 25' }).click()
  await expect(peer.getByText('Thiên An đang chọn số 25')).toBeVisible()
  await Promise.all([
    observeResultOnset(host, '.resolution-overlay--safe'),
    observeResultOnset(peer, '.resolution-overlay--safe'),
  ])
  await host.getByRole('button', { name: 'KHÓA SỐ' }).click()

  await expect(host.getByRole('heading', { name: 'AN TOÀN' })).toBeAttached()
  await expect(peer.getByRole('heading', { name: 'AN TOÀN' })).toBeAttached()
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
