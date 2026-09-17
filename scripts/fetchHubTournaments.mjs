/**
 * 從 BeybladeHub 的賽事紀錄頁擷取台灣賽事的名次配置，
 * 輸出 src/catalog/sources/beybladehub-tournaments.json。
 *
 * 規格對照：第 21 節（賽事統計與樣本限制）、第 41 節（來源與驗證）、第 1.5 節（不得編造）。
 *
 * 為什麼需要這一份：原本的賽事資料多半來自 beywatch.gg 的國外賽事，
 * 對台灣玩家的參考價值有限。BeybladeHub 收錄的是台灣 G1／G2／G3 與店家賽的
 * 冠亞季殿實際配置，才是本地賽場的 meta。
 *
 * 誠實界線：這是社群整理的回報資料（有些配置註明「由選手本人提供」或
 * 「現場玩家回報」），不是主辦單位的官方成績冊，一律標 community。
 * 解析不出零件的配置不丟掉也不猜，原文留在 unresolved 裡供人工核對。
 *
 * 用法：node scripts/fetchHubTournaments.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const CATALOG_FILE = resolve(root, 'src/catalog/catalog.generated.json')
const OUT_FILE = resolve(root, 'src/catalog/sources/beybladehub-tournaments.json')

const PAGE_URL = 'https://beybladehub.app/tournaments'

const catalog = JSON.parse(readFileSync(CATALOG_FILE, 'utf8'))

const PLACEMENT_BY_ZH = { 冠軍: 1, 亞軍: 2, 季軍: 3, 殿軍: 4 }

/**
 * 中文名 → 零件 id。
 *
 * 長名優先：「鮫鯊狂鱗」與「鮫鯊鋒鰭」共用前兩字，短名先比對會切錯。
 * 顏色前綴（紅空力天馬）不是另一顆零件，比對前先剝掉。
 */
function buildNameIndex(families) {
  const rows = catalog.parts
    .filter((part) => families.includes(part.family))
    .map((part) => ({ name: part.naming.primaryZhTW, id: part.id }))
    .sort((a, b) => b.name.length - a.name.length)
  return rows
}

const BLADE_NAMES = buildNameIndex(['blade', 'integrated_blade', 'main_blade'])
const LOCK_CHIP_NAMES = buildNameIndex(['lock_chip'])
const MAIN_BLADE_NAMES = buildNameIndex(['main_blade'])
const RATCHET_BY_CODE = new Map(
  catalog.parts.filter((part) => part.family === 'ratchet').map((part) => [part.code, part.id]),
)
const BIT_BY_CODE = new Map(
  catalog.parts.filter((part) => part.family === 'bit').map((part) => [part.code, part.id]),
)
const ASSIST_BY_CODE = new Map(
  catalog.parts.filter((part) => part.family === 'assist_blade').map((part) => [part.code, part.id]),
)
const OVER_BY_CODE = new Map(
  catalog.parts.filter((part) => part.family === 'over_blade').map((part) => [part.code, part.id]),
)

const COLOR_PREFIX = /^(紅|藍|黑|白|金|銀|綠|黃|橙|紫|透明)/u

function matchLongestName(text, index) {
  for (const row of index) {
    if (text.startsWith(row.name)) return { id: row.id, rest: text.slice(row.name.length).trim() }
  }
  return undefined
}

/**
 * 把一行配置文字拆成零件 id。
 *
 * 賽事頁的寫法是「上蓋名 [輔助/超越字母] [固鎖] 軸心」，空白不保證存在，例如：
 *   「鮫鯊狂鱗 7-60 R」「榮耀戰神 K」（固鎖一體型，沒有固鎖段）
 *   「戰神爆擊 W 9-60 H」（CX：鎖定紋章＋主刃＋輔助戰刃）
 */
function parseCombo(rawText) {
  const text = rawText.replace(/\s+/gu, ' ').trim()
  const stripped = text.replace(COLOR_PREFIX, '')

  // 先試整顆上蓋名（BX／UX／合併的 CX）
  let head = matchLongestName(stripped, BLADE_NAMES)
  const parts = []
  if (head) {
    parts.push(head.id)
  } else {
    // 再試 CX 的「鎖定紋章 + 主刃」寫法
    const chip = matchLongestName(stripped, LOCK_CHIP_NAMES)
    if (!chip) return undefined
    const main = matchLongestName(chip.rest, MAIN_BLADE_NAMES)
    if (!main) return undefined
    parts.push(chip.id, main.id)
    head = main
  }

  const tokens = head.rest.split(' ').filter(Boolean)
  for (const token of tokens) {
    if (RATCHET_BY_CODE.has(token)) {
      parts.push(RATCHET_BY_CODE.get(token))
      continue
    }
    if (BIT_BY_CODE.has(token)) {
      parts.push(BIT_BY_CODE.get(token))
      continue
    }
    if (OVER_BY_CODE.has(token)) {
      parts.push(OVER_BY_CODE.get(token))
      continue
    }
    if (ASSIST_BY_CODE.has(token)) {
      parts.push(ASSIST_BY_CODE.get(token))
      continue
    }
    // 兩個字母黏在一起時是「超越 + 輔助」
    if (token.length === 2 && OVER_BY_CODE.has(token[0]) && ASSIST_BY_CODE.has(token[1])) {
      parts.push(OVER_BY_CODE.get(token[0]), ASSIST_BY_CODE.get(token[1]))
      continue
    }
    return undefined
  }

  // 一顆陀螺至少要有上蓋與軸心才算解析成功
  const hasBit = parts.some((id) => id.startsWith('bit:'))
  return hasBit ? parts : undefined
}

const response = await fetch(PAGE_URL, {
  headers: { 'user-agent': 'beyblade-x-loadout/catalog-builder' },
})
if (!response.ok) throw new Error(`賽事頁回應 ${response.status}`)
const html = await response.text()

/** 每張賽事卡片以 <h3> 開頭，切開之後各自解析。 */
const cards = html.split(/<h3 class="text-base font-bold text-white">/u).slice(1)

const events = []
const unresolved = []

for (const card of cards) {
  const name = /^([^<]+)</u.exec(card)?.[1]?.trim()
  const date = /(20\d\d)\/(\d\d)\/(\d\d)/u.exec(card)
  if (!name || !date) continue
  const division = /rounded border border-violet-500\/30[^>]*>([^<]+)</u.exec(card)?.[1]?.trim()
  const entrants = /<span class="text-sm text-gray-400">(\d+)<!-- --> 人/u.exec(card)?.[1]

  // 下一張卡片之前的內容才屬於這一場
  const block = card.split('<h3 class="text-base font-bold text-white">')[0]
  const decks = []
  const placementBlocks = block.split(/font-bold bg-(?=yellow|gray|amber|orange|sky|zinc)/u).slice(1)
  for (const slice of placementBlocks) {
    const placementZh = /^[^>]*>(冠軍|亞軍|季軍|殿軍)</u.exec(slice)?.[1]
    if (!placementZh) continue
    const listHtml = slice.split('</ul>')[0]
    const combos = [...listHtml.matchAll(/<span translate="no" class="font-mono">([^<]+)</gu)].map(
      (match) => match[1].trim(),
    )
    if (combos.length === 0) continue

    const comboPartIds = []
    let allParsed = true
    for (const combo of combos) {
      const ids = parseCombo(combo)
      if (!ids) {
        allParsed = false
        unresolved.push({ event: name, date: date[0], placement: placementZh, combo })
        continue
      }
      comboPartIds.push(ids)
    }
    decks.push({
      placement: PLACEMENT_BY_ZH[placementZh],
      placementZhTW: placementZh,
      reportedCombos: combos,
      comboPartIds,
      complete: allParsed && comboPartIds.length === combos.length,
    })
  }

  if (decks.length === 0) continue
  events.push({
    id: `beybladehub-${date[0].replace(/\//gu, '')}-${events.length + 1}`,
    nameZhTW: name,
    ...(division ? { divisionZhTW: division } : {}),
    date: `${date[1]}-${date[2]}-${date[3]}`,
    ...(entrants ? { entrants: Number(entrants) } : {}),
    sourceUrl: PAGE_URL,
    decks,
  })
}

writeFileSync(
  OUT_FILE,
  `${JSON.stringify(
    {
      source: 'BeybladeHub',
      sourceUrl: PAGE_URL,
      fetchedAt: new Date().toISOString().slice(0, 10),
      note: '台灣賽事的名次配置，來自社群回報整理（部分註明由選手本人提供），非主辦單位官方成績冊，一律標 community。',
      events,
      unresolved,
    },
    null,
    2,
  )}\n`,
  'utf8',
)

const deckCount = events.reduce((sum, event) => sum + event.decks.length, 0)
console.log(`賽事 ${events.length} 場、名次 ${deckCount} 筆，配置解析不出 ${unresolved.length} 筆`)
