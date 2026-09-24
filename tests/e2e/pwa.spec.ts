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
  '/wishlist',
  '/settings',
]

async function openApp(page: Page, hash = '/'): Promise<void> {
  // 同一個 test 內只在初次開啟時做整頁導覽；之後改 hash 就足夠觸發路由。
  // WebKit 在快速重複載入 PWA 時會偶發 sw.js load failed，也不是使用者點導覽的實際流程。
  if (await page.locator('[data-app-ready="true"]').count()) {
    await page.evaluate((nextHash) => {
      window.location.hash = nextHash
    }, hash)
  } else {
    await page.goto(`/#${hash}`)
    await page.evaluate(async () => navigator.serviceWorker.ready)
  }
  await expect(page.getByRole('navigation', { name: '主要導覽' })).toBeVisible()
  await expect(page.locator('[data-app-ready="true"]')).toBeVisible({ timeout: 20_000 })
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

/*
 * 上面那條只在預設的「只用我有的」模式下巡頁。那個模式下庫存幾乎都夠，
 * 徽章永遠是兩個字的「可組」，所以最寬的那種列（「差 N 件」徽章 + 圖鑑裡最長的配裝名）
 * 從來沒被量到。這條專門切到「全部圖鑑」再量一次。
 */
test('我能組什麼切到全部圖鑑後，最窄手機寬度仍然不會橫向超出', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 })
  await openApp(page, '/buildable')
  await page.getByRole('button', { name: '全部圖鑑' }).click()

  // 圖鑑模式一定會出現庫存不足的列，否則這條測試量不到它要量的東西。
  await expect(page.getByText(/差 \d+ 件/).first()).toBeVisible()

  const offenders = await page.evaluate(() => {
    const out: string[] = []
    for (const element of document.querySelectorAll('body *')) {
      const box = element.getBoundingClientRect()
      if (box.width === 0 && box.height === 0) continue
      if (box.right > 320 + 1 || box.left < -1) {
        out.push(
          `${element.tagName.toLowerCase()}.${String(element.className).slice(0, 30)} ` +
            `[${Math.round(box.left)}, ${Math.round(box.right)}] ` +
            `${(element.textContent ?? '').trim().slice(0, 20)}`,
        )
      }
    }
    return out.slice(0, 5)
  })
  expect(offenders, '全部圖鑑模式在 320px 有元素超出畫面').toEqual([])

  const documentOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(documentOverflow, '全部圖鑑模式在 320px 出現橫向捲動').toBeLessThanOrEqual(0)
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

  /*
   * 先放庫存，讓各頁面有實際內容可渲染。
   *
   * BX-17 是刻意選的：它內含對戰盤與兩支發射器，官方名稱全是日文片假名
   * （エクストリームスタジアム、ワインダーランチャー）。只種 BX-01 的話配件庫是空的，
   * 那條違規就永遠不會被這個測試看到——實際上它漏了很久。
   */
  await openApp(page, '/products')
  for (const sku of ['BX-01', 'BX-17']) {
    await page.getByTestId('tab-catalog').click()
    await page.getByTestId('product-search').fill(sku)
    const card = page.getByTestId('catalog-product').first()
    await expect(card).toBeVisible()
    await card.getByTestId('add-owned').click()
  }
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

  /*
   * 配件庫不是 /parts 的預設分頁，上面的 ROUTES 巡檢看不到它。
   * 配件的官方名稱是日文，這裡是唯一會抓到它的地方。
   */
  await openApp(page, '/parts')
  await page.getByTestId('tab-accessories').click()
  await expect(page.getByText('配件（不進配裝器）')).toBeVisible()
  const accessoryText = await page.locator('body').innerText()
  const accessoryHits = accessoryText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => KANA.test(line))
  expect(accessoryHits, `配件庫出現日文：${accessoryHits.join(' | ')}`).toEqual([])

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

test('配裝器顯示零件類型比重，不再顯示六軸評估或分數字樣', async ({ page }) => {
  await openApp(page, '/builder')
  await page.getByRole('button', { name: '顯示全部圖鑑' }).click()
  await pickSlot(page, 'bladeId', 'blade:ドランソード')
  await pickSlot(page, 'ratchetId', 'ratchet:3-60')
  await pickSlot(page, 'bitId', 'bit:F')
  await expect(page.getByText('零件類型比重')).toBeVisible()
  await expect(page.getByText('六軸評估')).toHaveCount(0)
  await expect(page.getByText('攻擊型', { exact: true })).toBeVisible()
})

test('部分映射的 G1 牌組只顯示來源觀測，不灌入賽事統計', async ({ page }) => {
  await openApp(page, '/builder')
  await page.getByRole('button', { name: '顯示全部圖鑑' }).click()
  await pickSlot(page, 'bladeId', 'blade:ウィザードロッド')
  await pickSlot(page, 'ratchetId', 'ratchet:1-60')
  await pickSlot(page, 'bitId', 'bit:FB')

  const observations = page.getByTestId('observed-combo-matches')
  await expect(observations).toContainText('極限盃 G1 高雄站（通常組）')
  await expect(observations).toContainText('不計入出場率、Meta share 或可信度')
  // 場次數會隨收錄的賽事增加，守「有列出來而且每筆都可回查」而不是寫死條數。
  const links = observations.getByRole('link')
  expect(await links.count()).toBeGreaterThan(0)
  for (const link of await links.all()) {
    await expect(link).toHaveAttribute('href', /^https?:\/\//)
  }
})

test('CX 配裝也能顯示具名槽位的 G1 來源觀測', async ({ page }) => {
  await openApp(page, '/builder')
  await page.getByRole('button', { name: '顯示全部圖鑑' }).click()
  await page.getByRole('button', { name: 'CX 模組化' }).click()
  await pickSlot(page, 'lockChipId', 'lock_chip:Vl')
  await pickSlot(page, 'mainBladeId', 'main_blade:Bl')
  await pickSlot(page, 'assistBladeId', 'assist_blade:W')
  await pickSlot(page, 'ratchetId', 'ratchet:9-60')
  await pickSlot(page, 'bitId', 'bit:H')

  const observations = page.getByTestId('observed-combo-matches')
  await expect(observations).toContainText('極限盃 G1 高雄站（通常組）')
  await expect(observations).toContainText('不計入出場率、Meta share 或可信度')
  expect(await observations.getByRole('link').count()).toBeGreaterThan(0)
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

test('設定頁說明官方、社群賽事與高手 T 表的資料界線', async ({ page }) => {
  await openApp(page, '/settings')
  const acknowledgement = page.getByTestId('source-acknowledgement')
  await expect(acknowledgement).toContainText('Takara Tomy（官方）')
  await expect(acknowledgement).toContainText('BeybladeHub（社群）')
  await expect(acknowledgement).toContainText('非官方玩家資源站')
  await expect(acknowledgement).toContainText('不會改變賽事統計、模型分數或可信度')
  await expect(acknowledgement.getByRole('link', { name: '前往 BeybladeHub' })).toHaveAttribute(
    'href',
    'https://beybladehub.app',
  )
})

test('零件詳情頁看得到圖片來源與授權狀態', async ({ page }) => {
  await openApp(page, '/part?id=blade%3A%E3%83%89%E3%83%A9%E3%83%B3%E3%82%BD%E3%83%BC%E3%83%89')
  await expect(page.getByText('圖片來源：', { exact: false })).toBeVisible()
  await expect(page.getByText('本機副本（未取得授權）', { exact: false })).toBeVisible()
})

test('零件詳情頁也顯示可追溯的高手 T 表評級', async ({ page }) => {
  await openApp(page, '/part?id=blade%3A%E3%82%B7%E3%83%A3%E3%83%BC%E3%82%AF%E3%82%B9%E3%82%B1%E3%82%A4%E3%83%AB')
  const tier = page.getByTestId('part-expert-tier')
  await expect(tier).toContainText('T0')
  await expect(tier).toContainText('阿土｜7月 高雄G1最強陀螺天梯表')
  await expect(tier).toContainText('七月份T度排行')
  await expect(tier).toContainText('不會改變賽事統計、模型分數或可信度')
  await expect(tier.getByRole('link', { name: '來源' })).toHaveCount(2)
})

test('零件詳情把未完整映射牌組標示為來源觀測', async ({ page }) => {
  await openApp(page, '/part?id=blade%3A%E3%82%A6%E3%82%A3%E3%82%B6%E3%83%BC%E3%83%89%E3%83%AD%E3%83%83%E3%83%89')
  const observations = page.getByTestId('part-tournament-observations')
  await expect(observations).toContainText('尚有零件未映射')
  await expect(observations).toContainText('不納入出場率、Meta share 或可信度')
  expect(await observations.getByRole('link').count()).toBeGreaterThan(0)
})

test('前台任何一頁都不得再提到重量', async ({ page }) => {
  /*
   * 重量已經整個拿掉：同款零件的個體差異比配裝差異還大，顯示或計分都是誤導。
   * 但「資料不足」那類說明文案很容易把它留在字串裡（實際發生過），所以用一條巡邏測試守住。
   */
  for (const route of ROUTES) {
    await openApp(page, route)
    const hits = (await page.locator('body').innerText())
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.includes('重量'))
    expect(hits, `${route} 還在講重量：${hits.join(' | ')}`).toEqual([])
  }

  // 配裝結果面板的來源說明也要檢查
  await openApp(page, '/builder')
  // 預設是「只顯示我有的」，這個 context 的庫存是空的，要先切到全圖鑑才選得到零件
  await page.getByRole('button', { name: '顯示全部圖鑑' }).click()
  await pickSlot(page, 'bladeId', 'blade:ドランソード')
  await pickSlot(page, 'ratchetId', 'ratchet:3-60')
  await pickSlot(page, 'bitId', 'bit:F')
  await expect(page.getByText('配裝結果')).toBeVisible()
  const builderHits = (await page.locator('body').innerText())
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.includes('重量'))
  expect(builderHits, `配裝器還在講重量：${builderHits.join(' | ')}`).toEqual([])
})

test('個人對戰紀錄：現場選零件記分、打完存檔、歷史列表跟零件勝率簡表更新', async ({ page }) => {
  await openApp(page, '/battle-log')

  // 兩邊都還沒選零件時，計分板不該出現（Review Focus 第 3 項）。
  const scoreboard = page.getByTestId('scoreboard')
  await expect(scoreboard).toHaveCount(0)

  // 配裝 A：BX 三件式，直接用零件圖鑑的零件，不用先存配裝。
  await pickSlot(page, 'bladeId', 'blade:ドランソード', 'a')
  await pickSlot(page, 'ratchetId', 'ratchet:3-60', 'a')
  await pickSlot(page, 'bitId', 'bit:F', 'a')

  // A 選完、B 還沒選時，計分板還是不該出現。
  await expect(scoreboard).toHaveCount(0)

  // 配裝 B：另一顆上蓋，同款固鎖軸心。
  await pickSlot(page, 'bladeId', 'blade:ドランバスター', 'b')
  await pickSlot(page, 'ratchetId', 'ratchet:3-60', 'b')
  await pickSlot(page, 'bitId', 'bit:F', 'b')

  await expect(scoreboard).toBeVisible()

  // 先打到剛好 4 分（轉停×4），確認打完鎖住按鈕，再用「復原上一分」退回
  // 3 分，驗證按鈕真的重新解鎖（Review Focus 第 1 項——不能只退比分數字，
  // 沒有真的把按鈕解鎖）。
  for (let i = 0; i < 4; i++) await page.getByTestId('score-a-spin').click()
  await expect(page.getByTestId('score-a')).toHaveText('A 4')
  await expect(page.getByTestId('score-a-spin')).toBeDisabled()
  await expect(page.getByTestId('score-b-xtreme')).toBeDisabled()
  await expect(page.getByTestId('match-winner')).toHaveText('A 獲勝')

  await page.getByRole('button', { name: '復原上一分' }).click()
  await expect(page.getByTestId('score-a')).toHaveText('A 3')
  await expect(page.getByTestId('score-a-spin')).toBeEnabled()
  await expect(page.getByTestId('score-b-xtreme')).toBeEnabled()
  await expect(page.getByTestId('match-winner')).toHaveCount(0)

  // 清除重來，改用極限＋轉停湊到 4 分，同時測極限一次跳 3 分正確累加。
  await page.getByRole('button', { name: '清除重來' }).click()
  await expect(page.getByTestId('score-a')).toHaveText('A 0')
  await page.getByTestId('score-a-xtreme').click()
  await expect(page.getByTestId('score-a')).toHaveText('A 3')
  await page.getByTestId('score-a-spin').click()
  await expect(page.getByTestId('score-a')).toHaveText('A 4')
  await expect(page.getByTestId('match-winner')).toHaveText('A 獲勝')

  await page.getByTestId('save-match').click()

  await expect(page.getByTestId('battle-match').first()).toContainText('比分 4:0')
  await expect(page.getByTestId('battle-match').first()).toContainText('A 獲勝')
  await page.getByTestId('battle-match').first().locator('summary').click()
  await expect(page.getByTestId('battle-match').first()).toContainText('第 1 分：A／極限')
  await expect(page.getByTestId('battle-match').first()).toContainText('第 2 分：A／轉停')

  // 只打完 1 場，遠低於 LOW_SAMPLE_THRESHOLD（5），零件勝率簡表要顯示樣本不足。
  await expect(page.getByText(/樣本不足/).first()).toBeVisible()

  // 存檔後 points 要清空、配裝維持（Review Focus 第 4 項）：計分板回到
  // 0:0 可以連續記下一場，且配裝 A 的零件選擇器仍顯示剛剛選的上蓋，
  // 不用重選。
  await expect(page.getByTestId('score-a')).toHaveText('A 0')
  await expect(page.getByTestId('score-a-spin')).toBeEnabled()
  await expect(page.getByTestId('slot-trigger-a-bladeId')).toContainText('蒼龍神劍')
})

test('個人對戰紀錄：配裝器狀態行反映樣本不足的狀態', async ({ page }) => {
  await openApp(page, '/battle-log')
  await pickSlot(page, 'bladeId', 'blade:ドランソード', 'a')
  await pickSlot(page, 'ratchetId', 'ratchet:3-60', 'a')
  await pickSlot(page, 'bitId', 'bit:F', 'a')
  await pickSlot(page, 'bladeId', 'blade:ドランバスター', 'b')
  await pickSlot(page, 'ratchetId', 'ratchet:3-60', 'b')
  await pickSlot(page, 'bitId', 'bit:F', 'b')
  await page.getByTestId('score-a-xtreme').click()
  await page.getByTestId('score-a-spin').click()
  await page.getByTestId('save-match').click()
  await expect(page.getByTestId('battle-match').first()).toBeVisible()

  await openApp(page, '/builder')
  await page.getByRole('button', { name: '顯示全部圖鑑' }).click()
  await pickSlot(page, 'bladeId', 'blade:ドランソード')
  await pickSlot(page, 'ratchetId', 'ratchet:3-60')
  await pickSlot(page, 'bitId', 'bit:F')
  await expect(page.getByText(/個人對戰紀錄：已有對戰紀錄，樣本還不夠/)).toBeVisible()
})
