import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  timeout: 20_000,
  expect: { timeout: 5_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:41739',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'node ./node_modules/vite/bin/vite.js --host 127.0.0.1 --port 41739 --strictPort',
    url: 'http://127.0.0.1:41739',
    reuseExistingServer: true,
    env: {
      VITE_E2E_BOMB_NUMBER: '81',
      VITE_E2E_FAST: '1',
      VITE_E2E_AUDIO_DIAGNOSTICS: '1',
    },
  },
})
