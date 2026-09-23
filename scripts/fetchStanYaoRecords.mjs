/**
 * 從 stan-yao 的「台灣天梯情報站」抓逐筆賽事名次紀錄，
 * 輸出 src/catalog/sources/stanyao-raw-records.json。
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
    comboCode: `${row.site_blade_name} ${row.ratchet}${row.bit}`,
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

const strippedCount = records.filter((record) => record.bladeMatchMethod === 'stripped_trailing_annotation').length
console.log(
  `Raw Records 共 ${rows.length} 筆，比對成功 ${records.length} 筆` +
    `（其中 ${strippedCount} 筆靠剝括號註記救回），比對不到 ${unresolved.length} 筆`,
)
