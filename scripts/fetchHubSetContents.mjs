/**
 * 從 BeybladeHub 的商品頁擷取套裝內容物，輸出 src/catalog/sources/beybladehub-sets.json。
 *
 * 規格對照：第 8 節（商品內容）、第 41 節（來源與驗證）、第 1.5 節（不得編造內容）。
 *
 * 為什麼需要這一份：官方一覽頁只列商品名，套裝（起跑包、對戰入門套組、改造組）
 * 的內含陀螺沒有公布，所以這些商品在圖鑑裡內容是空的，登記一盒也不會進任何零件。
 * BeybladeHub 的商品頁有指向零件的錨點連結，可以據此還原內容。
 * 這是社群整理的資料，不是官方公布，因此標 community_only。
 *
 * 只在三種槽位（上蓋類、固鎖、軸心）都解析得出來時才輸出；缺一不可，
 * 寧可留空也不寫半套（第 1.5 節）。
 *
 * 用法：node scripts/fetchHubSetContents.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const CATALOG_FILE = resolve(root, 'src/catalog/catalog.generated.json')
const STATS_FILE = resolve(root, 'src/catalog/sources/beybladehub-stats.json')
const OUT_FILE = resolve(root, 'src/catalog/sources/beybladehub-sets.json')

const ORIGIN = 'https://beybladehub.app'

const catalog = JSON.parse(readFileSync(CATALOG_FILE, 'utf8'))
const stats = JSON.parse(readFileSync(STATS_FILE, 'utf8'))

/** 上蓋在本專案以日文名當 code，BeybladeHub 用短鍵，靠 stats 檔的日文名接起來。 */
const bladeCodeByHubKey = new Map(
  stats.parts.filter((row) => row.family === 'blade' && row.nameJa).map((row) => [row.key, row.nameJa]),
)
const partIds = new Set(catalog.parts.map((part) => part.id))

/** 第 4 節：發射器、對戰盤、握把、收納盒這些本來就不含可配裝零件。 */
const NO_PARTS_CATEGORIES = new Set(['tool', 'accessory'])

/**
 * 只補內容目前是空的商品，已經有官方說明書佐證的不覆蓋。
 *
 * 排除兩類：
 *  - 隨機補充包：商品頁上的零件連結是「可能抽到的池」，不是盒內固定內容，
 *    照抄會變成憑空宣告開到什麼（第 13、1.5 節）。
 *  - 配件類：本來就不含零件，BeybladeHub 也沒有這些商品頁，
 *    以前會白抓 29 次 404，讓 skipped 看起來像資料缺漏。
 */
const targets = catalog.products.filter(
  (product) =>
    product.contents.length === 0 &&
    product.sku &&
    !product.isRandom &&
    !NO_PARTS_CATEGORIES.has(product.category),
)

function resolveAnchor(anchor) {
  const ratchet = /^ratchet-(.+)$/u.exec(anchor)
  if (ratchet) return { slot: 'ratchet', id: `ratchet:${ratchet[1]}` }

  const bit = /^bit-(.+)$/u.exec(anchor)
  if (bit) return { slot: 'bit', id: `bit:${bit[1]}` }

  const assist = /^blade-cx-assist-(.+)$/u.exec(anchor)
  if (assist) return { slot: 'assist', id: `assist_blade:${assist[1]}` }

  // 超越戰刃在本專案是獨立零件（四件式 CX 才有），可以直接對應。
  const over = /^blade-cx-over-(.+)$/u.exec(anchor)
  if (over) return { slot: 'over', id: `over_blade:${over[1]}` }

  // CX 的鎖定紋章與金屬主刃在本專案是合併成一顆 main_blade，
  // 無法從單一錨點還原，交給呼叫端用商品名稱另行判斷。
  if (/^blade-cx-/u.test(anchor)) return { slot: 'cxPiece', id: undefined }

  const blade = /^blade-(.+)$/u.exec(anchor)
  if (blade) {
    const code = bladeCodeByHubKey.get(blade[1])
    return { slot: 'blade', id: code ? `blade:${code}` : undefined }
  }
  return undefined
}

/** BeybladeHub 卡片上的中文名，用來把 CX 的紋章與主刃拼回本專案的合併件名稱。 */
const zhByHubKey = new Map(stats.parts.map((row) => [row.key, row.zhTW]))
function zhOf(anchor) {
  return zhByHubKey.get(anchor.replace(/^blade-/u, '')) ?? ''
}

const results = []
const skipped = []

for (const product of targets) {
  const url = `${ORIGIN}/parts/combos/${product.sku}`
  let html
  try {
    const response = await fetch(url, { headers: { 'user-agent': 'beyblade-x-loadout/catalog-builder' } })
    if (!response.ok) {
      skipped.push({ id: product.id, sku: product.sku, reason: `商品頁回應 ${response.status}` })
      continue
    }
    html = await response.text()
  } catch (error) {
    skipped.push({ id: product.id, sku: product.sku, reason: `商品頁抓取失敗：${String(error)}` })
    continue
  }

  const anchors = [...new Set([...html.matchAll(/href="\/parts\/[a-z]+#([A-Za-z0-9_-]+)"/gu)].map((m) => m[1]))]
  const slots = { blade: [], ratchet: [], bit: [], assist: [], over: [], cxPiece: [] }
  let unknown = false
  for (const anchor of anchors) {
    const hit = resolveAnchor(anchor)
    if (!hit) continue
    if (!hit.id) {
      if (hit.slot === 'cxPiece') slots.cxPiece.push(anchor)
      else unknown = true
      continue
    }
    if (!partIds.has(hit.id)) {
      unknown = true
      continue
    }
    slots[hit.slot].push(hit.id)
  }

  // CX 商品的上蓋在本專案是合併件（鎖定紋章 + 主刃），用「紋章名 + 主刃名」去比對。
  if (slots.cxPiece.length > 0) {
    const chips = slots.cxPiece.filter((key) => key.startsWith('blade-cx-chip-'))
    // 超越戰刃已經在 resolveAnchor 單獨對應，不能再算進合併主刃的組名。
    const mains = slots.cxPiece.filter((key) => /^blade-cx-(main|metal)-/u.test(key))
    for (const chip of chips) {
      for (const main of mains) {
        const compound = `${zhOf(chip)}${zhOf(main)}`
        const fused = catalog.parts.find(
          (part) => part.family === 'main_blade' && part.naming.primaryZhTW === compound,
        )
        if (fused && !slots.blade.includes(fused.id)) slots.blade.push(fused.id)
      }
    }
  }

  // 內容物是一份零件清單，不需要還原「哪顆配哪顆」，但每個槽位都要有東西，
  // 且固鎖與軸心數量要對得起來，否則表示這一頁列的不是盒內固定內容。
  // 四件式 CX 的主刃還要再一片超越戰刃，少了就不算完整，寧可略過也不要少列零件。
  const needsOverBlade = slots.blade.some((id) => {
    const part = catalog.parts.find((row) => row.id === id)
    return part?.cxOverBlade === true
  })
  const complete =
    slots.blade.length >= 1 &&
    slots.ratchet.length >= 1 &&
    slots.ratchet.length === slots.bit.length &&
    (!needsOverBlade || slots.over.length >= 1) &&
    !unknown
  if (!complete) {
    skipped.push({
      id: product.id,
      sku: product.sku,
      reason: needsOverBlade && slots.over.length === 0
        ? '四件式 CX 的商品頁沒有列出超越戰刃'
        : '商品頁的零件連結無法完整對應到三個槽位',
      anchors,
    })
    continue
  }

  results.push({
    id: product.id,
    sku: product.sku,
    sourceUrl: url,
    partIds: [...slots.blade, ...slots.over, ...slots.assist, ...slots.ratchet, ...slots.bit],
  })
}

/*
 * 只抓「目前內容為空」的商品，所以上一輪補齊的商品這一輪不會是 target。
 * 如果直接覆寫輸出檔，那些成果會被自己抹掉，下次重建圖鑑就又變成內容未知。
 * 因此與既有檔案合併：同一個 id 以這一輪的新結果為準，沒有重抓的沿用舊的。
 */
let previousSets = []
try {
  previousSets = JSON.parse(readFileSync(OUT_FILE, 'utf8')).sets ?? []
} catch {
  previousSets = []
}
const freshIds = new Set(results.map((row) => row.id))
const carriedOver = previousSets.filter((row) => !freshIds.has(row.id))
const mergedSets = [...results, ...carriedOver].sort((a, b) => a.id.localeCompare(b.id))

writeFileSync(
  OUT_FILE,
  `${JSON.stringify(
    {
      source: 'BeybladeHub',
      fetchedAt: new Date().toISOString().slice(0, 10),
      note: '社群整理的套裝內容，非 Takara Tomy 官方公布；前台需標示為社群來源。',
      sets: mergedSets,
      skipped,
    },
    null,
    2,
  )}\n`,
  'utf8',
)
console.log(
  `這一輪補齊 ${results.length} 筆、沿用既有 ${carriedOver.length} 筆，` +
    `合計 ${mergedSets.length} 筆；仍無法判定 ${skipped.length} 筆`,
)
