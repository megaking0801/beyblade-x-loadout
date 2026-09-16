import { expect, test } from '@playwright/test'

/** 由 playwright.live.config.ts 的 baseURL 提供，可用 LIVE_BASE_URL 覆寫。 */
const BASE = './'

test('線上版可開啟、初次進入個人資料為 0、可加入商品', async ({ page }) => {
  await page.goto(BASE)
  await expect(page.getByRole('navigation', { name: '主要導覽' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('資料載入中…')).toHaveCount(0, { timeout: 30_000 })
  await expect(page.getByTestId('stat-products-value')).toHaveText('0')
  await expect(page.getByTestId('stat-blades-value')).toHaveText('0')

  await page.goto(`${BASE}#/products`)
  await page.getByTestId('tab-catalog').click()
  await page.getByTestId('product-search').fill('BX-01')
  const card = page.getByTestId('catalog-product').first()
  await expect(card).toBeVisible()
  await card.getByTestId('catalog-qty').fill('2')
  await card.getByTestId('add-owned').click()
  await page.getByTestId('tab-my-products').click()
  await expect(page.getByTestId('owned-product').first()).toBeVisible()

  await page.goto(`${BASE}#/parts`)
  await expect(
    page.locator('[data-testid="part-stock"][data-part-id="blade:ドランソード"]').getByTestId('part-available'),
  ).toHaveText('可用 ×2')
})

test('線上版有註冊 service worker', async ({ page }) => {
  await page.goto(BASE)
  await expect(page.getByRole('navigation', { name: '主要導覽' })).toBeVisible({ timeout: 30_000 })
  const scriptUrl = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready
    return registration.active?.scriptURL ?? null
  })
  expect(scriptUrl).toContain('/beyblade-x-loadout/sw.js')
})
