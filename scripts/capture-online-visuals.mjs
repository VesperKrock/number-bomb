import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const baseUrl = process.env.BOM_SO_QA_URL ?? 'http://127.0.0.1:41742'
const outputDirectory = 'qa-artifacts/visual-nb3b'
const metrics = []

function setLocalBomb(roomCode, bombNumber) {
  if (!/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/u.test(roomCode)) {
    throw new Error('Unsafe room code in local visual helper.')
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

async function capture(page, name) {
  const metric = await page.evaluate((stateName) => {
    const game = document.querySelector('.online-game-screen')
    const header = document.querySelector('.online-game-header')
    const hud = document.querySelector('.online-turn-panel')
    const board = document.querySelector('[data-testid="number-board"]')
    const dock = document.querySelector('.lock-dock')
    const viewport = { width: innerWidth, height: innerHeight }
    return {
      name: stateName,
      viewport,
      windowScrollX: window.scrollX,
      windowScrollY: window.scrollY,
      documentWidth: document.documentElement.scrollWidth,
      documentHeight: document.documentElement.scrollHeight,
      gameHeight: game?.getBoundingClientRect().height ?? null,
      headerBottom: header?.getBoundingClientRect().bottom ?? null,
      hudBottom: hud?.getBoundingClientRect().bottom ?? null,
      boardClientHeight: board?.clientHeight ?? null,
      boardScrollHeight: board?.scrollHeight ?? null,
      boardScrolls: Boolean(board && board.scrollHeight > board.clientHeight + 1),
      boardScrollLeft: board?.scrollLeft ?? null,
      dockTop: dock?.getBoundingClientRect().top ?? null,
      dockBottom: dock?.getBoundingClientRect().bottom ?? null,
      candidateCount: board?.querySelectorAll('.number-cell').length ?? null,
    }
  }, name)

  if (metric.documentWidth > metric.viewport.width) {
    throw new Error(`${name}: horizontal overflow ${JSON.stringify(metric)}`)
  }
  if (metric.windowScrollX !== 0 || (metric.boardScrollLeft ?? 0) !== 0) {
    throw new Error(`${name}: unexpected horizontal scroll ${JSON.stringify(metric)}`)
  }
  if (metric.viewport.width <= 640 && metric.gameHeight !== null) {
    if (metric.gameHeight > metric.viewport.height + 0.5) {
      throw new Error(`${name}: mobile game shell exceeds viewport ${JSON.stringify(metric)}`)
    }
    if (metric.dockBottom !== null && metric.dockBottom > metric.viewport.height + 0.5) {
      throw new Error(`${name}: mobile action dock is unreachable ${JSON.stringify(metric)}`)
    }
  }

  metrics.push(metric)
  await page.screenshot({ path: `${outputDirectory}/${name}.png`, fullPage: !gameLike(metric) })
}

function gameLike(metric) {
  return metric.gameHeight !== null
}

await mkdir(outputDirectory, { recursive: true })
const browser = await chromium.launch()

try {
  const hostContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
  })
  const wideMobileContext = await browser.newContext({ viewport: { width: 440, height: 956 } })
  const host = await hostContext.newPage()

  await host.goto(baseUrl)
  await capture(host, 'desktop-1440-home')
  await host.getByRole('button', { name: 'CHƠI ONLINE' }).click()
  await host.getByRole('tab', { name: 'TẠO PHÒNG' }).waitFor()
  await capture(host, 'desktop-1440-online-entry')
  await host.getByLabel('BIỆT DANH').fill('Visual Host')
  await host.getByRole('button', { name: 'TẠO PHÒNG', exact: true }).last().click()
  await host.getByRole('heading', { name: 'CHỜ NGƯỜI CHƠI' }).waitFor()
  const roomCode = (await host.locator('.room-share-card strong').textContent())?.trim() ?? ''

  const mobile = await mobileContext.newPage()
  await mobile.goto(`${baseUrl}?room=${roomCode}`)
  await mobile.getByLabel('BIỆT DANH').fill('Visual Mobile')
  await mobile.getByRole('button', { name: 'THAM GIA PHÒNG' }).click()
  await mobile.getByRole('heading', { name: 'CHỜ NGƯỜI CHƠI' }).waitFor()

  const wideMobile = await wideMobileContext.newPage()
  await wideMobile.goto(`${baseUrl}?room=${roomCode}`)
  await wideMobile.getByLabel('BIỆT DANH').fill('Visual Wide')
  await wideMobile.getByRole('button', { name: 'THAM GIA PHÒNG' }).click()
  await wideMobile.getByRole('heading', { name: 'CHỜ NGƯỜI CHƠI' }).waitFor()
  await host.getByTestId('online-roster-player').nth(2).waitFor()
  await capture(host, 'desktop-1440-lobby')
  await capture(mobile, 'mobile-390-lobby')
  await capture(wideMobile, 'mobile-440-lobby')

  await host.getByRole('button', { name: 'BẮT ĐẦU ONLINE' }).click()
  await host.getByTestId('number-board').waitFor()
  await mobile.getByTestId('number-board').waitFor()
  await wideMobile.getByTestId('number-board').waitFor()
  setLocalBomb(roomCode, 81)
  await capture(host, 'desktop-1440-game-99')
  await host.setViewportSize({ width: 1366, height: 768 })
  await capture(host, 'desktop-1366-game-99')
  await host.setViewportSize({ width: 1440, height: 900 })
  await capture(mobile, 'mobile-390-game-99')
  await capture(wideMobile, 'mobile-440-game-99')

  await host.getByRole('button', { name: 'Chọn số 25' }).click()
  await capture(host, 'desktop-1440-selection-dock')
  await host.getByRole('button', { name: 'KHÓA SỐ' }).click()
  await host.getByRole('heading', { name: 'AN TOÀN' }).waitFor({ state: 'attached' })
  await capture(host, 'desktop-1440-safe')
  await host.getByRole('heading', { name: 'AN TOÀN' }).waitFor({ state: 'detached' })
  await mobile.getByTestId('online-candidate-count').waitFor()
  await capture(mobile, 'mobile-390-focused-range')

  await mobile.getByRole('button', { name: 'Chọn số 81' }).click()
  await capture(mobile, 'mobile-390-selection-dock')
  await mobile.getByRole('button', { name: 'KHÓA SỐ' }).click()
  await mobile.getByTestId('online-boom-result').waitFor()
  await host.getByTestId('online-boom-result').waitFor()
  await mobile.waitForTimeout(220)
  await capture(mobile, 'mobile-390-reduced-motion-victim')
  await capture(host, 'desktop-1440-spectator-result')

  await hostContext.close()
  await mobileContext.close()
  await wideMobileContext.close()
} finally {
  await writeFile(
    `${outputDirectory}/layout-metrics.json`,
    `${JSON.stringify(metrics, null, 2)}\n`,
    'utf8',
  )
  await browser.close()
}

console.log(`NB-3B visual captures and metrics written to ${outputDirectory}`)
