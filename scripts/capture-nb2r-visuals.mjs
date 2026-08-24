import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const baseUrl = process.env.BOM_SO_QA_URL ?? 'http://127.0.0.1:41741'
const outputDirectory = 'qa-artifacts/visual-nb2r'
const metrics = []

await mkdir(outputDirectory, { recursive: true })
const browser = await chromium.launch()

async function startGame(page) {
  await page.goto(baseUrl)
  await page.getByRole('button', { name: 'BẮT ĐẦU' }).click()
  await page.getByTestId('number-board').waitFor()
  await page.mouse.move(0, 0)
}

async function chooseSafe(page, number, safeCapture) {
  await page.getByRole('button', { name: `Chọn số ${number}`, exact: true }).click()
  await page.getByRole('button', { name: 'KHÓA SỐ' }).click()
  const safe = page.getByRole('heading', { name: 'AN TOÀN' })
  await safe.waitFor({ state: 'attached' })
  if (safeCapture) {
    await page.waitForFunction(() => {
      const overlay = document.querySelector('.resolution-overlay--safe')
      return overlay && Number.parseFloat(getComputedStyle(overlay).opacity) >= 0.75
    })
    await page.screenshot({ path: `${outputDirectory}/${safeCapture}.png` })
  }
  await safe.waitFor({ state: 'detached' })
  await page.mouse.move(0, 0)
}

async function capture(page, name, expectedCount) {
  const snapshot = await page.evaluate(({ stateName, count }) => {
    const game = document.querySelector('.game-screen')
    const header = document.querySelector('.game-header')
    const hud = document.querySelector('.turn-panel')
    const stage = document.querySelector('[data-testid="board-stage"]')
    const board = document.querySelector('[data-testid="number-board"]')
    const dock = document.querySelector('.lock-dock')
    const cells = board ? [...board.querySelectorAll('.number-cell')] : []
    const firstCell = cells[0]?.getBoundingClientRect() ?? null
    const firstTop = firstCell ? Math.round(firstCell.top) : null
    return {
      name: stateName,
      expectedCount: count,
      viewport: { width: innerWidth, height: innerHeight },
      document: {
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
      },
      gameHeight: game?.getBoundingClientRect().height ?? null,
      headerBottom: header?.getBoundingClientRect().bottom ?? null,
      hudBottom: hud?.getBoundingClientRect().bottom ?? null,
      stageBottom: stage?.getBoundingClientRect().bottom ?? null,
      dockTop: dock?.getBoundingClientRect().top ?? null,
      dockBottom: dock?.getBoundingClientRect().bottom ?? null,
      candidateCount: cells.length,
      density: board?.getAttribute('data-density') ?? null,
      boardScrolls: Boolean(board && board.scrollHeight > board.clientHeight + 1),
      boardClientHeight: board?.clientHeight ?? null,
      boardScrollHeight: board?.scrollHeight ?? null,
      firstRowCount:
        firstTop === null
          ? null
          : cells.filter((cell) => Math.round(cell.getBoundingClientRect().top) === firstTop).length,
      cellWidth: firstCell?.width ?? null,
      cellHeight: firstCell?.height ?? null,
    }
  }, { stateName: name, count: expectedCount })

  if (snapshot.document.width > snapshot.viewport.width) {
    throw new Error(`${name}: horizontal overflow ${JSON.stringify(snapshot)}`)
  }
  if (snapshot.viewport.width <= 640 && snapshot.document.height > snapshot.viewport.height) {
    throw new Error(`${name}: mobile shell exceeds viewport ${JSON.stringify(snapshot)}`)
  }
  if (snapshot.viewport.width <= 640 && snapshot.dockBottom !== null) {
    if (snapshot.dockBottom > snapshot.viewport.height + 0.5) {
      throw new Error(`${name}: action dock is not reachable ${JSON.stringify(snapshot)}`)
    }
    if (snapshot.stageBottom !== null && snapshot.dockTop !== null && snapshot.stageBottom > snapshot.dockTop + 0.5) {
      throw new Error(`${name}: action dock overlaps board stage ${JSON.stringify(snapshot)}`)
    }
  }
  if (expectedCount !== null && snapshot.candidateCount !== expectedCount) {
    throw new Error(`${name}: candidate mismatch ${JSON.stringify(snapshot)}`)
  }

  metrics.push(snapshot)
  await page.screenshot({ path: `${outputDirectory}/${name}.png` })
}

async function playToCritical(page) {
  await chooseSafe(page, 62)
  await chooseSafe(page, 86)
  await chooseSafe(page, 75)
  for (const pick of [84, 77, 83]) await chooseSafe(page, pick)
}

try {
  const mobile390 = await browser.newPage({ viewport: { width: 390, height: 844 } })
  await mobile390.goto(baseUrl)
  await mobile390.screenshot({ path: `${outputDirectory}/mobile-390-setup.png`, fullPage: true })
  await mobile390.getByRole('button', { name: 'BẮT ĐẦU' }).click()
  await mobile390.getByTestId('number-board').waitFor()
  await mobile390.mouse.move(0, 0)
  await capture(mobile390, 'mobile-390-opening-99', 99)

  await mobile390.getByTestId('number-board').evaluate((board) => {
    board.scrollTop = board.scrollHeight
  })
  await mobile390.getByRole('button', { name: 'Chọn số 95', exact: true }).click()
  await capture(mobile390, 'mobile-390-selected-95', 99)
  await mobile390.getByRole('button', { name: 'ĐỔI SỐ' }).click()
  await mobile390.getByTestId('number-board').evaluate((board) => {
    board.scrollTop = 0
  })

  await chooseSafe(mobile390, 62, 'mobile-390-safe')
  await chooseSafe(mobile390, 86)
  await capture(mobile390, 'mobile-390-focused-23', 23)
  await chooseSafe(mobile390, 75)
  await capture(mobile390, 'mobile-390-danger-10', 10)
  for (const pick of [84, 77, 83]) await chooseSafe(mobile390, pick)
  await capture(mobile390, 'mobile-390-critical-5', 5)
  await chooseSafe(mobile390, 79)
  await capture(mobile390, 'mobile-390-terminal-3', 3)
  await chooseSafe(mobile390, 82)
  await capture(mobile390, 'mobile-390-terminal-2', 2)
  await chooseSafe(mobile390, 80)
  await capture(mobile390, 'mobile-390-final-1', 0)
  await mobile390.getByRole('button', { name: 'KÍCH NỔ' }).click()
  await mobile390.getByTestId('boom-result').waitFor()
  await mobile390.waitForTimeout(320)
  await mobile390.screenshot({ path: `${outputDirectory}/mobile-390-boom.png` })

  const mobile440 = await browser.newPage({ viewport: { width: 440, height: 956 } })
  await startGame(mobile440)
  await capture(mobile440, 'mobile-440-opening-99', 99)
  await chooseSafe(mobile440, 62)
  await chooseSafe(mobile440, 86)
  await capture(mobile440, 'mobile-440-mid-23', 23)
  await chooseSafe(mobile440, 75)
  for (const pick of [84, 77, 83]) await chooseSafe(mobile440, pick)
  await capture(mobile440, 'mobile-440-critical-5', 5)
  await mobile440.getByRole('button', { name: 'Chọn số 81', exact: true }).click()
  await mobile440.getByRole('button', { name: 'KHÓA SỐ' }).click()
  await mobile440.getByTestId('boom-result').waitFor()
  await mobile440.waitForTimeout(320)
  await mobile440.screenshot({ path: `${outputDirectory}/mobile-440-boom.png` })

  for (const viewport of [
    { width: 1366, height: 768, name: 'desktop-1366-opening' },
    { width: 1440, height: 900, name: 'desktop-1440-opening' },
  ]) {
    const desktop = await browser.newPage({
      viewport: { width: viewport.width, height: viewport.height },
    })
    await startGame(desktop)
    await capture(desktop, viewport.name, 99)
    await desktop.close()
  }

  const reducedContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
  })
  const reduced = await reducedContext.newPage()
  await startGame(reduced)
  await reduced.getByRole('button', { name: 'Chọn số 81', exact: true }).click()
  await reduced.getByRole('button', { name: 'KHÓA SỐ' }).click()
  await reduced.getByTestId('boom-result').waitFor()
  await reduced.waitForTimeout(180)
  await reduced.screenshot({ path: `${outputDirectory}/mobile-390-reduced-motion-boom.png` })
  await reducedContext.close()
} finally {
  await writeFile(
    `${outputDirectory}/layout-metrics.json`,
    `${JSON.stringify(metrics, null, 2)}\n`,
    'utf8',
  )
  await browser.close()
}

console.log(`NB-2R visual captures and metrics written to ${outputDirectory}`)
