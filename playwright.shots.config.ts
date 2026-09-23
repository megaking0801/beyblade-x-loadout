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
    // deviceScaleFactor 蓋掉 iPhone 13 預設的 3x：型錄型頁面未過濾時有 149 個商品，
    // fullPage 截圖在 3x 下輕易超過瀏覽器單張圖片 32767px 的高度上限而直接失敗。
    // 只影響這支截圖工具產出的圖檔解析度，不影響 app 實際在手機上的畫面。
    { name: 'phone', use: { ...devices['iPhone 13'], deviceScaleFactor: 1 } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 180_000,
  },
})
