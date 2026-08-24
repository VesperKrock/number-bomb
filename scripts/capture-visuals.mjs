import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const baseUrl = process.env.BOM_SO_QA_URL ?? 'http://127.0.0.1:41739'
const outputDirectory = 'qa-artifacts/visual-nb2p'
const metrics = []

await mkdir(outputDirectory, { recursive: true })
const browser = await chromium.launch()

async function startDefaultGame(page) {
  await page.goto(baseUrl)
  await page.getByRole('button', { name: 'CHƠI CÙNG NHAU' }).click()
  await page.getByRole('button', { name: 'BẮT ĐẦU' }).click()
  await page.getByTestId('number-board').waitFor()
}

async function chooseAndLock(page, number) {
  await page.getByRole('button', { name: `Chọn số ${number}` }).click()
  await page.getByRole('button', { name: 'KHÓA SỐ' }).click()
}

async function chooseSafe(page, number, captures = {}) {
  const scanning = page.locator('.resolution-overlay--suspense')
  await page.getByRole('button', { name: `Chọn số ${number}` }).click()
  const scanningVisible = scanning.waitFor({ state: 'visible' })
  await page.getByRole('button', { name: 'KHÓA SỐ' }).click()
  await scanningVisible
  if (captures.scanning) {
    await page.screenshot({ path: `${outputDirectory}/${captures.scanning}.png` })
  }

  const safeHeading = page.getByRole('heading', { name: 'AN TOÀN' })
  await safeHeading.waitFor({ state: 'visible' })
  if (captures.safe) {
    await page.screenshot({ path: `${outputDirectory}/${captures.safe}.png` })
  }
  await safeHeading.waitFor({ state: 'hidden' })
}

async function captureState(page, name, expectedCount, expectedRange, options = {}) {
  const snapshot = await page.evaluate(({ stateName, count, range }) => {
    const hud = document.querySelector('.turn-panel')
    const system = document.querySelector('.turn-panel__tension')
    const stage = document.querySelector('[data-testid="board-stage"]')
    const board = document.querySelector('[data-testid="number-board"]')
    const dock = document.querySelector('.lock-dock')
    const cells = board ? [...board.querySelectorAll('.number-cell')] : []
    const hudLabels = [...document.querySelectorAll(
      '.status-kicker, .turn-panel__metrics > div > span',
    )]
    const rects = cells.map((cell) => cell.getBoundingClientRect())
    const clusterLeft = rects.length ? Math.min(...rects.map((rect) => rect.left)) : null
    const clusterRight = rects.length ? Math.max(...rects.map((rect) => rect.right)) : null
    const boardRect = board?.getBoundingClientRect() ?? null
    const stageRect = stage?.getBoundingClientRect() ?? null
    const dockRect = dock?.getBoundingClientRect() ?? null
    return {
      name: stateName,
      expectedCount: count,
      expectedRange: range,
      viewport: { width: innerWidth, height: innerHeight },
      document: {
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
      },
      hudVisible: Boolean(hud && hud.getBoundingClientRect().bottom <= innerHeight),
      systemVisible: Boolean(system && system.getBoundingClientRect().height > 0),
      candidateCount: cells.length,
      firstCandidate: cells[0]?.textContent?.trim() ?? null,
      lastCandidate: cells.at(-1)?.textContent?.trim() ?? null,
      density: board?.getAttribute('data-density') ?? null,
      minimumHudLabelSize: hudLabels.length
        ? Math.min(...hudLabels.map((label) => Number.parseFloat(getComputedStyle(label).fontSize)))
        : null,
      candidateFontSize: cells.length
        ? Number.parseFloat(getComputedStyle(cells[0]).fontSize)
        : null,
      helperFontSize: board
        ? Number.parseFloat(getComputedStyle(document.querySelector('.board-heading p')).fontSize)
        : null,
      boardScrolls: Boolean(board && board.scrollHeight > board.clientHeight + 1),
      centerOffset:
        boardRect && clusterLeft !== null && clusterRight !== null
          ? Math.abs(boardRect.left + boardRect.width / 2 - (clusterLeft + clusterRight) / 2)
          : null,
      actionOverlap:
        stageRect && dockRect ? Math.max(0, stageRect.bottom - dockRect.top) : 0,
    }
  }, { stateName: name, count: expectedCount, range: expectedRange })

  if (snapshot.document.width > snapshot.viewport.width) {
    throw new Error(`${name}: horizontal overflow ${JSON.stringify(snapshot)}`)
  }
  if (!snapshot.hudVisible || !snapshot.systemVisible) {
    throw new Error(`${name}: HUD/system status is not preserved ${JSON.stringify(snapshot)}`)
  }
  if (snapshot.actionOverlap > 0.5) {
    throw new Error(`${name}: action dock overlaps board ${JSON.stringify(snapshot)}`)
  }
  if (expectedCount !== null && snapshot.candidateCount !== expectedCount) {
    throw new Error(`${name}: candidate count mismatch ${JSON.stringify(snapshot)}`)
  }
  if (options.requireViewportFit && snapshot.document.height > snapshot.viewport.height) {
    throw new Error(`${name}: desktop document exceeds viewport ${JSON.stringify(snapshot)}`)
  }
  if (options.requireNoBoardScroll && snapshot.boardScrolls) {
    throw new Error(`${name}: desktop board scrolls unexpectedly ${JSON.stringify(snapshot)}`)
  }
  if (snapshot.viewport.width > 780 && snapshot.minimumHudLabelSize < 11.4) {
    throw new Error(`${name}: HUD labels remain too small ${JSON.stringify(snapshot)}`)
  }
  if (snapshot.viewport.width > 780 && snapshot.candidateCount > 0 && snapshot.candidateFontSize < 16) {
    throw new Error(`${name}: opening candidates remain too small ${JSON.stringify(snapshot)}`)
  }

  metrics.push(snapshot)
  await page.screenshot({ path: `${outputDirectory}/${name}.png` })
}

try {
  const wide = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await wide.goto(baseUrl)
  await wide.getByRole('button', { name: 'CHƠI CÙNG NHAU' }).click()
  await wide.screenshot({ path: `${outputDirectory}/desktop-wide-setup.png`, fullPage: true })
  await wide.getByRole('button', { name: 'BẮT ĐẦU' }).click()
  await wide.getByTestId('number-board').waitFor()
  await captureState(wide, 'desktop-wide-99', 99, '1–99', {
    requireViewportFit: true,
    requireNoBoardScroll: true,
  })

  await chooseSafe(wide, 62, {
    scanning: 'desktop-wide-lock-scanning',
    safe: 'desktop-wide-safe',
  })
  await chooseSafe(wide, 86)
  await captureState(wide, 'desktop-wide-23', 23, '63–85', {
    requireViewportFit: true,
    requireNoBoardScroll: true,
  })

  await chooseSafe(wide, 75)
  await captureState(wide, 'desktop-wide-10', 10, '76–85', {
    requireViewportFit: true,
    requireNoBoardScroll: true,
  })

  for (const number of [84, 77, 83]) await chooseSafe(wide, number)
  await captureState(wide, 'desktop-wide-5', 5, '78–82', {
    requireViewportFit: true,
    requireNoBoardScroll: true,
  })

  await chooseSafe(wide, 79)
  await captureState(wide, 'desktop-wide-3', 3, '80–82', {
    requireViewportFit: true,
    requireNoBoardScroll: true,
  })
  await chooseSafe(wide, 82)
  await captureState(wide, 'desktop-wide-2', 2, '80–81', {
    requireViewportFit: true,
    requireNoBoardScroll: true,
  })
  await chooseSafe(wide, 80)
  await captureState(wide, 'desktop-wide-final-1', 0, '81–81', {
    requireViewportFit: true,
  })
  await wide.getByRole('button', { name: 'KÍCH NỔ' }).click()
  await wide.getByTestId('boom-result').waitFor()
  await wide.waitForTimeout(900)
  await wide.screenshot({ path: `${outputDirectory}/desktop-wide-boom.png` })

  const laptop = await browser.newPage({ viewport: { width: 1366, height: 768 } })
  await startDefaultGame(laptop)
  await captureState(laptop, 'desktop-laptop-99', 99, '1–99', {
    requireViewportFit: true,
    requireNoBoardScroll: true,
  })
  await chooseSafe(laptop, 62)
  await chooseSafe(laptop, 86)
  await captureState(laptop, 'desktop-laptop-23', 23, '63–85', {
    requireViewportFit: true,
    requireNoBoardScroll: true,
  })
  await laptop.getByRole('button', { name: 'Chọn số 75' }).click()
  await captureState(laptop, 'desktop-laptop-selection-dock', 23, '63–85', {
    requireViewportFit: true,
    requireNoBoardScroll: true,
  })

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } })
  await mobile.goto(baseUrl)
  await mobile.getByRole('button', { name: 'CHƠI CÙNG NHAU' }).click()
  await mobile.screenshot({ path: `${outputDirectory}/mobile-setup.png`, fullPage: true })
  await mobile.getByRole('button', { name: 'BẮT ĐẦU' }).click()
  await mobile.getByTestId('number-board').waitFor()
  await captureState(mobile, 'mobile-99', 99, '1–99')
  await chooseSafe(mobile, 62)
  await chooseSafe(mobile, 86)
  await captureState(mobile, 'mobile-23', 23, '63–85')
  await mobile.getByRole('button', { name: 'Chọn số 75' }).click()
  await captureState(mobile, 'mobile-selection-dock', 23, '63–85')
  await mobile.getByRole('button', { name: 'ĐỔI SỐ' }).click()
  await chooseSafe(mobile, 75)
  await captureState(mobile, 'mobile-10', 10, '76–85')
  for (const number of [84, 77, 83]) await chooseSafe(mobile, number)
  await captureState(mobile, 'mobile-5', 5, '78–82')
  await chooseSafe(mobile, 79)
  await captureState(mobile, 'mobile-3', 3, '80–82')
  await chooseSafe(mobile, 82)
  await chooseSafe(mobile, 80)
  await captureState(mobile, 'mobile-final-1', 0, '81–81')
  await mobile.getByRole('button', { name: 'KÍCH NỔ' }).click()
  await mobile.getByTestId('boom-result').waitFor()
  await mobile.waitForTimeout(900)
  await mobile.screenshot({ path: `${outputDirectory}/mobile-boom.png` })

  const reducedContext = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    reducedMotion: 'reduce',
  })
  const reduced = await reducedContext.newPage()
  await startDefaultGame(reduced)
  await chooseAndLock(reduced, 81)
  await reduced.locator('.resolution-overlay--suspense').waitFor()
  await reduced.screenshot({ path: `${outputDirectory}/reduced-motion-lock.png` })
  await reduced.getByTestId('boom-result').waitFor()
  await reduced.waitForTimeout(250)
  await reduced.screenshot({ path: `${outputDirectory}/reduced-motion-boom.png` })
  await reducedContext.close()
} finally {
  await writeFile(
    `${outputDirectory}/layout-metrics.json`,
    `${JSON.stringify(metrics, null, 2)}\n`,
    'utf8',
  )
  await browser.close()
}

console.log(`NB-2P visual captures and layout metrics written to ${outputDirectory}`)
