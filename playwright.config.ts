import { defineConfig, devices } from '@playwright/test'

/**
 * 第 48.2 節：第 45 節 Case 1–10 的驗收情境測試。
 * 必須跑真實 UI 與真實 IndexedDB，不得用 mock 取代。
 */
export default defineConfig({
  testDir: './tests/e2e',
  /*
   * 平行跑。
   *
   * 可以平行的依據：Playwright 每個測試自己一個 BrowserContext，IndexedDB 與
   * service worker 註冊都跟著 context 隔離（acceptance.spec.ts 的註解本來就靠這件事
   * 來滿足「初次開啟個人資料必須空白」）。兩個 spec 都沒有 describe.serial、
   * 沒有 beforeAll、沒有模組層級可變狀態，setOffline 也是掛在 context 上。
   *
   * 串行跑 42 個測試 × 2 個 project 要 4.6 分鐘，是每次上線前最大的一段等待。
   *
   * workers 實測：1 → 4.6 分（84 全過）、4 → 3.6 分（84 全過）、8 → 4.1 分且 8 條失敗。
   * 8 更慢又更不穩，因為測試多半在等頁面載入而不是在算（CPU 只到 140%），
   * 開太多瀏覽器只是互搶資源。所以停在 4，不要再往上加。
   *
   * 刻意不設 retries：重試會把 flaky 蓋掉，看起來綠其實不穩（第 48.6 節）。
   * 若之後真的出現 flaky，把 workers 降到 2、再不行退回 1，
   * 並在 HANDOFF 記下原因——不要改成靠重試。
   */
  fullyParallel: true,
  workers: 4,
  // 只跑 *.spec.ts；截圖工具是 screenshot.shots.ts，用 npm run shots 手動觸發。
  testMatch: /.*\.spec\.ts$/,
  // 線上煙霧測試另有設定檔（npm run test:live），不要混進本機驗收。
  testIgnore: /live\//,
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
    // 明確綁 127.0.0.1：vite preview 預設只監聽 ::1，url 用 IPv4 會等不到而超時。
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
