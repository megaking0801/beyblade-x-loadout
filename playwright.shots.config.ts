import { defineConfig, devices } from '@playwright/test'

/**
 * 截圖用設定（不是驗收測試）。
 * 用來實際檢查手機寬度與桌機寬度的版面（第 49.2 節）。
 */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /screenshot\.shots\.ts$/,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  outputDir: './test-results/shots-run',
  use: { baseURL: 'http://127.0.0.1:4173' },
  projects: [
    { name: 'phone', use: { ...devices['iPhone 13'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 180_000,
  },
})
