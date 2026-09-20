import { expect, test, type Page } from '@playwright/test'

/** 由 playwright.live.config.ts 的 baseURL 提供，可用 LIVE_BASE_URL 覆寫。 */
const BASE = './'

async function waitForAppReady(page: Page): Promise<void> {
  await expect(page.getByRole('navigation', { name: '主要導覽' })).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('[data-app-ready="true"]')).toBeVisible({ timeout: 30_000 })
}

test('線上版可開啟、初次進入個人資料為 0、可加入商品', async ({ page }) => {
  await page.goto(BASE)
  await waitForAppReady(page)
  await expect(page.getByTestId('stat-products-value')).toHaveText('0')
  await expect(page.getByTestId('stat-blades-value')).toHaveText('0')

  await page.goto(`${BASE}#/products`)
  await waitForAppReady(page)
  await page.getByTestId('tab-catalog').click()
  await page.getByTestId('product-search').fill('BX-01')
  const card = page.getByTestId('catalog-product').first()
  await expect(card).toBeVisible()
  await card.getByTestId('catalog-qty').fill('2')
  await card.getByTestId('add-owned').click()
  await page.getByTestId('tab-my-products').click()
  await expect(page.getByTestId('owned-product').first()).toBeVisible()

  await page.goto(`${BASE}#/parts`)
  await waitForAppReady(page)
  await expect(
    page.locator('[data-testid="part-stock"][data-part-id="blade:ドランソード"]').getByTestId('part-available'),
  ).toHaveText('可用 ×2')
})

test('線上版有註冊 service worker', async ({ page }) => {
  await page.goto(BASE)
  await waitForAppReady(page)
  const scriptUrl = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready
    return registration.active?.scriptURL ?? null
  })
  expect(scriptUrl).toContain('/beyblade-x-loadout/sw.js')
})


/**
 * 圖片路徑必須帶得動部署的子路徑。
 *
 * 這條只能在線上跑：本機 preview 的 base 是 /，少呼叫一次 assetUrl() 完全看不出來，
 * 但 Pages 部署在 /beyblade-x-loadout/，沒補 base 的 /img/... 會整批 404。
 * 實際發生過一次（商品卡改用原生 img 時漏掉），所以直接守「畫面上沒有破圖」。
 */
test('線上版的圖片都載得到，沒有漏掉部署子路徑', async ({ page }) => {
  const notFound: string[] = []
  page.on('response', (response) => {
    if (response.status() >= 400 && /\.(webp|png|jpe?g)$/i.test(response.url())) {
      notFound.push(`${response.status()} ${response.url()}`)
    }
  })

  for (const [route, tab] of [
    ['#/products', 'tab-catalog'],
    ['#/parts', 'tab-part-catalog'],
  ] as const) {
    await page.goto(`${BASE}${route}`)
    await waitForAppReady(page)
    await page.getByTestId(tab).click()
    await expect(page.locator('img').first()).toBeVisible({ timeout: 30_000 })

    const images = await page.locator('img').count()
    expect(images, `${route} 應該要有圖片可檢查`).toBeGreaterThan(0)
    const broken = await page.evaluate(() =>
      [...document.querySelectorAll('img')]
        .filter((img) => img.complete && img.naturalWidth === 0)
        .map((img) => img.getAttribute('src') ?? '(no src)')
        .slice(0, 5),
    )
    expect(broken, `${route} 有破圖`).toEqual([])
  }

  expect([...new Set(notFound)].slice(0, 5), '有圖片回 4xx').toEqual([])
})
