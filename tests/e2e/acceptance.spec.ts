import { expect, test, type Page } from '@playwright/test'
import { pickSlot } from './helpers.ts'

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
  // 導覽列每一頁都有，不能當換頁依據；要等外層的 data-route 真的變成目標路由，
  // 否則可能在 React 還掛著上一頁時就去點元素，事件會打到已被卸載的節點。
  // data-route 只放路徑，帶查詢字串的網址要先去掉 ? 後面那段才比對得到。
  await expect(page.locator(`[data-route="${hash.split('?')[0]}"]`)).toBeVisible()
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

  test('Case 6：Random Booster 選官方款式開封後才加入零件', async ({ page }) => {
    await addProductFromCatalog(page, 'BX-14', 1)

    await page.getByLabel('抽到的款式').selectOption('bx14-variant-03')
    await page.getByRole('button', { name: '登記開封' }).click()
    await expect(page.getByText('未拆封 0 盒 ・ 已拆封 1 盒')).toBeVisible()

    await openApp(page, '/parts')
    await expect(partRow(page, BX01.blade).getByTestId('part-available')).toHaveText('可用 ×1')
  })

  test('Case 7：標記已實際組裝後，對應零件會占用庫存', async ({ page }) => {
    await addProductFromCatalog(page, 'BX-01', 1)

    await openApp(page, '/builder')
    await pickSlot(page, 'bladeId', BX01.blade)
    await pickSlot(page, 'ratchetId', BX01.ratchet)
    await pickSlot(page, 'bitId', BX01.bit)
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
    await pickSlot(page, 'bladeId', BX01.blade)
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
    await expect(title).toContainText('蒼龍神劍')
    expect(await title.textContent()).not.toMatch(/[぀-ヿ]/)

    await page.getByTestId('product-search').fill('BX-01')
    await expect(page.getByTestId('catalog-product-title').first()).toContainText('BX-01 蒼龍神劍3-60F')
  })
})

test('一體式上蓋會清除既選固鎖，且可直接搭配軸心', async ({ page }) => {
  await openApp(page, '/builder')
  await page.getByRole('button', { name: '顯示全部圖鑑' }).click()

  // 先選固鎖再換一體式上蓋，是先前會留下矛盾欄位的回歸路徑。
  await pickSlot(page, 'ratchetId', 'ratchet:3-60')
  await pickSlot(page, 'bladeId', 'integrated_blade:バレットグリフォン')

  // 欄位留著但鎖死：直接讓它消失，使用者看不出是系統判定不用選，只覺得畫面沒反應。
  await expect(page.getByTestId('slot-ratchetId')).toBeVisible()
  await expect(page.getByTestId('slot-trigger-ratchetId')).toBeDisabled()
  await expect(page.getByTestId('slot-locked-ratchetId')).toHaveText('此上蓋已含固鎖，不需另選')

  await pickSlot(page, 'bitId', 'bit:F')
  await expect(page.getByTestId('compat-error')).toHaveCount(0)
})

test('一般上蓋的固鎖欄位可以正常選（鎖定只發生在一體式零件）', async ({ page }) => {
  await openApp(page, '/builder')
  await page.getByRole('button', { name: '顯示全部圖鑑' }).click()
  await pickSlot(page, 'bladeId', 'blade:ドランバスター')
  await expect(page.getByTestId('slot-trigger-ratchetId')).toBeEnabled()
  await expect(page.getByTestId('slot-locked-ratchetId')).toHaveCount(0)
})

test('賽事用過的配置會給出可回查的證據理由', async ({ page }) => {
  await openApp(page, '/builder')
  await page.getByRole('button', { name: '顯示全部圖鑑' }).click()
  // G1 高雄站冠軍實際用過的一顆配置
  await pickSlot(page, 'bladeId', 'blade:ウィザードロッド')
  await pickSlot(page, 'ratchetId', 'ratchet:1-60')
  await pickSlot(page, 'bitId', 'bit:H')

  const reasons = page.getByTestId('evidence-reasons')
  await expect(reasons).toBeVisible()
  await expect(reasons).toContainText('整套出現在')
  await expect(reasons).toContainText('冠軍')
  await expect(reasons.getByRole('link', { name: '來源' }).first()).toBeVisible()
})

test('沒有證據的配置要說清楚為什麼，不是留白', async ({ page }) => {
  await openApp(page, '/builder')
  await page.getByRole('button', { name: '顯示全部圖鑑' }).click()
  await pickSlot(page, 'bladeId', 'blade:ナイトシールド')
  await pickSlot(page, 'ratchetId', 'ratchet:4-80')
  await pickSlot(page, 'bitId', 'bit:N')

  const reasons = page.getByTestId('evidence-reasons')
  await expect(reasons).toBeVisible()
  await expect(reasons).toContainText('還沒進高手榜')
})

test('配完之後看得到每個零件要去買哪一盒', async ({ page }) => {
  await openApp(page, '/builder')
  await page.getByRole('button', { name: '顯示全部圖鑑' }).click()
  await pickSlot(page, 'bladeId', 'blade:ドランソード')
  await pickSlot(page, 'ratchetId', 'ratchet:3-60')
  await pickSlot(page, 'bitId', 'bit:F')

  const sources = page.getByTestId('part-sources')
  await expect(sources).toBeVisible()
  await expect(sources).toContainText('去哪裡買')
  // 購買來源只列舉商品，不替使用者排序推薦。
  await expect(sources).toContainText('BX-01')
  await expect(sources).not.toContainText('最划算')
  await expect(sources).not.toContainText('一盒補到')
})

test('配裝器可一鍵清除零件，但保留目前模式與結構', async ({ page }) => {
  await openApp(page, '/builder')
  await page.getByRole('button', { name: '顯示全部圖鑑' }).click()
  await pickSlot(page, 'bladeId', BX01.blade)
  await expect(page.getByTestId('clear-builder')).toBeEnabled()
  await page.getByTestId('clear-builder').click()
  await expect(page.getByTestId('slot-trigger-bladeId')).toContainText('選擇上蓋')
  await expect(page.getByRole('button', { name: '顯示全部圖鑑' })).toHaveClass(/btn-primary/)
  await expect(page.getByRole('button', { name: '三件式（BX／UX）' })).toHaveClass(/btn-primary/)
})

test('完成 A 後可直接到比較頁配 B，顯示高度對位與模型預測', async ({ page }) => {
  await openApp(page, '/builder')
  await page.getByRole('button', { name: '顯示全部圖鑑' }).click()
  await pickSlot(page, 'bladeId', BX01.blade)
  await pickSlot(page, 'ratchetId', BX01.ratchet)
  await pickSlot(page, 'bitId', BX01.bit)
  await page.getByTestId('compare-current-combo').click()
  await expect(page.locator('[data-route="/compare"]')).toBeVisible()
  await pickSlot(page, 'bladeId', BX01.blade, 'b')
  await pickSlot(page, 'ratchetId', BX01.ratchet, 'b')
  await pickSlot(page, 'bitId', BX01.bit, 'b')
  await expect(page.getByTestId('matchup-prediction')).toBeVisible()
  await expect(page.getByTestId('matchup-prediction')).toContainText('勝負難分')
  await expect(page.getByTestId('height-matchup')).toContainText('雙方同為高度碼 60')
  await expect(page.getByRole('cell', { name: '爆發', exact: true })).toBeVisible()
  await expect(page.getByRole('cell', { name: '抗爆', exact: true })).toBeVisible()
})

test('選到有評級的零件時顯示高手評級與共識人數', async ({ page }) => {
  await openApp(page, '/builder')
  await page.getByRole('button', { name: '顯示全部圖鑑' }).click()
  await pickSlot(page, 'bladeId', 'blade:シャークスケイル')
  const ratings = page.getByTestId('expert-part-ratings')
  await expect(ratings).toBeVisible()
  await expect(ratings).toContainText('位高手')
  await expect(ratings).toContainText('社群主觀意見')
})

test('零件挑選器可用日文別名搜尋，但結果只顯示中文', async ({ page }) => {
  await openApp(page, '/builder')
  await page.getByRole('button', { name: '顯示全部圖鑑' }).click()
  await page.getByTestId('slot-trigger-bladeId').click()
  const sheet = page.getByTestId('part-picker-sheet')
  await sheet.getByTestId('picker-search').fill('ドランソード')
  await expect(sheet.getByTestId('picker-option').first()).toContainText('蒼龍神劍')
  expect(await sheet.innerText()).not.toMatch(/[\u3040-\u309f\u30a1-\u30fa\u30fc-\u30ff]/)
})

test('驗收測試檔本身有被執行（守門測試）', async () => {
  // 防止整個檔案被誤設為 skip 而無人察覺（第 49.1 節：禁止必定通過的測試）
  expect(test.info().project.name).toMatch(/手機寬度|桌機寬度/)
})

test('時鐘幻象裝不相容的固鎖時會警告，但不擋儲存', async ({ page }) => {
  await openApp(page, '/builder')
  await page.getByRole('button', { name: '顯示全部圖鑑' }).click()
  await pickSlot(page, 'bladeId', 'blade:クロックミラージュ')
  await pickSlot(page, 'ratchetId', 'ratchet:3-60')
  await pickSlot(page, 'bitId', 'bit:F')

  const warning = page.getByTestId('compat-warning')
  await expect(warning).toBeVisible()
  await expect(warning).toContainText('時鐘幻象')
  await expect(warning).toContainText('3-60')
  // 來源本身有分歧，所以只提醒不阻擋；每則警告都要附得回查的來源
  await expect(page.getByTestId('compat-error')).toHaveCount(0)
  await expect(warning.getByRole('link').first()).toHaveAttribute('href', /^https:\/\//)

  // 換成白名單內的固鎖就不該再警告
  await pickSlot(page, 'ratchetId', 'ratchet:9-65')
  await expect(page.getByTestId('compat-warning')).toHaveCount(0)
})

test('選到可切換模式的零件時列出它的模式與來源', async ({ page }) => {
  await openApp(page, '/builder')
  await page.getByRole('button', { name: '顯示全部圖鑑' }).click()
  await pickSlot(page, 'bladeId', 'integrated_blade:ヘルズネザー')
  await pickSlot(page, 'bitId', 'bit:F')

  const modes = page.getByTestId('switchable-modes')
  await expect(modes).toBeVisible()
  await expect(modes).toContainText('惡魔幽冥')
  await expect(modes).toContainText('低位模式')
  await expect(modes.getByRole('link').first()).toHaveAttribute('href', /^https:\/\//)
})
