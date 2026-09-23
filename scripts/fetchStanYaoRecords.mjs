/**
 * 從 stan-yao 的「台灣天梯情報站」抓逐筆賽事名次紀錄，輸出兩份檔案：
 * - `stanyao-raw-records.json`：逐筆原始紀錄，當稽核用的來源真相，**不得**被
 *   app 程式碼直接 import（1.5 萬筆，檔案將近 4MB，直接 import 會被打包進
 *   瀏覽器程式碼，實測會讓 PWA service worker 的 precache 超過 2MB 上限，
 *   整個 build 直接失敗——這是這輪真的踩過的坑）。
 * - `stanyao-combo-summary.json`：依 comboCode 聚合後的摘要（2,503 個不重複
 *   配置，遠小於原始檔），`src/catalog/communityRecords.ts` 只 import 這份。
 *
 * 規格對照：第 21 節（賽事統計與樣本限制）、第 41 節（來源與驗證）、第 1.5 節（不得編造）。
 *
 * 為什麼需要這一份：站方在 https://stan-yao.github.io/beyblade_x_tier/ 的資料實際
 * 存放在公開 Google Sheet（`Raw Records` 分頁），逐筆記錄日期、名次、完整配置，
 * 規模（1.5 萬筆、跨兩年）遠超我們現有的本地賽事資料。
 *
 * 誠實界線：`Raw Records` 裡的 `kj_*` 欄位顯示這批資料是站方從某個用英文命名的
 * 外部來源程式化比對進來的，但具體是哪個外部來源目前查不到，一律標 community，
 * 不宣稱官方或特定賽事主辦方。這支腳本只做「比對得到就收，比對不到就列進
 * unresolved」，不猜測、不模糊比對硬湊零件名稱——唯一的例外是剝掉零件名結尾的
 * 旋向／顏色／型態括號註記（例如「蒼穹龍騎士(左)」→「蒼穹龍騎士」）再試一次，
 * 跟 `fetchHubTournaments.mjs` 剝顏色前綴是同一個既有慣例，且會誠實記在
 * `bladeMatchMethod` 裡，不是靜靜地當成完全比對。
 *
 * 用法：node scripts/fetchStanYaoRecords.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const CATALOG_FILE = resolve(root, 'src/catalog/catalog.generated.json')
const OUT_FILE = resolve(root, 'src/catalog/sources/stanyao-raw-records.json')
const SUMMARY_OUT_FILE = resolve(root, 'src/catalog/sources/stanyao-combo-summary.json')

const SITE_URL = 'https://stan-yao.github.io/beyblade_x_tier/'
const SHEET_URL =
  'https://docs.google.com/spreadsheets/d/18eTJLjyNmqDz5MH0-VD03TX4wobUCdHdrRMyo4uojDo/gviz/tq?tqx=out:csv&sheet=Raw%20Records'

const RANK_BY_LABEL = { '1st': 1, '2nd': 2, '3rd': 3 }

/** Google Sheets 的 gviz CSV 匯出：標準雙引號逐欄格式，欄位內雙引號用 "" 跳脫。 */
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (char === '"') {
        inQuotes = false
      } else {
        field += char
      }
      continue
    }
    if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
    } else {
      field += char
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  const header = rows[0]
  return rows.slice(1).map((cols) => Object.fromEntries(header.map((key, index) => [key, cols[index] ?? ''])))
}

const catalog = JSON.parse(readFileSync(CATALOG_FILE, 'utf8'))
const bladeByZhName = new Map(
  catalog.parts
    .filter((part) => ['blade', 'integrated_blade', 'main_blade'].includes(part.family))
    .map((part) => [part.naming.primaryZhTW, part.id]),
)
const ratchetByCode = new Map(catalog.parts.filter((part) => part.family === 'ratchet').map((part) => [part.code, part.id]))
const bitByCode = new Map(catalog.parts.filter((part) => part.family === 'bit').map((part) => [part.code, part.id]))
const codeById = new Map(catalog.parts.map((part) => [part.id, part.code]))

/**
 * stan-yao 在零件名後面加旋向／顏色／型態註記（例如「蒼穹龍騎士(左)」
 * 「飛龍旋翼(綠)」），我們圖鑑目前這些變體都收在同一個不帶註記的基礎零件底下。
 * 剝掉結尾括號註記再試一次比對——跟 `fetchHubTournaments.mjs` 剝顏色前綴是
 * 同一個既有慣例，只是這裡是結尾括號、不是開頭顏色字。
 */
const TRAILING_ANNOTATION = /[（(][^）)]*[）)]$/u

function resolveBladeId(name) {
  const exact = bladeByZhName.get(name)
  if (exact) return { bladeId: exact, matchMethod: 'exact' }
  const stripped = name.replace(TRAILING_ANNOTATION, '').trim()
  if (stripped !== name) {
    const fallback = bladeByZhName.get(stripped)
    if (fallback) return { bladeId: fallback, matchMethod: 'stripped_trailing_annotation' }
  }
  return { bladeId: undefined, matchMethod: undefined }
}

const response = await fetch(SHEET_URL)
if (!response.ok) throw new Error(`Raw Records 匯出回應 ${response.status}`)
const rows = parseCsv(await response.text())

const records = []
const unresolved = []

for (const row of rows) {
  const rank = RANK_BY_LABEL[row.rank]
  const { bladeId, matchMethod } = resolveBladeId(row.site_blade_name)
  const ratchetId = ratchetByCode.get(row.ratchet)
  const bitId = bitByCode.get(row.bit)
  if (!bladeId || !ratchetId || !bitId) {
    unresolved.push({
      site_blade_name: row.site_blade_name,
      ratchet: row.ratchet,
      bit: row.bit,
      date: row.date,
      rank: row.rank,
      reason: !bladeId ? 'blade_not_found' : !ratchetId ? 'ratchet_not_found' : 'bit_not_found',
    })
    continue
  }
  records.push({
    date: row.date,
    // rank 只收 1st/2nd/3rd；4th 以下站方資料沒有細分名次，不強行歸類。
    ...(rank ? { rank } : {}),
    comboPartIds: [bladeId, ratchetId, bitId],
    // 這裡必須用圖鑑的官方代號（`part.code`，通常是日文片假名），跟
    // `src/domain/analysis.ts` 的 `comboFullCode()` 產生的字串格式一致，
    // 不能用站方原文的中文名——之前這裡直接塞中文名，導致這個 comboCode
    // 永遠對不上系統內部查表用的 key，社群證據實際上從沒生效過。
    comboCode: `${codeById.get(bladeId)} ${codeById.get(ratchetId)}${codeById.get(bitId)}`,
    bladeMatchMethod: matchMethod,
  })
}

writeFileSync(
  OUT_FILE,
  `${JSON.stringify(
    {
      source: 'stan-yao/beyblade_x_tier',
      sourceUrl: SITE_URL,
      sheetUrl: SHEET_URL,
      fetchedAt: new Date().toISOString().slice(0, 10),
      note:
        '逐筆賽事名次紀錄，來自公開 Google Sheet 的 Raw Records 分頁。' +
        '欄位裡的 kj_ 開頭原始資料顯示站方是從某個用英文命名的外部來源程式化比對進來的，' +
        '但具體是哪個外部來源尚未查證，一律標記為社群來源（community），' +
        '不宣稱官方或特定賽事主辦方認證。比對不到零件的紀錄列在 unresolved，不猜測湊數。' +
        '零件名比對失敗時會再剝掉結尾括號註記（旋向／顏色／型態，例如「(左)」「(綠)」）重試一次，' +
        '這種比對記在 records[].bladeMatchMethod: "stripped_trailing_annotation"，' +
        '不是原文完全一致，供之後要不要信任這批比對結果時參考。',
      records,
      unresolved,
    },
    null,
    2,
  )}\n`,
  'utf8',
)

const summaryByCode = new Map()
for (const record of records) {
  const row = summaryByCode.get(record.comboCode) ?? { appearances: 0, top4: 0, championships: 0 }
  row.appearances += 1
  if (record.rank !== undefined && record.rank <= 3) row.top4 += 1
  if (record.rank === 1) row.championships += 1
  summaryByCode.set(record.comboCode, row)
}
const comboSummary = [...summaryByCode].map(([comboCode, row]) => ({ comboCode, ...row }))

writeFileSync(
  SUMMARY_OUT_FILE,
  `${JSON.stringify(
    {
      source: 'stan-yao/beyblade_x_tier',
      sourceUrl: SITE_URL,
      fetchedAt: new Date().toISOString().slice(0, 10),
      note:
        `由 stanyao-raw-records.json 的 ${records.length} 筆逐場紀錄依 comboCode 聚合而成` +
        '（同一個 comboCode 的 appearances/top4/championships 加總），供 app 執行期直接使用，' +
        '不含逐場日期明細——要查逐場紀錄請看 stanyao-raw-records.json。',
      totalRecords: records.length,
      combos: comboSummary,
    },
    null,
    2,
  )}\n`,
  'utf8',
)

const strippedCount = records.filter((record) => record.bladeMatchMethod === 'stripped_trailing_annotation').length
console.log(
  `Raw Records 共 ${rows.length} 筆，比對成功 ${records.length} 筆` +
    `（其中 ${strippedCount} 筆靠剝括號註記救回），比對不到 ${unresolved.length} 筆，` +
    `聚合成 ${comboSummary.length} 個不重複配置`,
)
