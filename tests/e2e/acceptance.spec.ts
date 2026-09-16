import { expect, test, type Page } from '@playwright/test'

/**
 * 規格第 45 節 驗收核心情境 Case 1–10。
 * 第 48.2 節：這 10 個測試全綠才等於 v1 完成，且必須跑真實 UI 與真實 IndexedDB。
 *
 * 每個 Playwright 測試使用獨立的瀏覽器 context，所以 IndexedDB 都是全新的，
 * 正好對應第 1 節「初次開啟個人資料必須完全空白」。
 */

/** 官方型號對應的零件 id，來自 Catalog（商品名稱本身就是官方資料）。 */
const BX01 = { blade: 'blade:ドランソード', ratchet: 'ratchet:3-60', bit: 'bit:F' }

async function openApp(page: Page, hash = '/'): Promise<void> {
  await page.goto(`/#${hash}`)
  await expect(page.getByRole('navigation', { name: '主要導覽' })).toBeVisible()
  await expect(page.getByText('資料載入中…')).toHaveCount(0, { timeout: 20_000 })
}

async function addProductFromCatalog(
  page: Page,
  query: string,
  quantity: number,
  status?: string,
): Promise<void> {
  await openApp(page, '/products')
  await page.getByTestId('tab-catalog').click()
  await page.getByTestId('product-search').fill(query)
  const card = page.getByTestId('catalog-product').first()
  await expect(card).toBeVisible()
  if (status) await card.getByTestId('catalog-status').selectOption(status)
  await card.getByTestId('catalog-qty').fill(String(quantity))
  await card.getByTestId('add-owned').click()
  await page.getByTestId('tab-my-products').click()
  await expect(page.getByTestId('owned-product').first()).toBeVisible()
}

function partRow(page: Page, partId: string) {
  return page.locator(`[data-testid="part-stock"][data-part-id="${partId}"]`)
}

test.describe('第 45 節 驗收核心情境', () => {
  test('Case 1：第一次開 App 時，我的商品 0、我的零件 0', async ({ page }) => {
    await openApp(page)
    await expect(page.getByTestId('stat-products-value')).toHaveText('0')
    await expect(page.getByTestId('stat-blades-value')).toHaveText('0')
    await expect(page.getByTestId('stat-ratchets-value')).toHaveText('0')
    await expect(page.getByTestId('stat-bits-value')).toHaveText('0')
    await expect(page.getByTestId('stat-combos-value')).toHaveText('0')
    await expect(page.getByTestId('stat-decks-value')).toHaveText('0')

    await openApp(page, '/parts')
    await expect(page.getByText('我的零件：0')).toBeVisible()
  })

  test('Case 2：加入商品 ×3 後，商品內每個零件自動 ×3', async ({ page }) => {
    await addProductFromCatalog(page, 'BX-01', 3)

    await openApp(page, '/parts')
    await expect(partRow(page, BX01.blade).getByTestId('part-available')).toHaveText('可用 ×3')
    await expect(partRow(page, BX01.ratchet).getByTestId('part-available')).toHaveText('可用 ×3')
    await expect(partRow(page, BX01.bit).getByTestId('part-available')).toHaveText('可用 ×3')

    await openApp(page)
    await expect(page.getByTestId('stat-products-value')).toHaveText('1')
    await expect(page.getByTestId('stat-blades-value')).toHaveText('3')
  })

  test('Case 3：另外單獨加入某零件 ×2 後，聚合正確且來源可追蹤', async ({ page }) => {
    await addProductFromCatalog(page, 'BX-01', 3)

    await openApp(page, '/parts')
    await page.getByTestId('tab-part-catalog').click()
    await page.getByTestId('part-search').fill('3-60')
    const card = page.getByTestId('catalog-part').first()
    await expect(card).toBeVisible()
    await expect(card.getByTestId('catalog-part-title')).toContainText('3-60')
    await card.getByTestId('standalone-qty').fill('2')
    await card.getByTestId('add-standalone').click()

    await page.getByTestId('tab-my-parts').click()
    await expect(partRow(page, BX01.ratchet).getByTestId('part-available')).toHaveText('可用 ×5')
    await expect(partRow(page, BX01.blade).getByTestId('part-available')).toHaveText('可用 ×3')

    await partRow(page, BX01.ratchet).click()
    await expect(page.getByRole('heading', { name: '庫存來源' })).toBeVisible()
    await expect(page.getByText('單獨購入 ×2（可用）')).toBeVisible()
    await expect(page.getByText(/×3（可用）/)).toBeVisible()
  })

  test('Case 4：未到貨商品不計入可用庫存', async ({ page }) => {
    await addProductFromCatalog(page, 'BX-01', 2, 'ordered')

    await openApp(page, '/parts')
    const row = partRow(page, BX01.blade)
    await expect(row.getByTestId('part-available')).toHaveText('可用 ×0')
    await expect(row.getByTestId('part-ordered')).toHaveText('未到貨 ×2')

    await openApp(page)
    await expect(page.getByTestId('stat-blades-value')).toHaveText('0')
  })

  test('Case 5：Random Booster 未拆封時不加入任何實際零件', async ({ page }) => {
    await addProductFromCatalog(page, 'BX-14', 2)
    await expect(page.getByText('未拆封 2 盒 ・ 已拆封 0 盒')).toBeVisible()

    await openApp(page, '/parts')
    await expect(page.getByText('我的零件：0')).toBeVisible()
  })

  test('Case 6：Random Booster 開封並登記實際內容後才加入零件', async ({ page }) => {
    await addProductFromCatalog(page, 'BX-14', 1)

    const form = page.getByTestId('manual-open-form')
    await expect(form).toBeVisible()
    await form.getByTestId('manual-open-part').first().selectOption(BX01.blade)
    await form.getByTestId('manual-open-submit').click()
    await expect(page.getByText('未拆封 0 盒 ・ 已拆封 1 盒')).toBeVisible()

    await openApp(page, '/parts')
    await expect(partRow(page, BX01.blade).getByTestId('part-available')).toHaveText('可用 ×1')
  })

  test('Case 7：標記已實際組裝後，對應零件會占用庫存', async ({ page }) => {
    await addProductFromCatalog(page, 'BX-01', 1)

    await openApp(page, '/builder')
    await page.getByLabel('上蓋').selectOption(BX01.blade)
    await page.getByLabel('固鎖').selectOption(BX01.ratchet)
    await page.getByLabel('軸心').selectOption(BX01.bit)
    await expect(page.getByTestId('compat-error')).toHaveCount(0)
    await page.getByTestId('combo-name').fill('我的第一套')
    await page.getByTestId('physically-built').check()
    await page.getByTestId('save-combo').click()

    await expect(page.getByTestId('stat-combos-value')).toHaveText('1', { timeout: 15_000 })

    await openApp(page, '/parts')
    const row = partRow(page, BX01.ratchet)
    await expect(row.getByTestId('part-reserved')).toHaveText('已組裝占用 ×1')
    await expect(row.getByTestId('part-free')).toHaveText('還能用 ×0')
  })

  test('Case 8：配裝器不可儲存無法安裝的配置', async ({ page }) => {
    await addProductFromCatalog(page, 'BX-01', 1)

    await openApp(page, '/builder')
    await page.getByLabel('上蓋').selectOption(BX01.blade)
    await page.getByTestId('combo-name').fill('缺零件的配裝')

    const error = page.getByTestId('compat-error')
    await expect(error).toBeVisible()
    await expect(error).toContainText('此組合無法實際安裝。')
    await expect(error).toContainText('尚未選擇固鎖')
    await expect(page.getByTestId('save-combo')).toBeDisabled()
  })

  test('Case 9：3on3 不得超過實際可用數量', async ({ page }) => {
    await addProductFromCatalog(page, 'BX-01', 1)
    await addProductFromCatalog(page, 'BX-02', 1)

    await openApp(page, '/decks')
    // 只有兩個上蓋，排不出三套不重複上蓋的隊伍，系統必須拒絕而不是硬湊。
    await expect(page.getByTestId('deck-no-valid')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('deck-suggestion')).toHaveCount(0)
  })

  test('Case 10：搜尋英文或日文別名，結果仍顯示台灣中文主名稱', async ({ page }) => {
    await openApp(page, '/products')
    await page.getByTestId('tab-catalog').click()

    await page.getByTestId('product-search').fill('ドランソード')
    const title = page.getByTestId('catalog-product-title').first()
    await expect(title).toBeVisible()
    await expect(title).toContainText('龍之劍')
    expect(await title.textContent()).not.toMatch(/[぀-ヿ]/)

    await page.getByTestId('product-search').fill('BX-01')
    await expect(page.getByTestId('catalog-product-title').first()).toContainText('龍之劍3-60F')
  })
})

test('驗收測試檔本身有被執行（守門測試）', async () => {
  // 防止整個檔案被誤設為 skip 而無人察覺（第 49.1 節：禁止必定通過的測試）
  expect(test.info().project.name).toMatch(/手機寬度|桌機寬度/)
})
