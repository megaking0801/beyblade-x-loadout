import { test, expect, type Page } from '@playwright/test'

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
  for (const [query, qty] of [['BX-01', '1'], ['BX-02', '1'], ['BX-03', '1'], ['BX-15', '1']] as const) {
    await page.goto('/#/products')
    await expect(page.getByTestId('tab-catalog')).toBeVisible()
    await page.getByTestId('tab-catalog').click()
    await page.getByTestId('product-search').fill(query)
    const card = page.getByTestId('catalog-product').first()
    await expect(card).toBeVisible()
    await card.getByTestId('catalog-qty').fill(qty)
    await card.getByTestId('add-owned').click()
  }
}

/**
 * 截圖工具（不是驗收測試）。
 * 預設不會執行，用 `npm run shots` 手動跑，用來實際檢查手機與桌機寬度的版面。
 */
test('capture', async ({ page }, testInfo) => {
  await page.goto('/#/')
  await expect(page.getByRole('navigation', { name: '主要導覽' })).toBeVisible()
  await seed(page)
  // 加入商品後 UI 會自己導回 /products，先等它走完，否則第一張截圖會被這個導覽蓋掉。
  await page.getByTestId('tab-my-products').click()
  await expect(page.getByTestId('owned-product').first()).toBeVisible()
  await page.waitForTimeout(500)

  // 配裝器要先選滿三個欄位才看得到完整結果
  await page.evaluate(() => {
    window.location.hash = '/builder'
  })
  await page.getByLabel('上蓋').selectOption('blade:ドランソード')
  await page.getByLabel('固鎖').selectOption('ratchet:3-60')
  await page.getByLabel('軸心').selectOption('bit:F')
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
      fullPage: false,
    })
  }
})
