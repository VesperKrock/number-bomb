import { expect, test, type Page } from '@playwright/test'

interface AudioDiagnostics {
  soundscapeSources: number
  soundscapeTransientSources: number
  activeEffectSources: number
  activeRingingSources: number
  pendingEffectTimers: number
  activeSoundscapeTimers: number
  releasePending: boolean
  contextState: AudioContextState | 'none'
  lastSelectionMultiplier: number | null
  lastLockMultiplier: number | null
  lastBoomImpactGain: number | null
}

type HapticCall = number | number[]

async function installHapticsMock(page: Page) {
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
  return page.evaluate(() =>
    (
      window as typeof window & {
        __BOM_SO_HAPTIC_CALLS__?: HapticCall[]
      }
    ).__BOM_SO_HAPTIC_CALLS__ ?? [],
  )
}

async function setAudioMuted(page: Page, shouldBeMuted: boolean) {
  const unmuteButton = page.getByRole('button', { name: 'Bật âm thanh' })
  const currentlyMuted = await unmuteButton.isVisible()
  if (currentlyMuted === shouldBeMuted) return
  await page
    .getByRole('button', { name: shouldBeMuted ? 'Tắt âm thanh' : 'Bật âm thanh' })
    .click()
  await expect(
    page.getByRole('button', { name: shouldBeMuted ? 'Bật âm thanh' : 'Tắt âm thanh' }),
  ).toBeVisible()
}

async function setRandomStarter(page: Page, shouldRandomize: boolean) {
  const checkbox = page.getByRole('checkbox')
  if ((await checkbox.isChecked()) === shouldRandomize) return
  await checkbox.focus()
  await page.keyboard.press('Space')
  if (shouldRandomize) await expect(checkbox).toBeChecked()
  else await expect(checkbox).not.toBeChecked()
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

async function expectCleanAudioSession(page: Page) {
  await expect
    .poll(() => readAudioDiagnostics(page))
    .toMatchObject({
      soundscapeSources: 0,
      soundscapeTransientSources: 0,
      activeEffectSources: 0,
      activeRingingSources: 0,
      pendingEffectTimers: 0,
      activeSoundscapeTimers: 0,
      releasePending: false,
    })
}

async function readScheduledResolutionDelay(page: Page): Promise<number> {
  const gameScreen = page.locator('.game-screen')
  await expect(gameScreen).toHaveAttribute('data-resolution-delay-ms', /\d+/)
  const value = await gameScreen.getAttribute('data-resolution-delay-ms')
  if (value === null) throw new Error('Resolution delay diagnostics are unavailable')
  return Number(value)
}

async function startResultTimingObservation(page: Page, selector: string) {
  await page.evaluate((resultSelector) => {
    const state = {
      startedAt: null as number | null,
      observedAt: null as number | null,
    }
    ;(
      window as typeof window & {
        __BOM_SO_RESULT_TIMING__?: typeof state
      }
    ).__BOM_SO_RESULT_TIMING__ = state

    const recordLock = (event: Event) => {
      const target = event.target
      if (!(target instanceof Element) || !target.closest('.lock-button')) return
      state.startedAt = performance.now()
      document.removeEventListener('click', recordLock, true)
    }
    document.addEventListener('click', recordLock, true)

    const observer = new MutationObserver(() => {
      if (!document.querySelector(resultSelector)) return
      state.observedAt = performance.now()
      observer.disconnect()
    })
    observer.observe(document.documentElement, { childList: true, subtree: true })
  }, selector)
}

async function readObservedResultDelay(page: Page): Promise<number> {
  return page.evaluate(() => {
    const state = (
      window as typeof window & {
        __BOM_SO_RESULT_TIMING__?: {
          startedAt: number | null
          observedAt: number | null
        }
      }
    ).__BOM_SO_RESULT_TIMING__
    if (!state || state.startedAt === null || state.observedAt === null) {
      throw new Error('Result timing observation is unavailable')
    }
    return state.observedAt - state.startedAt
  })
}

async function enterLocalMode(page: Page) {
  const startButton = page.getByRole('button', { name: /BẮT ĐẦU/u })
  if (await startButton.isVisible()) return
  await page.getByRole('button', { name: /CHƠI CÙNG NHAU/u }).click()
  await expect(startButton).toBeVisible()
}

async function startGame(page: Page, playerCount = 2) {
  await page.goto('/')
  await enterLocalMode(page)
  if (playerCount !== 2) {
    await page.getByRole('button', { name: new RegExp(`${playerCount} NGƯỜI`) }).click()
  }
  await page.getByRole('button', { name: 'BẮT ĐẦU' }).click()
  await expect(page.getByTestId('number-board')).toBeVisible()
}

async function chooseAndLock(page: Page, number: number) {
  await page.getByRole('button', { name: `Chọn số ${number}` }).click()
  await page.getByRole('button', { name: 'KHÓA SỐ' }).click()
}

async function chooseSafe(page: Page, number: number) {
  await chooseAndLock(page, number)
  const safeHeading = page.getByRole('heading', { name: 'AN TOÀN' })
  await expect(safeHeading).toBeAttached()
  await expect(safeHeading).not.toBeAttached()
}

async function expectBoardRange(page: Page, lower: number, upper: number) {
  const board = page.getByTestId('number-board')
  const cells = board.locator('.number-cell')
  const expectedNumbers = Array.from({ length: upper - lower + 1 }, (_, index) => lower + index)
  await expect(cells).toHaveCount(expectedNumbers.length)
  expect(await cells.allTextContents()).toEqual(
    expectedNumbers.map((number) => String(number).padStart(2, '0')),
  )
  await expect(board).toHaveAttribute('data-candidate-min', String(lower))
  await expect(board).toHaveAttribute('data-candidate-max', String(upper))
}

test('completes a two-player game and records the loser', async ({ page }) => {
  await startGame(page)
  await expect(page.getByTestId('current-player')).toHaveText('Player 1')

  await chooseSafe(page, 25)
  await expect(page.getByTestId('current-player')).toHaveText('Player 2')
  await chooseAndLock(page, 81)

  const result = page.getByTestId('boom-result')
  await expect(result).toBeVisible()
  await expect(result).toContainText('Player 2 đã kích nổ quả bom.')
  await expect(result.getByText('81', { exact: true })).toBeVisible()
})

test('rotates safely through all four players and back to Player 1', async ({ page }) => {
  await startGame(page, 4)

  await chooseSafe(page, 25)
  await expect(page.getByTestId('current-player')).toHaveText('Player 2')
  await chooseSafe(page, 90)
  await expect(page.getByTestId('current-player')).toHaveText('Player 3')
  await chooseSafe(page, 40)
  await expect(page.getByTestId('current-player')).toHaveText('Player 4')
  await chooseSafe(page, 85)
  await expect(page.getByTestId('current-player')).toHaveText('Player 1')
  await expectBoardRange(page, 41, 84)
})

test('renders only the authoritative 63–85 active range and centers its 23 choices', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await startGame(page)
  await chooseSafe(page, 62)
  await chooseSafe(page, 86)

  await expectBoardRange(page, 63, 85)
  await expect(page.getByRole('button', { name: 'Chọn số 62' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Chọn số 86' })).toHaveCount(0)
  await expect(page.getByTestId('number-board')).toHaveAttribute('data-density', 'focused')

  const centering = await page.getByTestId('number-board').evaluate((board) => {
    const boardRect = board.getBoundingClientRect()
    const cells = [...board.querySelectorAll<HTMLElement>('.number-cell')]
    const rects = cells.map((cell) => cell.getBoundingClientRect())
    const left = Math.min(...rects.map((rect) => rect.left))
    const right = Math.max(...rects.map((rect) => rect.right))
    return {
      boardCenter: boardRect.left + boardRect.width / 2,
      clusterCenter: (left + right) / 2,
    }
  })
  expect(Math.abs(centering.boardCenter - centering.clusterCenter)).toBeLessThan(12)
})

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
]) {
  test(`keeps opening gameplay and system HUD inside ${viewport.width}×${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await startGame(page)

    const fit = await page.evaluate(() => {
      const board = document.querySelector<HTMLElement>('[data-testid="number-board"]')
      const hud = document.querySelector<HTMLElement>('.turn-panel')
      const dock = document.querySelector<HTMLElement>('.lock-dock')
      const system = document.querySelector<HTMLElement>('.turn-panel__tension')
      const hudLabels = [...document.querySelectorAll<HTMLElement>(
        '.status-kicker, .turn-panel__metrics > div > span',
      )]
      const firstCandidate = document.querySelector<HTMLElement>('.number-cell')
      const boardHelper = document.querySelector<HTMLElement>('.board-heading p')
      return {
        documentHeight: document.documentElement.scrollHeight,
        viewportHeight: window.innerHeight,
        boardScrolls: board ? board.scrollHeight > board.clientHeight + 1 : true,
        hudBottom: hud?.getBoundingClientRect().bottom ?? Infinity,
        dockBottom: dock?.getBoundingClientRect().bottom ?? Infinity,
        systemVisible: Boolean(system && system.getBoundingClientRect().height > 0),
        minimumHudLabelSize: Math.min(
          ...hudLabels.map((label) => Number.parseFloat(getComputedStyle(label).fontSize)),
        ),
        candidateFontSize: firstCandidate
          ? Number.parseFloat(getComputedStyle(firstCandidate).fontSize)
          : 0,
        helperFontSize: boardHelper
          ? Number.parseFloat(getComputedStyle(boardHelper).fontSize)
          : 0,
      }
    })

    expect(fit.documentHeight).toBeLessThanOrEqual(fit.viewportHeight)
    expect(fit.boardScrolls).toBe(false)
    expect(fit.hudBottom).toBeLessThan(viewport.height)
    expect(fit.dockBottom).toBeLessThanOrEqual(viewport.height)
    expect(fit.systemVisible).toBe(true)
    expect(fit.minimumHudLabelSize).toBeGreaterThanOrEqual(11.4)
    expect(fit.candidateFontSize).toBeGreaterThanOrEqual(16)
    expect(fit.helperFontSize).toBeGreaterThanOrEqual(10)
    await expect(page.getByText('TRẠNG THÁI HỆ THỐNG')).toBeVisible()
  })
}

test('reflows through 10, 5, 3, 2, and final 1-candidate states', async ({ page }) => {
  test.setTimeout(45_000)
  await page.setViewportSize({ width: 1440, height: 900 })
  await startGame(page)
  for (const pick of [62, 90, 70, 88, 77]) await chooseSafe(page, pick)

  await expectBoardRange(page, 78, 87)
  await expect(page.getByTestId('number-board')).toHaveAttribute('data-density', 'danger')
  await expect
    .poll(() => readAudioDiagnostics(page))
    .toMatchObject({ soundscapeSources: 6, activeSoundscapeTimers: 2 })

  await chooseSafe(page, 83)
  await expectBoardRange(page, 78, 82)
  await expect(page.getByTestId('number-board')).toHaveAttribute('data-density', 'critical')
  await expect
    .poll(() => readAudioDiagnostics(page))
    .toMatchObject({ soundscapeSources: 6, activeSoundscapeTimers: 2 })

  await chooseSafe(page, 79)
  await expectBoardRange(page, 80, 82)
  await expect(page.getByTestId('number-board')).toHaveAttribute('data-density', 'terminal')
  await expect
    .poll(() => readAudioDiagnostics(page))
    .toMatchObject({ soundscapeSources: 6, activeSoundscapeTimers: 2 })
  const threeChoiceWidth = await page.getByRole('button', { name: 'Chọn số 80' }).evaluate(
    (button) => button.getBoundingClientRect().width,
  )
  expect(threeChoiceWidth).toBeGreaterThan(170)

  await chooseSafe(page, 82)
  await expectBoardRange(page, 80, 81)
  await chooseSafe(page, 80)
  await expect(page.getByTestId('number-board')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'CHỈ CÒN MỘT CON SỐ.' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'KÍCH NỔ' })).toBeVisible()
})

test('keeps the selection dock outside the active candidate stage', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 })
  await startGame(page)
  await chooseSafe(page, 62)
  await chooseSafe(page, 86)
  await page.getByRole('button', { name: 'Chọn số 75' }).click()

  const geometry = await page.evaluate(() => {
    const stage = document.querySelector<HTMLElement>('[data-testid="board-stage"]')!
    const dock = document.querySelector<HTMLElement>('.lock-dock')!
    const selected = document.querySelector<HTMLElement>('.number-cell.is-selected')!
    return {
      stageBottom: stage.getBoundingClientRect().bottom,
      dockTop: dock.getBoundingClientRect().top,
      selectedBottom: selected.getBoundingClientRect().bottom,
      selectedTop: selected.getBoundingClientRect().top,
      dockBottom: dock.getBoundingClientRect().bottom,
      viewportHeight: window.innerHeight,
    }
  })

  expect(geometry.dockTop).toBeGreaterThanOrEqual(geometry.stageBottom)
  expect(geometry.selectedBottom).toBeLessThan(geometry.dockTop)
  expect(geometry.selectedTop).toBeGreaterThan(0)
  expect(geometry.dockBottom).toBeLessThanOrEqual(geometry.viewportHeight)
})

for (const viewport of [
  { width: 390, height: 844 },
  { width: 393, height: 852 },
  { width: 430, height: 932 },
  { width: 440, height: 956 },
]) {
  test(`mobile shell fits ${viewport.width}×${viewport.height} with a five-column scroll field`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await startGame(page)

    await expect(page.getByTestId('current-player')).toBeVisible()
    await expect(page.getByTestId('valid-range')).toHaveText(/01\s*—\s*99/)
    await expect(page.getByTestId('valid-range')).toHaveAttribute(
      'aria-label',
      'Phạm vi hợp lệ từ 1 đến 99',
    )
    await expect(page.getByTestId('candidate-count')).toHaveText('99')
    await expect(page.getByTestId('candidate-count')).toHaveAttribute(
      'aria-label',
      'Còn lại 99 số',
    )
    await expect(page.locator('.tension-meter > strong')).toBeVisible()
    await expect(page.getByRole('button', { name: 'KHÓA SỐ' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'KHÓA SỐ' })).toBeDisabled()

    const dimensions = await page.evaluate(() => {
      const board = document.querySelector<HTMLElement>('[data-testid="number-board"]')!
      const dock = document.querySelector<HTMLElement>('.lock-dock')!
      const hud = document.querySelector<HTMLElement>('.turn-panel')!
      const cells = [...board.querySelectorAll<HTMLElement>('.number-cell')]
      const firstTop = Math.round(cells[0].getBoundingClientRect().top)
      const firstRowCount = cells.filter(
        (cell) => Math.round(cell.getBoundingClientRect().top) === firstTop,
      ).length
      const candidate = cells[0].getBoundingClientRect()
      return {
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        documentWidth: document.documentElement.scrollWidth,
        documentHeight: document.documentElement.scrollHeight,
        bodyWidth: document.body.scrollWidth,
        gameHeight: document.querySelector<HTMLElement>('.game-screen')!.getBoundingClientRect()
          .height,
        hudBottom: hud.getBoundingClientRect().bottom,
        dockTop: dock.getBoundingClientRect().top,
        dockBottom: dock.getBoundingClientRect().bottom,
        boardBottom: board.getBoundingClientRect().bottom,
        boardScrolls: board.scrollHeight > board.clientHeight + 1,
        firstRowCount,
        candidateWidth: candidate.width,
        candidateHeight: candidate.height,
      }
    })

    expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewportWidth)
    expect(dimensions.bodyWidth).toBeLessThanOrEqual(dimensions.viewportWidth)
    expect(dimensions.documentHeight).toBeLessThanOrEqual(dimensions.viewportHeight)
    expect(dimensions.gameHeight).toBeCloseTo(dimensions.viewportHeight, 0)
    expect(dimensions.hudBottom).toBeLessThan(dimensions.dockTop)
    expect(dimensions.boardBottom).toBeLessThanOrEqual(dimensions.dockTop)
    expect(dimensions.dockBottom).toBeLessThanOrEqual(dimensions.viewportHeight)
    expect(dimensions.boardScrolls).toBe(true)
    expect(dimensions.firstRowCount).toBe(5)
    expect(dimensions.candidateWidth).toBeGreaterThanOrEqual(44)
    expect(dimensions.candidateHeight).toBeGreaterThanOrEqual(44)
  })
}

for (const viewport of [
  { width: 390, height: 667, label: 'short portrait' },
  { width: 844, height: 390, label: 'phone landscape' },
]) {
  test(`${viewport.label} preserves the gameplay shell without horizontal overflow`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await startGame(page)

    const geometry = await page.evaluate(() => {
      const rect = (selector: string) =>
        document.querySelector<HTMLElement>(selector)!.getBoundingClientRect()
      return {
        viewportWidth: innerWidth,
        viewportHeight: innerHeight,
        documentWidth: document.documentElement.scrollWidth,
        documentHeight: document.documentElement.scrollHeight,
        headerTop: rect('.game-header').top,
        hudTop: rect('.turn-panel').top,
        hudBottom: rect('.turn-panel').bottom,
        boardHeight: rect('[data-testid="number-board"]').height,
        dockBottom: rect('.lock-dock').bottom,
      }
    })

    expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth)
    expect(geometry.documentHeight).toBeLessThanOrEqual(geometry.viewportHeight)
    expect(geometry.headerTop).toBeGreaterThanOrEqual(0)
    expect(geometry.hudTop).toBeGreaterThanOrEqual(0)
    expect(geometry.hudBottom).toBeLessThan(geometry.dockBottom)
    expect(geometry.boardHeight).toBeGreaterThan(100)
    expect(geometry.dockBottom).toBeLessThanOrEqual(geometry.viewportHeight)
  })
}

test('mobile scroll keeps HUD/dock fixed and recenters after a SAFE range change', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await startGame(page)

  const before = await page.evaluate(() => {
    const rect = (selector: string) =>
      document.querySelector<HTMLElement>(selector)!.getBoundingClientRect()
    return {
      headerTop: rect('.game-header').top,
      hudTop: rect('.turn-panel').top,
      dockTop: rect('.lock-dock').top,
    }
  })

  await page.getByTestId('number-board').evaluate((board) => {
    board.scrollTop = board.scrollHeight
  })
  await expect.poll(() => page.getByTestId('number-board').evaluate((board) => board.scrollTop)).toBeGreaterThan(0)

  const afterScroll = await page.evaluate(() => {
    const rect = (selector: string) =>
      document.querySelector<HTMLElement>(selector)!.getBoundingClientRect()
    return {
      headerTop: rect('.game-header').top,
      hudTop: rect('.turn-panel').top,
      dockTop: rect('.lock-dock').top,
    }
  })
  expect(afterScroll).toEqual(before)

  await page.getByRole('button', { name: 'Chọn số 95' }).click()
  await expect(page.locator('.lock-dock__choice strong')).toHaveText('95')
  await expect(page.getByRole('button', { name: 'KHÓA SỐ' })).toBeEnabled()
  await page.getByRole('button', { name: 'KHÓA SỐ' }).click()
  await expect(page.getByRole('heading', { name: 'AN TOÀN' })).toBeAttached()
  await expect(page.getByRole('heading', { name: 'AN TOÀN' })).not.toBeAttached()

  await expectBoardRange(page, 1, 94)
  await expect.poll(() => page.getByTestId('number-board').evaluate((board) => board.scrollTop)).toBe(0)
  await expect(page.getByRole('button', { name: 'Chọn số 1', exact: true })).toBeInViewport()
})

test('mobile candidate field adapts through 23, 10, 5, 3, 2, and final states', async ({ page }) => {
  test.setTimeout(45_000)
  await page.setViewportSize({ width: 390, height: 844 })
  await startGame(page)

  const readBoardGeometry = () =>
    page.getByTestId('number-board').evaluate((board) => {
      const first = board.querySelector<HTMLElement>('.number-cell')!.getBoundingClientRect()
      return {
        count: Number(board.getAttribute('data-candidate-count')),
        density: board.getAttribute('data-density'),
        scrolls: board.scrollHeight > board.clientHeight + 1,
        cellWidth: first.width,
        cellHeight: first.height,
        dockBottom: document.querySelector<HTMLElement>('.lock-dock')!.getBoundingClientRect().bottom,
      }
    })

  await chooseSafe(page, 62)
  await chooseSafe(page, 86)
  const focused = await readBoardGeometry()
  expect(focused).toMatchObject({ count: 23, density: 'focused', scrolls: false })

  await chooseSafe(page, 75)
  const danger = await readBoardGeometry()
  expect(danger).toMatchObject({ count: 10, density: 'danger', scrolls: false })
  expect(danger.cellHeight).toBeGreaterThan(focused.cellHeight)

  for (const pick of [84, 77, 83]) await chooseSafe(page, pick)
  const critical = await readBoardGeometry()
  expect(critical).toMatchObject({ count: 5, density: 'critical', scrolls: false })
  expect(critical.cellHeight).toBeGreaterThan(danger.cellHeight)

  await chooseSafe(page, 79)
  const terminalThree = await readBoardGeometry()
  expect(terminalThree).toMatchObject({ count: 3, density: 'terminal', scrolls: false })
  expect(terminalThree.cellHeight).toBeGreaterThan(critical.cellHeight)

  await chooseSafe(page, 82)
  const terminalTwo = await readBoardGeometry()
  expect(terminalTwo).toMatchObject({ count: 2, density: 'terminal', scrolls: false })
  expect(terminalTwo.cellWidth).toBeGreaterThan(terminalThree.cellWidth)
  expect(terminalTwo.cellHeight).toBeGreaterThan(terminalThree.cellHeight)
  expect(terminalTwo.dockBottom).toBeLessThanOrEqual(844)

  await chooseSafe(page, 80)
  await expect(page.getByTestId('number-board')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'CHỈ CÒN MỘT CON SỐ.' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'KÍCH NỔ' })).toBeInViewport()
})

test('fresh mobile reload has no React dependency warning or page error', async ({ page }) => {
  const consoleIssues: string[] = []
  const pageErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'warning' || message.type() === 'error') {
      consoleIssues.push(message.text())
    }
  })
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await page.setViewportSize({ width: 393, height: 852 })
  await page.goto('/')
  await enterLocalMode(page)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'BẮT ĐẦU' }).click()
  await chooseSafe(page, 25)

  expect(consoleIssues).toEqual([])
  expect(pageErrors).toEqual([])
})

test('number selection and lock confirmation work with the keyboard', async ({ page }) => {
  await startGame(page)
  const number = page.getByRole('button', { name: 'Chọn số 25' })
  await number.focus()
  await page.keyboard.press('Enter')
  await expect(number).toHaveAttribute('aria-pressed', 'true')

  const lock = page.getByRole('button', { name: 'KHÓA SỐ' })
  await lock.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'AN TOÀN' })).toBeAttached()
  await expect(page.getByTestId('current-player')).toHaveText('Player 2')
})

test('boom result can restart a fresh 99-candidate board', async ({ page }) => {
  await startGame(page)
  await chooseAndLock(page, 81)
  await expect(page.getByTestId('boom-result')).toBeVisible()

  await page.getByRole('button', { name: 'CHƠI LẠI' }).click()
  await expect(page.getByTestId('boom-result')).toBeHidden()
  await expect(page.getByTestId('candidate-count')).toHaveText('99')
  await expectBoardRange(page, 1, 99)
})

test('reduced-motion BOOM preserves the result without screen shake', async ({ page }) => {
  await installHapticsMock(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await startGame(page)
  await chooseAndLock(page, 81)
  const result = page.getByTestId('boom-result')
  await expect(result).toBeVisible()
  await expect(result).toContainText('SỐ BOM')
  expect(await result.evaluate((element) => getComputedStyle(element).animationName)).toBe('none')
  await expect
    .poll(() => readAudioDiagnostics(page))
    .toMatchObject({ activeRingingSources: 5 })
  expect(await readHapticCalls(page)).toEqual([10, 28, [70, 30, 120]])
})

test('supported haptics follow semantic events, remain independent from mute, and clean replay', async ({
  page,
}) => {
  await installHapticsMock(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await startGame(page)
  await expect(page.getByRole('button', { name: 'Tắt rung' })).toBeVisible()

  await setAudioMuted(page, true)
  await page.getByRole('button', { name: 'Chọn số 25' }).click()
  expect(await readHapticCalls(page)).toEqual([10])
  await page.waitForTimeout(180)
  expect(await readHapticCalls(page)).toEqual([10])

  await page.getByRole('button', { name: 'KHÓA SỐ' }).click()
  await expect(page.getByRole('heading', { name: 'AN TOÀN' })).toBeAttached()
  expect(await readHapticCalls(page)).toEqual([10, 28, [16, 32, 16]])
  await expect(page.getByRole('heading', { name: 'AN TOÀN' })).not.toBeAttached()

  await chooseAndLock(page, 81)
  await expect(page.getByTestId('boom-result')).toBeVisible()
  expect(await readHapticCalls(page)).toEqual([
    10,
    28,
    [16, 32, 16],
    10,
    28,
    [70, 30, 120],
  ])

  await page.getByRole('button', { name: 'CHƠI LẠI' }).click()
  await expect(page.getByTestId('candidate-count')).toHaveText('99')
  expect(await readHapticCalls(page)).toEqual([
    10,
    28,
    [16, 32, 16],
    10,
    28,
    [70, 30, 120],
    0,
  ])
})

test('haptics toggle persists independently and disabled mode emits no event feedback', async ({
  page,
}) => {
  await installHapticsMock(page)
  await page.goto('/')
  await enterLocalMode(page)
  await page.getByRole('button', { name: 'Tắt rung' }).click()
  expect(await page.evaluate(() => localStorage.getItem('bom-so:haptics'))).toBe('false')

  await page.reload()
  await expect(page.getByRole('button', { name: 'Bật rung' })).toBeVisible()
  await page.getByRole('button', { name: 'BẮT ĐẦU' }).click()
  await page.getByRole('button', { name: 'Chọn số 25' }).click()
  await page.getByRole('button', { name: 'KHÓA SỐ' }).click()
  await expect(page.getByRole('heading', { name: 'AN TOÀN' })).toBeAttached()
  expect(await readHapticCalls(page)).toEqual([])
})

test('unsupported vibration API hides haptics without crashes or warnings', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: undefined })
  })
  const consoleIssues: string[] = []
  const pageErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'warning' || message.type() === 'error') {
      consoleIssues.push(message.text())
    }
  })
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await page.setViewportSize({ width: 440, height: 956 })
  await startGame(page)
  await expect(page.getByRole('button', { name: /rung/i })).toHaveCount(0)
  await chooseSafe(page, 25)

  expect(consoleIssues).toEqual([])
  expect(pageErrors).toEqual([])
})

test('mute preference persists across reloads', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Tắt âm thanh' }).click()
  expect(await page.evaluate(() => localStorage.getItem('bom-so:muted'))).toBe('true')

  await page.reload()
  await expect(page.getByRole('button', { name: 'Bật âm thanh' })).toBeVisible()
  await page.getByRole('button', { name: 'Bật âm thanh' }).click()
  expect(await page.evaluate(() => localStorage.getItem('bom-so:muted'))).toBe('false')
})

test('muted BOOM stays silent and does not replay after restart and unmute', async ({ page }) => {
  await page.goto('/')
  await setAudioMuted(page, true)
  await enterLocalMode(page)
  await page.getByRole('button', { name: 'BẮT ĐẦU' }).click()
  await chooseAndLock(page, 81)
  await expect(page.getByTestId('boom-result')).toBeVisible()
  await expect
    .poll(() => readAudioDiagnostics(page))
    .toMatchObject({ activeEffectSources: 0, activeRingingSources: 0 })

  await page.getByRole('button', { name: 'CHƠI LẠI' }).click()
  await expect(page.getByTestId('candidate-count')).toHaveText('99')
  await expect
    .poll(() => readAudioDiagnostics(page))
    .toMatchObject({ soundscapeSources: 0, activeRingingSources: 0 })

  await setAudioMuted(page, false)
  await page.waitForTimeout(220)
  expect(await readAudioDiagnostics(page)).toMatchObject({
    soundscapeSources: 6,
    activeEffectSources: 0,
    activeRingingSources: 0,
  })
})

test('start lifecycle contract has no page errors with audio, mute, starter, and player variants', async ({
  page,
}) => {
  test.setTimeout(60_000)
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  const cases = [
    { players: 2, muted: false, randomStarter: false },
    { players: 2, muted: true, randomStarter: true },
    { players: 3, muted: true, randomStarter: false },
    { players: 3, muted: false, randomStarter: true },
    { players: 4, muted: false, randomStarter: false },
    { players: 4, muted: true, randomStarter: true },
  ]

  for (const scenario of cases) {
    await page.goto('/')
    await enterLocalMode(page)
    await setAudioMuted(page, scenario.muted)
    if (scenario.players !== 2) {
      await page
        .getByRole('button', { name: new RegExp(`${scenario.players} NGƯỜI`) })
        .click()
    }
    await setRandomStarter(page, scenario.randomStarter)
    await page.getByRole('button', { name: 'BẮT ĐẦU' }).click()

    await expect(page.locator('.turn-panel')).toBeVisible()
    await expect(page.getByText('TRẠNG THÁI HỆ THỐNG')).toBeVisible()
    await expect(page.getByTestId('number-board')).toBeVisible()
    await expect(page.getByTestId('candidate-count')).toHaveText('99')

    await page.waitForTimeout(220)
    const diagnostics = await readAudioDiagnostics(page)
    expect(diagnostics.soundscapeSources).toBe(scenario.muted ? 0 : 6)
    expect(diagnostics.activeSoundscapeTimers).toBe(scenario.muted ? 0 : 1)
  }

  expect(pageErrors).toEqual([])
})

test('20 mixed start, replay, mute, and setup cycles stay clean', async ({ page }) => {
  test.setTimeout(120_000)
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.goto('/')
  await enterLocalMode(page)

  for (let cycle = 1; cycle <= 20; cycle += 1) {
    const players = 2 + ((cycle - 1) % 3)
    const shouldBeMuted = cycle % 2 === 0
    await setAudioMuted(page, shouldBeMuted)
    if (players !== 2) {
      await page.getByRole('button', { name: new RegExp(`${players} NGƯỜI`) }).click()
    }
    await setRandomStarter(page, cycle % 2 === 1)
    await page.getByRole('button', { name: 'BẮT ĐẦU' }).click()
    await expect(page.getByTestId('number-board')).toBeVisible()

    if (cycle % 4 === 0) {
      await setAudioMuted(page, !shouldBeMuted)
      await page.waitForTimeout(80)
      await setAudioMuted(page, shouldBeMuted)
    }

    await page.waitForTimeout(220)
    const active = await readAudioDiagnostics(page)
    expect(active.soundscapeSources).toBe(shouldBeMuted ? 0 : 6)
    expect(active.activeSoundscapeTimers).toBe(shouldBeMuted ? 0 : 1)

    await chooseAndLock(page, 81)
    await expect(page.getByTestId('boom-result')).toBeVisible()
    const boomAudio = await readAudioDiagnostics(page)
    expect(boomAudio.activeRingingSources).toBe(shouldBeMuted ? 0 : 5)

    if (cycle % 5 === 0) {
      await page.getByRole('button', { name: 'CHƠI LẠI' }).click()
      await expect(page.getByTestId('candidate-count')).toHaveText('99')
      await page.waitForTimeout(220)
      const replayed = await readAudioDiagnostics(page)
      expect(replayed.soundscapeSources).toBe(shouldBeMuted ? 0 : 6)
      expect(replayed.activeRingingSources).toBe(0)
      expect(replayed.activeSoundscapeTimers).toBe(shouldBeMuted ? 0 : 1)
      await chooseAndLock(page, 81)
      await expect(page.getByTestId('boom-result')).toBeVisible()
    }

    await page.getByRole('button', { name: 'VỀ THIẾT LẬP' }).click()
    await expect(page.getByRole('button', { name: 'BẮT ĐẦU' })).toBeVisible()
    await expectCleanAudioSession(page)
    await page.waitForTimeout(180)
    await expectCleanAudioSession(page)
  }

  expect(pageErrors).toEqual([])
})

test('audio soundscape ducks on LOCK, resumes after SAFE, and layers BOOM sources', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const counters = { oscillators: 0, buffers: 0, stops: 0 }
    Object.defineProperty(window, '__bomSoAudioCounters', { value: counters })

    const originalOscillator = AudioContext.prototype.createOscillator
    AudioContext.prototype.createOscillator = function createInstrumentedOscillator() {
      counters.oscillators += 1
      const node = originalOscillator.call(this)
      const originalStop = node.stop.bind(node)
      node.stop = (...arguments_) => {
        counters.stops += 1
        originalStop(...arguments_)
      }
      return node
    }

    const originalBufferSource = AudioContext.prototype.createBufferSource
    AudioContext.prototype.createBufferSource = function createInstrumentedBufferSource() {
      counters.buffers += 1
      const node = originalBufferSource.call(this)
      const originalStop = node.stop.bind(node)
      node.stop = (...arguments_) => {
        counters.stops += 1
        originalStop(...arguments_)
      }
      return node
    }
  })

  const readCounters = () =>
    page.evaluate(() =>
      (window as typeof window & {
        __bomSoAudioCounters: { oscillators: number; buffers: number; stops: number }
      }).__bomSoAudioCounters,
    )

  await startGame(page)
  await page.waitForTimeout(180)
  const opening = await readCounters()
  expect(opening.oscillators).toBeGreaterThanOrEqual(3)
  expect(opening.buffers).toBeGreaterThanOrEqual(2)

  await chooseSafe(page, 62)
  await page.waitForTimeout(100)
  const afterFirstSafe = await readCounters()
  expect(afterFirstSafe.stops).toBeGreaterThan(opening.stops)
  expect(afterFirstSafe.oscillators).toBeGreaterThan(opening.oscillators)

  await chooseSafe(page, 86)
  await page.waitForTimeout(100)
  await expect(page.locator('.game-screen')).toHaveAttribute('data-tension', 'uneasy')
  await expect
    .poll(() => readAudioDiagnostics(page))
    .toMatchObject({ soundscapeSources: 6, activeSoundscapeTimers: 2 })
  const afterSafe = await readCounters()

  await chooseAndLock(page, 81)
  await expect(page.getByTestId('boom-result')).toBeVisible()
  await page.waitForTimeout(220)
  const afterBoom = await readCounters()
  expect(afterBoom.buffers - afterSafe.buffers).toBeGreaterThanOrEqual(4)
  expect(afterBoom.oscillators - afterSafe.oscillators).toBeGreaterThanOrEqual(8)
  await expect
    .poll(() => readAudioDiagnostics(page))
    .toMatchObject({ activeRingingSources: 5 })

  await page.getByRole('button', { name: 'CHƠI LẠI' }).click()
  await expect(page.getByTestId('candidate-count')).toHaveText('99')
  await expect
    .poll(() => readAudioDiagnostics(page))
    .toMatchObject({
      soundscapeSources: 6,
      activeRingingSources: 0,
      activeEffectSources: 0,
      activeSoundscapeTimers: 1,
    })
})

test('adaptive interaction contrast and shared SAFE/BOOM pacing follow tension', async ({
  page,
}) => {
  test.setTimeout(60_000)
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await startGame(page)

  await page.getByRole('button', { name: 'Chọn số 62' }).click()
  await expect.poll(() => readAudioDiagnostics(page)).toMatchObject({
    lastSelectionMultiplier: 1,
  })

  await startResultTimingObservation(page, '[data-testid="resolution-overlay"] h2')
  await page.getByRole('button', { name: 'KHÓA SỐ' }).click()
  await expect(page.getByText('ĐANG ĐỐI CHIẾU VỚI SỐ BOM')).toBeAttached()
  const calmScheduledDelay = await readScheduledResolutionDelay(page)
  expect(calmScheduledDelay).toBeGreaterThanOrEqual(450)
  expect(calmScheduledDelay).toBeLessThanOrEqual(550)
  await expect(page.getByRole('heading', { name: 'AN TOÀN' })).toBeAttached({ timeout: 800 })
  const calmSafeDelay = await readObservedResultDelay(page)
  expect(calmSafeDelay).toBeGreaterThanOrEqual(calmScheduledDelay)
  expect(calmSafeDelay).toBeLessThanOrEqual(calmScheduledDelay + 200)
  await expect.poll(() => readAudioDiagnostics(page)).toMatchObject({
    lastLockMultiplier: 1,
  })
  await expect(page.getByRole('heading', { name: 'AN TOÀN' })).not.toBeAttached()

  for (const pick of [90, 70, 88, 77, 83, 79]) await chooseSafe(page, pick)
  await expect(page.locator('.game-screen')).toHaveAttribute('data-tension', 'terminal')

  await page.getByRole('button', { name: 'Chọn số 80' }).click()
  await expect.poll(() => readAudioDiagnostics(page)).toMatchObject({
    lastSelectionMultiplier: 0.35,
  })

  await startResultTimingObservation(page, '[data-testid="resolution-overlay"] h2')
  await page.getByRole('button', { name: 'KHÓA SỐ' }).click()
  await expect(page.getByText('ĐANG ĐỐI CHIẾU VỚI SỐ BOM')).toBeAttached()
  const terminalSafeScheduledDelay = await readScheduledResolutionDelay(page)
  expect(terminalSafeScheduledDelay).toBeGreaterThanOrEqual(820)
  expect(terminalSafeScheduledDelay).toBeLessThanOrEqual(1_000)
  await expect(page.getByRole('heading', { name: 'AN TOÀN' })).toBeAttached({ timeout: 1_300 })
  const terminalSafeDelay = await readObservedResultDelay(page)
  expect(terminalSafeDelay).toBeGreaterThanOrEqual(terminalSafeScheduledDelay)
  expect(terminalSafeDelay).toBeLessThanOrEqual(terminalSafeScheduledDelay + 200)
  await expect.poll(() => readAudioDiagnostics(page)).toMatchObject({
    lastLockMultiplier: 0.45,
  })
  await expect(page.getByRole('heading', { name: 'AN TOÀN' })).not.toBeAttached()

  await page.getByRole('button', { name: 'Chọn số 81' }).click()
  await startResultTimingObservation(page, '[data-testid="boom-result"]')
  await page.getByRole('button', { name: 'KHÓA SỐ' }).click()
  await expect(page.getByText('ĐANG ĐỐI CHIẾU VỚI SỐ BOM')).toBeAttached()
  const terminalBoomScheduledDelay = await readScheduledResolutionDelay(page)
  expect(terminalBoomScheduledDelay).toBeGreaterThanOrEqual(820)
  expect(terminalBoomScheduledDelay).toBeLessThanOrEqual(1_000)
  await expect(page.getByTestId('boom-result')).toBeAttached({ timeout: 1_300 })
  const terminalBoomDelay = await readObservedResultDelay(page)
  expect(terminalBoomDelay).toBeGreaterThanOrEqual(terminalBoomScheduledDelay)
  expect(terminalBoomDelay).toBeLessThanOrEqual(terminalBoomScheduledDelay + 200)
  await expect(page.getByTestId('boom-result')).toBeVisible()
  await expect.poll(() => readAudioDiagnostics(page)).toMatchObject({
    lastBoomImpactGain: 1.85,
    activeRingingSources: 5,
  })

  expect(Math.abs(terminalSafeDelay - terminalBoomDelay)).toBeLessThanOrEqual(480)

  await page.getByRole('button', { name: 'CHƠI LẠI' }).click()
  await expect(page.getByTestId('candidate-count')).toHaveText('99')
  await expect.poll(() => readAudioDiagnostics(page)).toMatchObject({
    soundscapeSources: 6,
    activeRingingSources: 0,
    lastSelectionMultiplier: null,
    lastLockMultiplier: null,
    lastBoomImpactGain: null,
  })

  expect(pageErrors).toEqual([])
})
