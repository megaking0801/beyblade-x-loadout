import { defineConfig, devices } from '@playwright/test'

/**
 * 對已部署的線上版做煙霧測試（第 47.1 節：不能只靠推論，要實際跑起來看）。
 *
 * 用法：npm run test:live
 * 預設打 GitHub Pages 的網址，可用 LIVE_BASE_URL 覆寫。
 */
export default defineConfig({
  testDir: './tests/live',
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.LIVE_BASE_URL ?? 'https://megaking0801.github.io/beyblade-x-loadout/',
  },
  projects: [
    { name: 'phone', use: { ...devices['iPhone 13'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
})
