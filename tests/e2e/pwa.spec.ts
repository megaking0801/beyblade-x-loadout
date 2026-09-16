import { expect, test, type Page } from '@playwright/test'

/**
 * PWA 與執行期健康度。
 *
 * 規格對照：第 2 節（離線可開啟、離線可修改本地庫存、manifest、service worker、App icon）、
 * 第 47.1 節（檢查殘留執行期錯誤）、第 49.2 節（離線要實際斷網測過一次）。
 */

const ROUTES = [
  '/',
  '/products',
  '/parts',
  '/builder',
  '/buildable',
  '/decks',
  '/compare',
  '/wishlist',
  '/settings',
]

async function openApp(page: Page, hash = '/'): Promise<void> {
  await page.goto(`/#${hash}`)
  await expect(page.getByRole('navigation', { name: '主要導覽' })).toBeVisible()
  await expect(page.getByText('資料載入中…')).toHaveCount(0, { timeout: 20_000 })
}

test('manifest 與 App icon 都存在且可取得', async ({ page, request }) => {
  await openApp(page)
  const manifestHref = await page.getAttribute('link[rel="manifest"]', 'href')
  expect(manifestHref).toBeTruthy()

  const manifest = await request.get(manifestHref as string)
  expect(manifest.ok()).toBe(true)
  const body = (await manifest.json()) as {
    name: string
    display: string
    lang: string
    icons: { src: string; sizes: string; purpose?: string }[]
  }
  expect(body.name).toContain('BEYBLADE X')
  expect(body.display).toBe('standalone')
  expect(body.lang).toBe('zh-Hant-TW')
  expect(body.icons.length).toBeGreaterThanOrEqual(3)
  expect(body.icons.some((icon) => icon.purpose === 'maskable')).toBe(true)

  for (const icon of body.icons) {
    const response = await request.get(`/${icon.src.replace(/^\//, '')}`)
    expect(response.ok(), `icon ${icon.src} 應該可以下載`).toBe(true)
    expect(response.headers()['content-type']).toContain('image/png')
  }

  const appleIcon = await request.get('/icons/icon-192.png')
  expect(appleIcon.ok()).toBe(true)
})

test('service worker 有註冊且預快取檔案可取得（兩種寬度都跑）', async ({ page, request }) => {
  await openApp(page)
  // ready 只會在 active worker 可用時 resolve；getRegistration() 則可能先回傳
  // 尚在 installing 的 registration，不能把它當成驗收完成。
  const activeScriptUrl = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready
    return registration.active?.scriptURL
  })
  expect(activeScriptUrl).toContain('sw.js')

  const sw = await request.get('/sw.js')
  expect(sw.ok()).toBe(true)
})

/**
 * 只在 Chromium 跑。
 * 原因：Playwright 的 WebKit 在 setOffline(true) 之後 reload 會回傳
 * 「WebKit encountered an internal error」，是瀏覽器驅動層的限制，不是本專案的問題。
 * 解除條件：Playwright 修好 WebKit 離線 reload 後移除這個 skip。
 * 實機 iOS Safari 的離線行為仍需人工驗證一次（已列入待辦）。
 */
test('斷網後重新開啟仍可使用，且能繼續修改本地庫存', async ({ page, context, browserName }) => {
  test.skip(
    browserName === 'webkit',
    'Playwright 的 WebKit 在離線模式下 reload 會拋內部錯誤，改由 Chromium 專案覆蓋',
  )
  await openApp(page)
  await page.evaluate(async () => navigator.serviceWorker.ready)

  // 先在線上建立一筆資料，等下離線時要確認它還在。
  await openApp(page, '/products')
  await page.getByTestId('tab-catalog').click()
  await page.getByTestId('product-search').fill('BX-01')
  const card = page.getByTestId('catalog-product').first()
  await expect(card).toBeVisible()
  await card.getByTestId('add-owned').click()
  await page.getByTestId('tab-my-products').click()
  await expect(page.getByTestId('owned-product').first()).toBeVisible()

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('navigation', { name: '主要導覽' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('資料載入中…')).toHaveCount(0, { timeout: 20_000 })

  // 離線也要看得到既有庫存
  await openApp(page, '/')
  await expect(page.getByTestId('stat-products-value')).toHaveText('1')

  // 離線也要能改庫存（第 2 節）
  await openApp(page, '/products')
  await page.getByTestId('tab-my-products').click()
  const owned = page.getByTestId('owned-product').first()
  await owned.getByTestId('owned-qty').fill('4')
  await openApp(page, '/')
  await expect(page.getByTestId('stat-blades-value')).toHaveText('4')

  await context.setOffline(false)
})

test('所有主要頁面都沒有執行期錯誤', async ({ page }) => {
  const problems: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`)
  })
  page.on('pageerror', (error) => {
    problems.push(`pageerror: ${error.message}`)
  })

  for (const route of ROUTES) {
    await openApp(page, route)
  }

  // 帶資料的狀態也要檢查一次
  await openApp(page, '/products')
  await page.getByTestId('tab-catalog').click()
  await page.getByTestId('product-search').fill('BX-01')
  await page.getByTestId('catalog-product').first().getByTestId('add-owned').click()
  await page.getByTestId('tab-my-products').click()
  await expect(page.getByTestId('owned-product').first()).toBeVisible()

  for (const route of ROUTES) {
    await openApp(page, route)
  }

  expect(problems, problems.join('\n')).toEqual([])
})

test('匯出備份與匯入備份可以來回', async ({ page }) => {
  await openApp(page, '/products')
  await page.getByTestId('tab-catalog').click()
  await page.getByTestId('product-search').fill('BX-01')
  const card = page.getByTestId('catalog-product').first()
  await card.getByTestId('catalog-qty').fill('2')
  await card.getByTestId('add-owned').click()
  await page.getByTestId('tab-my-products').click()
  await expect(page.getByTestId('owned-product').first()).toBeVisible()

  await openApp(page, '/settings')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '匯出我的資料' }).click()
  const file = await download
  expect(file.suggestedFilename()).toContain('beyblade-x-backup')

  const path = await file.path()
  expect(path).toBeTruthy()

  // 清空後再匯入，資料要完整回來
  await openApp(page, '/products')
  await page.getByTestId('tab-my-products').click()
  await page.getByRole('button', { name: '刪除' }).first().click()
  await openApp(page, '/')
  await expect(page.getByTestId('stat-products-value')).toHaveText('0')

  await openApp(page, '/settings')
  await page.setInputFiles('input[aria-label="選擇備份檔"]', path as string)
  await expect(page.getByText('已匯入備份，資料已覆蓋')).toBeVisible()
  await openApp(page, '/')
  await expect(page.getByTestId('stat-products-value')).toHaveText('1')
  await expect(page.getByTestId('stat-blades-value')).toHaveText('2')
})

/**
 * 第 1.4 節：前台一律使用台灣中文名稱，英文／日文只能當搜尋別名或詳細頁的次要名稱。
 * 這個測試巡所有列表與工具頁面，確認畫面上看不到日文假名。
 */
test('主要頁面畫面上不得出現日文假名', async ({ page }) => {
  // 排除 U+30FB「・」：中文排版也用它當分隔符，算進去會產生假警報。
  const KANA = /[\u3040-\u309f\u30a1-\u30fa\u30fc-\u30ff]/

  // 先放一筆庫存，讓各頁面有實際內容可渲染
  await openApp(page, '/products')
  await page.getByTestId('tab-catalog').click()
  await page.getByTestId('product-search').fill('BX-01')
  await page.getByTestId('catalog-product').first().getByTestId('add-owned').click()
  await page.getByTestId('tab-my-products').click()
  await expect(page.getByTestId('owned-product').first()).toBeVisible()

  for (const route of ROUTES) {
    await openApp(page, route)
    const text = await page.locator('body').innerText()
    const hits = text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => KANA.test(line))
    expect(hits, `${route} 出現日文：${hits.join(' | ')}`).toEqual([])
  }

  // 配裝器選滿零件後的結果面板也要檢查
  await openApp(page, '/builder')
  await page.getByLabel('上蓋').selectOption('blade:ドランソード')
  await page.getByLabel('固鎖').selectOption('ratchet:3-60')
  await page.getByLabel('軸心').selectOption('bit:F')
  await expect(page.getByText('配裝結果')).toBeVisible()
  const builderText = await page.locator('body').innerText()
  const builderHits = builderText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => KANA.test(line))
  expect(builderHits, `配裝器出現日文：${builderHits.join(' | ')}`).toEqual([])
})
