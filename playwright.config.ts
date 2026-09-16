import { defineConfig, devices } from '@playwright/test'

/**
 * 第 48.2 節：第 45 節 Case 1–10 的驗收情境測試。
 * 必須跑真實 UI 與真實 IndexedDB，不得用 mock 取代。
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: '手機寬度', use: { ...devices['iPhone 13'] } },
    { name: '桌機寬度', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
