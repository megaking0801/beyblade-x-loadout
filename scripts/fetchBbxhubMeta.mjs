/**
 * 從 BBXHub（bbxhub.net）抓零件層級的 WBO 賽事統計，
 * 輸出 src/catalog/sources/bbxhub-meta.json。
 *
 * 規格對照：第 21 節（賽事統計與樣本限制）、第 41 節（來源與驗證）、第 1.5 節（不得編造）。
 *
 * 為什麼需要這一份：BBXHub 明確標示資料來源是 WBO（World Beyblade Organization）
 * 全球賽事，方法論公開（名次加權），規模比現有資料大很多（單一零件即有數千筆
 * 追蹤名次），且跟 `stanyao-raw-records.json` 各自獨立算出的排名前段零件一致
 * （交叉驗證過，見 HANDOFF），可信度比只有單一模糊來源的資料高。
 *
 * 誠實界線：這輪只抓零件層級（Tier／名次分布／追蹤總筆數），不抓逐配置的固鎖／
 * 軸心組合明細——BBXHub 頁面上的軸心用的是全名（例如「Hexa」）不是我們圖鑑的
 * 代號（「H」），沒有查證過的對照表不能硬猜，之後有需要再另外查證補上。
 * 零件名稱比對：BBXHub 用英文名（例如 WizardRod），我們圖鑑的英文名欄位
 * （`naming.nameEn`）目前只填了少數零件，直接比對成功率很低；改用
 * `stanyao-raw-records.json` 的來源 Google Sheet 裡已經驗證過、零衝突的
 * 「英文名→中文名」對照（101 筆），再查中文名對回圖鑑——不是憑空編對照表，
 * 是重用已經驗證過的既有比對結果。橋接出來的中文名一樣可能帶旋向／顏色／型態
 * 括號註記，比對失敗時剝掉結尾括號再試一次（跟 `fetchStanYaoRecords.mjs`
 * 同一個既有慣例）。目前 167 個追蹤零件裡約 45 個能比對成功，其餘大多是
 * 橋接表（只有 101 筆）本身沒收錄的冷門／新品零件，不是比對邏輯的問題。
 *
 * 用法：node scripts/fetchBbxhubMeta.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const CATALOG_FILE = resolve(root, 'src/catalog/catalog.generated.json')
const OUT_FILE = resolve(root, 'src/catalog/sources/bbxhub-meta.json')

const TIER_LIST_URL = 'https://bbxhub.net/tier-list'
const BRIDGE_SHEET_URL =
  'https://docs.google.com/spreadsheets/d/18eTJLjyNmqDz5MH0-VD03TX4wobUCdHdrRMyo4uojDo/gviz/tq?tqx=out:csv&sheet=Raw%20Records'

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

/** 英文名 → 中文名，來自 stan-yao Raw Records 裡已經驗證、零衝突的對照。 */
async function buildEnToZhBridge() {
  const response = await fetch(BRIDGE_SHEET_URL)
  if (!response.ok) throw new Error(`橋接用的 Raw Records 匯出回應 ${response.status}`)
  const rows = parseCsv(await response.text())
  const bridge = new Map()
  for (const row of rows) {
    const en = row.kj_blade_en_original
    const zh = row.site_blade_name
    if (en && zh) bridge.set(en, zh)
  }
  return bridge
}

function textField(html, label) {
  const pattern = new RegExp(
    `>${label}</p><p class="text-sm font-semibold text-ink">([^<]+)</p>`,
    'u',
  )
  return pattern.exec(html)?.[1]
}

function parseTier(html) {
  const match = /Tier<\/p><div class="flex items-center gap-2"><span[^>]*>([A-Z+]+)<\/span>/u.exec(html)
  return match?.[1]
}

function parsePlacements(text) {
  if (!text) return undefined
  const result = {}
  for (const match of text.matchAll(/([\d,]+)×\s*(1st|2nd|3rd|4th\+)/gu)) {
    const count = Number(match[1].replace(/,/gu, ''))
    const key = { '1st': 'first', '2nd': 'second', '3rd': 'third', '4th+': 'fourthPlus' }[match[2]]
    result[key] = count
  }
  return result
}

const catalog = JSON.parse(readFileSync(CATALOG_FILE, 'utf8'))
const bladeByZhName = new Map(
  catalog.parts
    .filter((part) => ['blade', 'integrated_blade', 'main_blade'].includes(part.family))
    .map((part) => [part.naming.primaryZhTW, part.id]),
)

/**
 * 橋接表裡的中文名可能帶旋向／顏色／型態括號註記（例如「蒼穹龍騎士(左)」），
 * 跟 `fetchStanYaoRecords.mjs` 同一個既有慣例：剝掉結尾括號再試一次。
 */
function resolveBladeId(zhName) {
  const exact = bladeByZhName.get(zhName)
  if (exact) return exact
  const stripped = zhName.replace(/[（(][^）)]*[）)]$/u, '').trim()
  return stripped !== zhName ? bladeByZhName.get(stripped) : undefined
}

const enToZh = await buildEnToZhBridge()

const listResponse = await fetch(TIER_LIST_URL)
if (!listResponse.ok) throw new Error(`天梯列表頁回應 ${listResponse.status}`)
const listHtml = await listResponse.text()
const entries = [
  ...listHtml.matchAll(/\{"@type":"ListItem","position":(\d+),"name":"([^"]+)","url":"([^"]+)"\}/gu),
].map((match) => ({ position: Number(match[1]), nameEn: match[2], url: match[3] }))

const parts = []
const unresolved = []

for (const entry of entries) {
  const zhName = enToZh.get(entry.nameEn)
  const partId = zhName ? resolveBladeId(zhName) : undefined
  if (!partId) {
    unresolved.push({ nameEn: entry.nameEn, zhNameFromBridge: zhName, reason: zhName ? 'blade_not_found' : 'no_bridge_entry' })
    continue
  }

  const pageResponse = await fetch(entry.url)
  if (!pageResponse.ok) {
    unresolved.push({ nameEn: entry.nameEn, reason: `page_fetch_failed_${pageResponse.status}` })
    continue
  }
  const pageHtml = await pageResponse.text()
  const tier = parseTier(pageHtml)
  const placementsText = textField(pageHtml, 'Placements')
  parts.push({
    partId,
    nameEn: entry.nameEn,
    metaRank: entry.position,
    tier,
    type: textField(pageHtml, 'Type'),
    tournamentWins: Number((textField(pageHtml, 'Tournament wins') ?? '').replace(/,/gu, '')) || undefined,
    placements: parsePlacements(placementsText),
    sourceUrl: entry.url,
  })
}

writeFileSync(
  OUT_FILE,
  `${JSON.stringify(
    {
      source: 'BBXHub',
      sourceUrl: TIER_LIST_URL,
      fetchedAt: new Date().toISOString().slice(0, 10),
      note:
        '零件層級的 WBO 全球賽事統計，站方公開方法論（名次加權排名，每週自動更新）。' +
        '這輪只收零件層級（Tier／名次分布／追蹤總筆數），不含逐配置的固鎖／軸心明細' +
        '（BBXHub 頁面用全名如「Hexa」標軸心，跟圖鑑代號「H」的對照尚未查證，不猜）。' +
        '一律標記為社群來源（community），不宣稱官方認證。',
      parts,
      unresolved,
    },
    null,
    2,
  )}\n`,
  'utf8',
)

console.log(`天梯列表 ${entries.length} 個零件，比對並抓取成功 ${parts.length} 個，失敗 ${unresolved.length} 個`)
