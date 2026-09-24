import { test, expect, type Page } from '@playwright/test'
import { pickSlot } from './helpers.ts'

const SHOTS = [
  { hash: '/', name: 'home' },
  { hash: '/products', name: 'products' },
  { hash: '/parts', name: 'parts' },
  { hash: '/buildable', name: 'buildable' },
  { hash: '/decks', name: 'decks' },
  { hash: '/wishlist', name: 'wishlist' },
  { hash: '/settings', name: 'settings' },
]

async function seed(page: Page): Promise<void> {
  await page.goto('/#/products')
  // 冷 IndexedDB 第一次寫入型錄，加上 PWA 首訪 service worker 觸發的整頁 reload，
  // 合計可能要 15~20 秒才會 ready，不能沿用預設 5 秒斷言。跟 acceptance.spec.ts
  // 的 openApp() 用同一套等法。
  await page.evaluate(async () => navigator.serviceWorker.ready)
  await expect(page.locator('[data-app-ready="true"]')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('tab-catalog')).toBeVisible()
  await page.getByTestId('tab-catalog').click()
  const productSearch = page.getByTestId('product-search')
  await expect(productSearch).toBeVisible()

  for (const [query, qty] of [['BX-01', '1'], ['BX-02', '1'], ['BX-03', '1'], ['BX-15', '1']] as const) {
    await productSearch.fill(query)
    const card = page.getByTestId('catalog-product').first()
    await expect(card).toBeVisible()
    await card.getByTestId('catalog-qty').fill(qty)
    await card.getByTestId('add-owned').click()
  }
}

/**
 * 截圖工具（不是驗收測試）。
 * 預設不會執行，用 `npm run shots` 手動跑，用來實際檢查手機與桌機寬度的版面。
 * 一次會建立 12 張全頁截圖；在手機瀏覽器不應套用 Playwright 預設 30 秒上限。
 */
test.setTimeout(120_000)

test('capture', async ({ page }, testInfo) => {
  await seed(page)
  await expect(page.getByRole('navigation', { name: '主要導覽' })).toBeVisible()
  // 加入商品後 UI 會自己導回 /products，先等它走完，否則第一張截圖會被這個導覽蓋掉。
  await page.getByTestId('tab-my-products').click()
  await expect(page.getByTestId('owned-product').first()).toBeVisible()
  await page.waitForTimeout(500)

  // 配裝器要先選滿三個欄位才看得到完整結果
  await page.evaluate(() => {
    window.location.hash = '/builder'
  })
  await pickSlot(page, 'bladeId', 'blade:ドランソード')
  await pickSlot(page, 'ratchetId', 'ratchet:3-60')
  await pickSlot(page, 'bitId', 'bit:F')
  await page.waitForTimeout(400)
  await page.screenshot({
    path: `${testInfo.project.outputDir}/../shots/${testInfo.project.name}-builder.png`,
  })

  for (const shot of SHOTS) {
    // 用 location.hash 觸發 hashchange；goto 同文件的 hash 變更不一定會觸發路由。
    await page.evaluate((hash) => {
      window.location.hash = hash
    }, shot.hash)
    await expect(page.getByText('資料載入中…')).toHaveCount(0)
    await page.waitForTimeout(500)
    await page.screenshot({
      path: `${testInfo.project.outputDir}/../shots/${testInfo.project.name}-${shot.name}.png`,
      // 要看的是整頁版面，不是首屏。截半頁根本檢查不出下面的區塊有沒有爆版。
      fullPage: true,
    })
  }

  /*
   * 兩個詳情頁不在 SHOTS 的 hash 清單裡（它們需要 ?id=），但版面改動最多的
   * 就是這兩頁，一定要截到。
   */
  await page.evaluate(() => {
    window.location.hash = '/parts'
  })
  await page.getByTestId('tab-part-catalog').click()
  const firstPart = page.getByTestId('catalog-part').first()
  await expect(firstPart).toBeVisible()
  await firstPart.getByTestId('catalog-part-title').click().catch(() => undefined)
  await page.evaluate(() => {
    window.location.hash = '/part?id=blade:ドランソード'
  })
  await page.waitForTimeout(500)
  await page.screenshot({
    path: `${testInfo.project.outputDir}/../shots/${testInfo.project.name}-part-detail.png`,
    fullPage: true,
  })

  await page.evaluate(() => {
    window.location.hash = '/product?id=bx01'
  })
  await page.waitForTimeout(500)
  await page.screenshot({
    path: `${testInfo.project.outputDir}/../shots/${testInfo.project.name}-product-detail.png`,
    fullPage: true,
  })

  /*
   * /products 預設停在「我的商品」，所以型錄那一半（入門組區、持有態徽章）
   * 不會被上面那張截到。補一張。
   */
  await page.evaluate(() => {
    window.location.hash = '/products'
  })
  await page.getByTestId('tab-catalog').click()
  await expect(page.getByTestId('catalog-product').first()).toBeVisible()
  await page.waitForTimeout(400)
  await page.screenshot({
    path: `${testInfo.project.outputDir}/../shots/${testInfo.project.name}-products-catalog.png`,
    fullPage: true,
  })

  /*
   * 想買清單空的時候看不到「最划算的一盒」。加一筆再截。
   */
  await page.evaluate(() => {
    window.location.hash = '/wishlist'
  })
  const wishSearch = page.getByLabel('搜尋想買的商品')
  await expect(wishSearch).toBeVisible()
  await wishSearch.fill('BX-34')
  const addWish = page.getByRole('button', { name: '加入' }).first()
  if (await addWish.count()) {
    await addWish.click()
    await page.waitForTimeout(600)
    await page.screenshot({
      path: `${testInfo.project.outputDir}/../shots/${testInfo.project.name}-wishlist-filled.png`,
      fullPage: true,
    })
  }

})
