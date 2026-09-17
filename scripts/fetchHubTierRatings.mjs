/**
 * 從 BeybladeHub 的推薦配置頁擷取「高手零件評級」聚合表，
 * 輸出 src/catalog/sources/beybladehub-tier-ratings.json。
 *
 * 規格對照：第 20 節 C（賽事／社群證據）、第 21 節（樣本限制）、第 41 節（來源與驗證）。
 *
 * 為什麼需要這一份：本站的六軸評估是模型推估，只能說「這套配置的結構偏向什麼」，
 * 說不出「賽場上現在到底好不好用」。BeybladeHub 把 5 位台／日高手的 T 表聚合成
 * 逐件評級，而且每一筆都附「幾位高手評為這一級」，等於自帶樣本數，
 * 可以當作獨立於模型之外的第二個判斷依據。
 *
 * 誠實界線：這是社群主觀評級，不是賽事勝率統計，也不是官方資料。
 * 前台必須標明來源與共識人數，不可與模型推估混為一談（第 20 節 D）。
 *
 * 用法：node scripts/fetchHubTierRatings.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const CATALOG_FILE = resolve(root, 'src/catalog/catalog.generated.json')
const OUT_FILE = resolve(root, 'src/catalog/sources/beybladehub-tier-ratings.json')

const PAGE_URL = 'https://beybladehub.app/combos'

const catalog = JSON.parse(readFileSync(CATALOG_FILE, 'utf8'))

/** 區塊標題 → 這一區的零件族群。上蓋區也可能出現合併的 CX 上蓋。 */
const SECTIONS = [
  { heading: '上蓋 Blade', families: ['blade', 'integrated_blade', 'main_blade'] },
  { heading: '固鎖 Ratchet', families: ['ratchet'] },
  { heading: '軸心 Bit', families: ['bit'] },
]

function indexFor(families) {
  const byName = new Map()
  const byCode = new Map()
  for (const part of catalog.parts) {
    if (!families.includes(part.family)) continue
    byName.set(part.naming.primaryZhTW, part.id)
    byCode.set(part.code, part.id)
  }
  return { byName, byCode }
}

const response = await fetch(PAGE_URL, {
  headers: { 'user-agent': 'beyblade-x-loadout/catalog-builder' },
})
if (!response.ok) throw new Error(`推薦配置頁回應 ${response.status}`)
const html = await response.text()

const expertCount = Number(
  /高手零件評級速查<\/h2><span[^>]*>(\d+)<!-- --> 位高手評級/u.exec(html)?.[1] ?? 0,
)
const expertsZhTW = /自動聚合 X～S 級零件。<span[^>]*>by <!-- -->([^<]+)</u
  .exec(html)?.[1]
  ?.split('、')
  .map((name) => name.trim())
  .filter(Boolean)

const ratings = []
const unresolved = []

for (const [sectionIndex, section] of SECTIONS.entries()) {
  // 標題前的 `<!-- -->` 是 React 的文字節點分隔，軸心那一段剛好沒有，不能寫死。
  const headingAt = (heading, from = 0) => html.indexOf(`${heading}</h3>`, from)
  const start = headingAt(section.heading)
  if (start < 0) continue
  const nextHeading = SECTIONS[sectionIndex + 1]
  const end = nextHeading ? headingAt(nextHeading.heading, start) : html.indexOf('</section>', start)
  const block = html.slice(start, end > start ? end : undefined)

  const { byName, byCode } = indexFor(section.families)
  const chips = [
    ...block.matchAll(
      /title="(\d+)\/(\d+) 位高手評為 ([^"]+?) 級"[^>]*>(?:<span[^>]*>([^<]+)<\/span>)([^<]+)</gu,
    ),
  ]
  for (const chip of chips) {
    const [, agree, total, tierFromTitle, tierLabel, label] = chip
    const name = label.trim()
    const partId = byName.get(name) ?? byCode.get(name)
    if (!partId) {
      unresolved.push({ section: section.heading, label: name, tierLabel: tierLabel.trim() })
      continue
    }
    ratings.push({
      partId,
      labelZhTW: name,
      tierLabel: (tierLabel || tierFromTitle).trim(),
      agreeCount: Number(agree),
      expertCount: Number(total),
    })
  }
}

writeFileSync(
  OUT_FILE,
  `${JSON.stringify(
    {
      source: 'BeybladeHub',
      sourceUrl: PAGE_URL,
      fetchedAt: new Date().toISOString().slice(0, 10),
      note: '台灣／日本高手 T 表的聚合評級，屬社群主觀意見，不是賽事勝率統計也不是官方資料。每筆附共識人數。',
      ...(expertCount ? { expertCount } : {}),
      ...(expertsZhTW?.length ? { expertsZhTW } : {}),
      ratings,
      unresolved,
    },
    null,
    2,
  )}\n`,
  'utf8',
)

console.log(`高手評級 ${ratings.length} 筆（${expertCount} 位高手），對不到圖鑑 ${unresolved.length} 筆`)
