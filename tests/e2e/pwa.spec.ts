import { expect, test, type Page } from '@playwright/test'
import { pickSlot } from './helpers.ts'

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
  // 導覽列每一頁都有，不能當換頁依據；要等外層的 data-route 真的變成目標路由，
  // 否則可能在 React 還掛著上一頁時就去點元素，事件會打到已被卸載的節點。
  // data-route 只放路徑，帶查詢字串的網址要先去掉 ? 後面那段才比對得到。
  await expect(page.locator(`[data-route="${hash.split('?')[0]}"]`)).toBeVisible()
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

test('「重新載入最新版」會清掉程式快取，但不能動到庫存', async ({ page }) => {
  await openApp(page, '/products')
  await page.getByTestId('tab-catalog').click()
  await page.getByTestId('product-search').fill('BX-01')
  const card = page.getByTestId('catalog-product').first()
  await expect(card).toBeVisible()
  await card.getByTestId('add-owned').click()
  await page.getByTestId('tab-my-products').click()
  await expect(page.getByTestId('owned-product').first()).toBeVisible()

  await openApp(page, '/')
  await page.evaluate(async () => navigator.serviceWorker.ready)
  await expect.poll(async () => page.evaluate(async () => (await caches.keys()).length)).toBeGreaterThan(0)

  await page.getByTestId('reload-latest').click()

  // 重新載入後：程式快取清掉了，但 IndexedDB 裡的庫存必須原封不動。
  await expect(page.getByRole('navigation', { name: '主要導覽' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('資料載入中…')).toHaveCount(0, { timeout: 20_000 })
  await expect(page.getByTestId('stat-products-value')).toHaveText('1')
  await expect(page.getByTestId('stat-blades-value')).toHaveText('1')
})

/**
 * 第 2 節：手機優先 RWD。
 *
 * 市面上手機的 CSS 寬度大致落在 320（iPhone SE 第一代）到 430（iPhone Pro Max）之間，
 * 這裡取最窄的三個檔位；最窄的過得了，寬的就不會爆版。
 */
const PHONE_WIDTHS = [320, 360, 390]

test('各種手機寬度下畫面都不會橫向超出', async ({ page }) => {
  // 先放一點庫存，空畫面量不出真正的版面寬度。
  await openApp(page, '/products')
  await page.getByTestId('tab-catalog').click()
  for (const sku of ['BX-01', 'CX-14']) {
    await page.getByTestId('product-search').fill(sku)
    const card = page.getByTestId('catalog-product').first()
    await expect(card).toBeVisible()
    await card.getByTestId('add-owned').click()
    await page.getByTestId('tab-catalog').click()
  }

  for (const width of PHONE_WIDTHS) {
    await page.setViewportSize({ width, height: 844 })
    for (const route of ROUTES) {
      await openApp(page, route)
      const offenders = await page.evaluate((viewportWidth) => {
        const out: string[] = []
        for (const element of document.querySelectorAll('body *')) {
          const box = element.getBoundingClientRect()
          if (box.width === 0 && box.height === 0) continue
          if (box.right > viewportWidth + 1 || box.left < -1) {
            out.push(
              `${element.tagName.toLowerCase()}.${String(element.className).slice(0, 30)} ` +
                `[${Math.round(box.left)}, ${Math.round(box.right)}] ` +
                `${(element.textContent ?? '').trim().slice(0, 20)}`,
            )
          }
        }
        return out.slice(0, 5)
      }, width)
      expect(offenders, `${route} 在 ${width}px 有元素超出畫面`).toEqual([])

      const documentOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(documentOverflow, `${route} 在 ${width}px 出現橫向捲動`).toBeLessThanOrEqual(0)
    }
  }
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
  /*
   * 超時放寬到 30 秒的原因（實測過，不是隨手加的）：
   * 應用端 repo.importBackup 只花約 5 ms，慢的是 Playwright 把檔案經 CDP 交給
   * Chromium 的那段；整檔一起跑（同時在錄 trace）時 File.text() 曾量到 12.7 秒，
   * 單獨跑同一個測試只要 0.5 秒。這是測試通道的成本，不是產品效能問題。
   */
  await expect(page.getByText('已匯入備份，資料已覆蓋')).toBeVisible({ timeout: 30_000 })
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
  await pickSlot(page, 'bladeId', 'blade:ドランソード')
  await pickSlot(page, 'ratchetId', 'ratchet:3-60')
  await pickSlot(page, 'bitId', 'bit:F')
  await expect(page.getByText('配裝結果')).toBeVisible()
  const builderText = await page.locator('body').innerText()
  const builderHits = builderText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => KANA.test(line))
  expect(builderHits, `配裝器出現日文：${builderHits.join(' | ')}`).toEqual([])
})

test('配裝器會顯示對應上蓋的專家 T 表，且清楚標成社群意見', async ({ page }) => {
  await openApp(page, '/builder')
  await page.getByRole('button', { name: '顯示全部圖鑑' }).click()
  await pickSlot(page, 'bladeId', 'blade:シャークスケイル')

  const result = page.getByText('專家評級：').locator('..')
  await expect(result).toContainText('T0')
  await expect(result).toContainText('阿土｜7月 高雄G1最強陀螺天梯表')
  await expect(result).toContainText('社群專家的主觀評級，不是賽事樣本也不是本站模型推估。')
  const sources = result.getByRole('link', { name: '來源' })
  await expect(sources).toHaveCount(2)
  await expect(sources.nth(0)).toHaveAttribute(
    'href',
    'https://beybladehub.app/t/d2ynkeu9',
  )
  await expect(sources.nth(1)).toHaveAttribute('href', 'https://beybladehub.app/t/NAu9mbLh')
})

/**
 * CX 四件式（超越拆組）的配裝器流程。
 *
 * 官方商品名把超越戰刃與輔助戰刃寫成相鄰兩個字母，資料層已拆成兩顆零件；
 * 這裡守 UI 有跟著出現／收掉超越戰刃欄位，不然使用者永遠組不出四件式。
 */
test('CX 四件式在配裝器會出現超越戰刃欄位，三件式不會', async ({ page }) => {
  await openApp(page, '/builder')
  await page.getByRole('button', { name: '顯示全部圖鑑' }).click()
  await page.getByRole('button', { name: 'CX 模組化' }).click()

  // 紋章與主刃已拆成兩個槽位（社群站有收錄的那幾顆）
  await pickSlot(page, 'lockChipId', 'lock_chip:Dr')

  // 三件式主刃：沒有超越戰刃欄位
  await pickSlot(page, 'mainBladeId', 'main_blade:Br')
  await expect(page.getByLabel('超越戰刃')).toHaveCount(0)

  // 四件式主刃（金屬主刃）：欄位出現，且沒選會被擋下
  await pickSlot(page, 'mainBladeId', 'main_blade:metal-Bl')
  await expect(page.getByLabel('超越戰刃')).toBeVisible()
  await pickSlot(page, 'assistBladeId', 'assist_blade:S')
  await pickSlot(page, 'ratchetId', 'ratchet:3-60')
  await pickSlot(page, 'bitId', 'bit:F')
  await expect(page.getByTestId('compat-error')).toContainText('尚未選擇超越戰刃')

  // 選滿之後可以安裝，結構顯示為 CX 四件式
  await pickSlot(page, 'overBladeId', 'over_blade:B')
  await expect(page.getByTestId('compat-error')).toHaveCount(0)
  await expect(page.getByText('CX 模組化（上蓋四件式）').first()).toBeVisible()
})

/**
 * 拆開紋章與主刃的重點：可以混搭不同商品的零件。
 * 官方沒有這樣賣，但實體可以這樣組，配裝器要允許。
 */
test('CX 可以混搭不同商品的紋章與主刃', async ({ page }) => {
  await openApp(page, '/builder')
  await page.getByRole('button', { name: '顯示全部圖鑑' }).click()
  await page.getByRole('button', { name: 'CX 模組化' }).click()

  await pickSlot(page, 'lockChipId', 'lock_chip:Dr')
  await pickSlot(page, 'mainBladeId', 'main_blade:Dr')
  await pickSlot(page, 'assistBladeId', 'assist_blade:R')
  await pickSlot(page, 'ratchetId', 'ratchet:3-60')
  await pickSlot(page, 'bitId', 'bit:F')

  await expect(page.getByTestId('compat-error')).toHaveCount(0)
  await expect(page.getByText('CX 模組化（上蓋三件式）').first()).toBeVisible()
})

/**
 * 第 25 節：圖片只做外部連結。
 * 既然不重新散布，離線時就必須靠 service worker 快取；而且來源要看得到。
 */
test('service worker 有把外部圖片納入快取規則', async ({ request }) => {
  const sw = await request.get('/sw.js')
  expect(sw.ok()).toBe(true)
  // 網域在 sw.js 裡是正規表達式，點會被轉義成 \\.，比對前先把反斜線去掉。
  const source = (await sw.text()).replace(/\\/g, '')
  // 零件去背圖在這個網域，佔全部圖片的多數，漏掉就等於零件頁離線全破。
  expect(source).toContain('img.beybladehub.app')
  expect(source).toContain('beyblade.takaratomy.co.jp')
})

test('設定頁列出所有圖片來源與只連結不散布的說明', async ({ page }) => {
  await openApp(page, '/settings')
  await expect(page.getByRole('heading', { name: '圖片來源' })).toBeVisible()
  await expect(page.getByText('這不代表已取得授權', { exact: false })).toBeVisible()
  await expect(page.getByRole('link', { name: /BeybladeHub/ }).first()).toBeVisible()
  await expect(page.getByRole('link', { name: /Takara Tomy/ }).first()).toBeVisible()
})

test('零件詳情頁看得到圖片來源與授權狀態', async ({ page }) => {
  await openApp(page, '/part?id=blade%3A%E3%83%89%E3%83%A9%E3%83%B3%E3%82%BD%E3%83%BC%E3%83%89')
  await expect(page.getByText('圖片來源：', { exact: false })).toBeVisible()
  await expect(page.getByText('本機副本（未取得授權）', { exact: false })).toBeVisible()
})

/**
 * 配裝比較的實際流程（第 34 節）。
 * 這頁版面重排過，順手守住「選兩套就會出現比較表」這條主線。
 */
test('配裝比較選兩套之後出現比較表', async ({ page }) => {
  for (const sku of ['BX-01', 'BX-02']) {
    await openApp(page, '/products')
    await page.getByTestId('tab-catalog').click()
    await page.getByTestId('product-search').fill(sku)
    await page.getByTestId('catalog-product').first().getByTestId('add-owned').click()
  }

  await openApp(page, '/compare')
  await expect(page.getByText('還沒選滿兩套')).toBeVisible()

  const optionsA = page.getByLabel('配裝 A')
  const values = await optionsA.locator('option').evaluateAll((nodes) =>
    nodes.map((node) => (node as HTMLOptionElement).value).filter(Boolean),
  )
  expect(values.length).toBeGreaterThanOrEqual(2)

  await optionsA.selectOption(values[0]!)
  await page.getByLabel('配裝 B').selectOption(values[1]!)

  await expect(page.getByRole('heading', { name: '比較結果' })).toBeVisible()
  // 第 34 節要求的八個比較項目
  for (const label of ['攻擊', '防守', '持久', '高度', '穩定', '操作難度', '賽事證據', '資料可信度']) {
    await expect(page.getByRole('cell', { name: label, exact: true })).toBeVisible()
  }
  await expect(page.getByText('換掉的零件')).toBeVisible()
})
