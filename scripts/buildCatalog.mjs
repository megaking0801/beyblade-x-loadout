/**
 * 由官方商品一覽產生 Master Catalog。
 *
 * 規格對照：第 4 節（收錄範圍）、第 5 節（命名規則）、第 7、8、9 節（資料模型）、
 * 第 24 節（初版 Seed Data）、第 41 節（來源與驗證）、第 42 節（Catalog Audit）。
 *
 * 原則：
 *  - 商品身分（型號、日文名、分類、發售日）來自官方頁面，標 official_verified。
 *  - 零件組成由官方商品名稱解析而得（商品名本身就是官方資料），解析成功才標 official_verified。
 *  - 解析不出來的（隨機強化組內容、套裝內容、少數特殊命名）一律 needs_review，內容留空，
 *    絕對不推測（第 1.5 節）。
 *  - 零件的類型／重量／旋向／軸心特性官方未公布，一律留空，不補值。
 *  - 台灣官方中文名稱尚未取得，所有中文名標記為暫譯（第 5 節）。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { translate, CONFIRMED_JA } from './zhTwTokens.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const SOURCE_FILE = resolve(root, 'src/catalog/sources/takaratomy-lineup.psv')
const OUT_FILE = resolve(root, 'src/catalog/catalog.generated.json')
const AUDIT_FILE = resolve(root, 'src/catalog/catalog-audit.json')
const IMAGES_FILE = resolve(root, 'src/catalog/images.generated.json')
const TOURNAMENT_FILE = resolve(root, 'src/catalog/sources/tournament-curated.json')
const HUB_STATS_FILE = resolve(root, 'src/catalog/sources/beybladehub-stats.json')
const HUB_SETS_FILE = resolve(root, 'src/catalog/sources/beybladehub-sets.json')

const LINEUP_URL = 'https://beyblade.takaratomy.co.jp/beyblade-x/lineup/'
const SITE_ORIGIN = 'https://beyblade.takaratomy.co.jp'
const FETCHED_AT = '2026-09-16'
const CATALOG_VERSION = `takaratomy-lineup-${FETCHED_AT}`

const CATEGORY_BY_JA = {
  'スターター': 'starter',
  'ブースター': 'booster',
  'カラーチョイスブースター': 'booster',
  'ダブルスターター': 'starter',
  'ランダムブースター': 'random_booster',
  'ツール': 'tool',
}

/**
 * 官方產品一覽沒有逐一列出套裝內容時，僅使用官方說明書補齊。
 * 每項都保留可直接回查的 PDF；沒有說明書佐證的商品不可加進此表。
 */
const OFFICIAL_MANUAL_OVERRIDES = {
  bx07: {
    sourceUrl: 'https://beyblade.takaratomy.co.jp/beyblade-x/manual/BX-07_manual.pdf',
    beys: ['ドランソード3-60F'],
    accessories: [
      'ストリングランチャー ブルーVer.',
      'ランチャーグリップ ブルーVer.',
      'エクストリームスタジアム クリアVer.',
    ],
  },
  bx08: {
    sourceUrl: 'https://beyblade.takaratomy.co.jp/beyblade-x/manual/BX-08_manual.pdf',
    beys: ['ヘルズサイズ3-80B', 'ウィザードアロー4-60N', 'ナイトシールド4-80T'],
    accessories: [],
  },
  bx17: {
    sourceUrl: 'https://beyblade.takaratomy.co.jp/beyblade-x/manual/BX-17_manual.pdf',
    beys: ['ドランソード3-60F', 'ウィザードアロー4-80B'],
    accessories: [
      'エクストリームスタジアム ブラックVer.',
      'ワインダーランチャー レッドVer.',
      'ワインダーランチャー ブルーVer.',
    ],
  },
  bx20: {
    sourceUrl: 'https://beyblade.takaratomy.co.jp/beyblade-x/manual/BX-20_manual.pdf',
    beys: ['ドランダガー4-60R', 'シャークエッジ3-80F', 'ナイトシールド5-80T'],
    accessories: [],
  },
  bx21: {
    sourceUrl: 'https://beyblade.takaratomy.co.jp/beyblade-x/manual/BX-21_manual.pdf',
    beys: ['ヘルズチェイン5-60HT', 'ナイトランス3-60LF', 'ウィザードアロー4-80N'],
    accessories: [],
  },
  ux15: {
    sourceUrl: 'https://beyblade.takaratomy.co.jp/beyblade-x/manual/UX-15_manual.pdf',
    // UX-15 是跨 BX／UX／CX 三條產品線的套裝，不能用商品本身的 UX 標籤一概解析。
    beys: [
      { name: 'シャークスケイル4-50UF', line: 'UX' },
      { name: 'ティラノロア1-70L', line: 'BX' },
      { name: 'ヘルズブレイブJ3-60GF', line: 'CX' },
    ],
    accessories: ['CXツール'],
  },
  ux04: {
    sourceUrl: 'https://beyblade.takaratomy.co.jp/beyblade-x/manual/UX-04_manual.pdf',
    beys: ['ドランバスター1-60A', 'ウィザードロッド5-70DB'],
    accessories: [
      'エクストリームスタジアム ホワイト×オレンジ',
      'ワインダーランチャー ホワイト×ブラック',
      'ワインダーランチャー ブラック×イエロー',
    ],
  },
  ux07: {
    sourceUrl: 'https://beyblade.takaratomy.co.jp/beyblade-x/manual/UX-07_manual.pdf',
    beys: ['フェニックスラダー9-70G', 'ワイバーンゲイル2-60S', 'スフィンクスカウル1-80GF'],
    accessories: [],
  },
  ux10: {
    sourceUrl: 'https://beyblade.takaratomy.co.jp/beyblade-x/manual/UX-10_manual.pdf',
    beys: [],
    // 此商品是散件客製組；說明書沒有宣告預組配裝，故逐項記錄而不虛構配裝關係。
    parts: [
      { family: 'blade', code: 'ナイトメイル', system: 'UX' },
      { family: 'blade', code: 'プテラスイング', system: 'UX' },
      { family: 'blade', code: 'ティラノビート', system: 'UX' },
      { family: 'blade', code: 'ヘルズハンマー', system: 'UX' },
      { family: 'ratchet', code: '3-85', system: 'BX', extra: { heightCode: 85 } },
      { family: 'ratchet', code: '7-70', system: 'BX', extra: { heightCode: 70 } },
      { family: 'ratchet', code: '1-60', system: 'BX', extra: { heightCode: 60 } },
      { family: 'bit', code: 'BS', system: 'BX' },
      { family: 'bit', code: 'RA', system: 'BX' },
      { family: 'bit', code: 'P', system: 'BX' },
      { family: 'bit', code: 'B', system: 'BX' },
      { family: 'bit', code: 'R', system: 'BX' },
      { family: 'bit', code: 'MN', system: 'BX' },
    ],
    accessories: [],
  },
}

/**
 * 固鎖代號的兩種官方寫法：
 *  - 數字-數字，例如 3-60、0-70
 *  - 英文字母-數字，例如 M-85
 */
const RATCHET = '(?:[A-Z]-\\d+|\\d+-\\d+)'
const BX_BEY = new RegExp(`^(?<blade>.+?)(?<ratchet>${RATCHET})(?<bit>[A-Za-z]+)$`)
const CX_BEY = new RegExp(
  `^(?<blade>.+?)(?<assist>[A-Z][A-Za-z]?)(?<ratchet>${RATCHET})(?<bit>[A-Za-z]+)$`,
)

/** 貼紙類周邊不含任何零件，對庫存與配裝沒有意義，不收進圖鑑。 */
const EXCLUDED_NAME_PATTERN = /ステッカー/u

function parseLines() {
  const text = readFileSync(SOURCE_FILE, 'utf8')
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const [sku, nameJa, categoryJa, dateJa, path] = line.split('|')
      return { sku, nameJa, categoryJa, dateJa, path }
    })
    .filter((row) => !EXCLUDED_NAME_PATTERN.test(row.nameJa))
}

function toIsoDate(dateJa) {
  const [y, m, d] = dateJa.split('.')
  if (!y || !m || !d) return undefined
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function productIdFromPath(path) {
  return path.split('/').pop().replace(/\.html$/, '')
}

function resolveCategory(row) {
  const mapped = CATEGORY_BY_JA[row.categoryJa]
  if (mapped) return mapped
  // 官方分類寫「セット」時，再依商品名細分（第 7 節分類）。
  if (row.nameJa.includes('ビットセット')) return 'part_set'
  if (row.nameJa.includes('デッキセット')) return 'deck_set'
  if (row.nameJa.includes('デッキケース')) return 'accessory'
  if (
    row.nameJa.includes('バトルエントリーセット') ||
    row.nameJa.includes('スタートダッシュセット') ||
    row.nameJa.includes('カスタマイズセット')
  ) {
    return 'entry_set'
  }
  if (row.nameJa.includes('スタジアム')) return 'tool'
  return 'battle_set'
}

function lineOf(sku) {
  const prefix = sku.slice(0, 2)
  return prefix === 'BX' || prefix === 'UX' || prefix === 'CX' ? prefix : 'OTHER'
}

/** 把「本體名 + 附註」拆開，例如「ヘルズサイズ4-60T メタルコート:ゴールド」。 */
function splitBeyAndSuffix(nameJa) {
  const spaceIndex = nameJa.indexOf(' ')
  if (spaceIndex < 0) return { head: nameJa, suffix: '' }
  return { head: nameJa.slice(0, spaceIndex), suffix: nameJa.slice(spaceIndex + 1) }
}

/**
 * 詞素翻完後的台灣語序修正（來源：BeybladeHub 的商品標題寫法）。
 *
 * 詞素表只能逐段直譯，但台灣的寫法會換語序：日文把「ランダムブースター」放前面、
 * 「メタルコート:色」放後面，台灣則寫成「王蛇鞭尾隨機強化組」「藍色金屬塗裝」。
 */
const ZH_TW_PHRASE_RULES = [
  // ランダムブースター ○○セレクト → ○○隨機強化組
  [/^隨機強化組 (.+?)精選$/u, '$1隨機強化組'],
  // ランダムブースターVol.1 → 隨機強化組 Vol.1
  [/^隨機強化組Vol\./u, '隨機強化組 Vol.'],
  // メタルコート:ブルー → 藍色金屬塗裝（單色補「色」，複合色如「黑×綠」不補）
  [/金屬塗層:([^\s]+)$/u, (_, color) => `${/[×]/u.test(color) ? color : `${color}色`}金屬塗裝`],
  // 聯名雙顆組：A/B → A vs B
  [/^(.*?[^\s]+)\/([^\s]+)$/u, '$1 vs $2'],
  // 套組的系列尾碼要空一格：戰鬥入門套組U → 戰鬥入門套組 U
  [/^(.*(?:套組|包))([A-Z∞])$/u, '$1 $2'],
]

function applyZhTwPhraseRules(name) {
  let result = name
  for (const [pattern, replacement] of ZH_TW_PHRASE_RULES) {
    result = result.replace(pattern, replacement)
  }
  return result
}

function makeNaming(nameJa, fallbackZhTW) {
  const { translated, untranslated } = translate(nameJa)
  const primaryZhTW =
    untranslated.length > 0 || translated.trim() === ''
      ? fallbackZhTW
      : applyZhTwPhraseRules(translated)
  return {
    naming: {
      primaryZhTW,
      nameJa,
      isProvisionalZhTW: !isConfirmedName(nameJa),
    },
    untranslated,
  }
}

/** BeybladeHub 已收錄的上蓋名稱不再標暫譯；商品名只要開頭是已收錄上蓋即視為確認。 */
function isConfirmedName(nameJa) {
  if (CONFIRMED_JA.has(nameJa)) return true
  for (const ja of CONFIRMED_JA) {
    if (nameJa.startsWith(ja)) return true
  }
  return false
}

const PART_FAMILY_LABEL = {
  blade: '上蓋',
  main_blade: '主刃',
  assist_blade: '輔助戰刃',
  ratchet: '固鎖',
  bit: '軸心',
}

/**
 * 把社群圖鑑的實測數值合併進零件。
 *
 * 官方商品頁不公布重量、類型、旋向與軸心特性，少了這些欄位，強度分析每一項
 * 都只能顯示「資料不足」。這裡補上 BeybladeHub 的玩家實測值，並且獨立記在
 * statsProvenance，標 community_only —— 零件身分仍然是官方來源，兩者不混為一談。
 */
function applyHubStats(parts, hubStats, audit) {
  const byFamilyKey = new Map()
  for (const row of hubStats.parts) {
    // 上蓋在本專案的 code 就是日文名，所以用日文名當索引；固鎖與軸心的 key 本身就是型號。
    const lookupKey = row.family === 'blade' ? row.nameJa : row.key
    if (lookupKey) byFamilyKey.set(`${row.family}:${lookupKey}`, row)
  }

  const statsProvenance = {
    sourceUrls: hubStats.sourceUrls,
    verifiedAt: hubStats.fetchedAt,
    verificationStatus: 'community_only',
  }

  let matched = 0
  const missing = []
  for (const part of parts) {
    const family = part.family === 'main_blade' ? 'blade' : part.family
    const row = byFamilyKey.get(`${family}:${part.code}`)
    if (!row) {
      if (family === 'blade' || family === 'ratchet' || family === 'bit') {
        missing.push({ id: part.id, name: part.naming.primaryZhTW })
      }
      continue
    }
    const before = JSON.stringify(part)
    if (row.type) part.type = row.type
    if (row.spinDirection) part.spinDirection = row.spinDirection
    if (typeof row.officialWeightG === 'number') part.officialWeightG = row.officialWeightG
    if (row.bitContact) part.bitContact = row.bitContact
    if (row.descriptionZhTW && !part.plainDescriptionZhTW) {
      part.plainDescriptionZhTW = row.descriptionZhTW
    }
    if (JSON.stringify(part) !== before) {
      part.statsProvenance = statsProvenance
      matched += 1
    }
  }

  audit.hubStats = {
    source: hubStats.source,
    fetchedAt: hubStats.fetchedAt,
    matchedParts: matched,
    partsWithoutStats: missing,
  }
  console.log(`社群實測數值套用 ${matched} 筆，未涵蓋 ${missing.length} 筆`)
}

/**
 * 補上社群整理的套裝內容。
 *
 * 官方一覽頁不列套裝內含哪幾顆，這些商品原本內容全空，登記一盒也不會進任何零件。
 * 只覆蓋原本就是空的商品，並把商品的驗證狀態降為 community_only，
 * 讓前台知道這一筆不是官方公布的內容。
 */
function applyHubSetContents(products, hubSets, audit) {
  const byId = new Map(products.map((product) => [product.id, product]))
  let applied = 0
  for (const set of hubSets.sets) {
    const product = byId.get(set.id)
    if (!product || product.contents.length > 0) continue
    product.contents = set.partIds.map((partId) => ({ partId, quantity: 1 }))
    product.provenance = {
      sourceUrls: [...product.provenance.sourceUrls, set.sourceUrl],
      verifiedAt: hubSets.fetchedAt,
      verificationStatus: 'community_only',
    }
    applied += 1
  }
  audit.hubSetContents = {
    source: hubSets.source,
    fetchedAt: hubSets.fetchedAt,
    appliedProducts: applied,
    unresolved: hubSets.skipped.map((row) => ({ id: row.id, sku: row.sku, reason: row.reason })),
  }
  console.log(`社群套裝內容補上 ${applied} 筆，仍未知 ${hubSets.skipped.length} 筆`)
}

/**
 * 補上社群圖鑑的單件去背圖。
 *
 * 官方圖是整盒包裝照（常常還是背面），在手機上縮成 44px 完全看不出是哪顆陀螺。
 * BeybladeHub 有逐件去背圖，改用它當零件縮圖；只含一顆陀螺的商品也改用該上蓋的圖，
 * 讓清單一眼認得出來。沿用第 25 節的 link_only：只連結，不下載也不重新散布。
 */
function addHubImages(catalog, hubStats, audit) {
  const imageByFamilyKey = new Map()
  for (const row of hubStats.parts) {
    if (!row.imageUrl) continue
    const lookupKey = row.family === 'blade' ? row.nameJa : row.key
    if (lookupKey) imageByFamilyKey.set(`${row.family}:${lookupKey}`, row.imageUrl)
  }

  const imageByPartId = new Map()
  for (const part of catalog.parts) {
    const family = part.family === 'main_blade' ? 'blade' : part.family
    const url = imageByFamilyKey.get(`${family}:${part.code}`)
    if (!url) continue
    imageByPartId.set(part.id, url)
    catalog.images.push({
      id: `part:${part.id}:main`,
      entityType: 'part',
      entityId: part.id,
      url,
      sourceUrl: `https://beybladehub.app/parts/${family === 'blade' ? 'blades' : `${family}s`}`,
      sourceName: 'BeybladeHub 零件圖鑑',
      copyrightOwner: 'BeybladeHub',
      usageStatus: 'link_only',
    })
  }

  // 只含一顆陀螺的商品，用那顆上蓋的去背圖取代包裝照。
  let replaced = 0
  for (const product of catalog.products) {
    const blades = product.contents
      .map((entry) => catalog.parts.find((part) => part.id === entry.partId))
      .filter((part) => part && (part.family === 'blade' || part.family === 'main_blade'))
    if (blades.length !== 1) continue
    const url = imageByPartId.get(blades[0].id)
    if (!url) continue
    const existing = catalog.images.find(
      (image) => image.entityType === 'product' && image.entityId === product.id,
    )
    if (existing) {
      existing.url = url
      existing.sourceName = 'BeybladeHub 零件圖鑑'
      existing.copyrightOwner = 'BeybladeHub'
    } else {
      catalog.images.push({
        id: `product:${product.id}:hub`,
        entityType: 'product',
        entityId: product.id,
        url,
        sourceUrl: 'https://beybladehub.app/parts/blades',
        sourceName: 'BeybladeHub 零件圖鑑',
        copyrightOwner: 'BeybladeHub',
        usageStatus: 'link_only',
      })
    }
    replaced += 1
  }

  audit.imageCount = catalog.images.length
  audit.hubImages = { partImages: imageByPartId.size, productImagesReplaced: replaced }
  console.log(`零件圖 ${imageByPartId.size} 張，商品圖改用單件圖 ${replaced} 筆`)
}

function main() {
  const rows = parseLines()
  const images = JSON.parse(readFileSync(IMAGES_FILE, 'utf8'))
  const tournamentSource = JSON.parse(readFileSync(TOURNAMENT_FILE, 'utf8'))
  const hubStats = JSON.parse(readFileSync(HUB_STATS_FILE, 'utf8'))
  const hubSets = JSON.parse(readFileSync(HUB_SETS_FILE, 'utf8'))

  const parts = new Map()
  const products = []
  const audit = {
    catalogVersion: CATALOG_VERSION,
    sourceUrl: LINEUP_URL,
    fetchedAt: FETCHED_AT,
    generatedAt: new Date().toISOString().slice(0, 10),
    productCount: 0,
    partCount: 0,
    imageCount: 0,
    tournamentEventCount: 0,
    tournamentDeckCount: 0,
    rejectedTournamentDecks: [],
    productsWithoutImages: [],
    unparsedBeyProducts: [],
    contentsUnknownProducts: [],
    untranslatedNames: [],
    knownGaps: [
      '官方商品頁未公布零件的類型、重量、旋向與軸心特性，因此這些欄位一律留空，強度分析會顯示資料不足。',
      '官方商品頁未公布隨機強化組的款式內容，因此款式清單為空；使用者開封後可自行登記實際內容。',
      '套裝商品（套組、對戰入門組等）的內含陀螺未在官方一覽頁公布，內容留空並標 needs_review。',
      'CX 上蓋在商品上為「鎖定紋章 + 主刃」已組合狀態，官方未公布兩者個別名稱，故以單一 main_blade 零件表示並標記 cxFused。',
      '中文名稱採用 BeybladeHub（beybladehub.app）台灣社群通用名稱；該站未收錄者仍為暫譯並已標記。',
    ],
  }

  function ensurePart({ family, code, system, extra }) {
    const id = `${family}:${code}`
    if (parts.has(id)) return id
    const isJa = /[぀-ヿ]/.test(code)
    const label = PART_FAMILY_LABEL[family]
    let naming
    if (isJa) {
      const { translated, untranslated } = translate(code)
      naming = {
        primaryZhTW: untranslated.length > 0 ? `${label} ${code}` : translated,
        nameJa: code,
        isProvisionalZhTW: !isConfirmedName(code),
      }
      if (untranslated.length > 0) audit.untranslatedNames.push({ kind: 'part', code, untranslated })
    } else {
      // 固鎖／軸心／輔助戰刃的名稱就是型號本身，不再加分類前綴（第 26 節：型號直接當主名稱）。
      naming = { primaryZhTW: code, isProvisionalZhTW: false }
    }
    parts.set(id, {
      id,
      family,
      code,
      system,
      naming,
      ...(extra ?? {}),
      provenance: {
        sourceUrls: [LINEUP_URL],
        verifiedAt: FETCHED_AT,
        verificationStatus: 'official_verified',
      },
    })
    return id
  }

  /** 解析單顆陀螺名稱，回傳內含零件清單；解析失敗回 null。 */
  function parseBey(beyName, line) {
    if (line === 'CX') {
      const match = CX_BEY.exec(beyName)
      if (!match?.groups) return null
      const { blade, assist, ratchet, bit } = match.groups
      const heightCode = Number(ratchet.split('-')[1])
      return [
        { partId: ensurePart({ family: 'main_blade', code: blade, system: 'CX', extra: { cxFused: true } }), quantity: 1 },
        { partId: ensurePart({ family: 'assist_blade', code: assist, system: 'CX' }), quantity: 1 },
        { partId: ensurePart({ family: 'ratchet', code: ratchet, system: 'CX', extra: { heightCode } }), quantity: 1 },
        { partId: ensurePart({ family: 'bit', code: bit, system: 'CX' }), quantity: 1 },
      ]
    }
    const match = BX_BEY.exec(beyName)
    if (!match?.groups) return null
    const { blade, ratchet, bit } = match.groups
    const heightCode = Number(ratchet.split('-')[1])
    return [
      { partId: ensurePart({ family: 'blade', code: blade, system: line === 'UX' ? 'UX' : 'BX' }), quantity: 1 },
      { partId: ensurePart({ family: 'ratchet', code: ratchet, system: 'BX', extra: { heightCode } }), quantity: 1 },
      { partId: ensurePart({ family: 'bit', code: bit, system: 'BX' }), quantity: 1 },
    ]
  }

  for (const row of rows) {
    const id = productIdFromPath(row.path)
    const category = resolveCategory(row)
    const line = lineOf(row.sku)
    const detailUrl = `${SITE_ORIGIN}${row.path}`
    const isRandom = category === 'random_booster'

    const fallbackZhTW = `${row.sku} ${row.categoryJa === 'ツール' ? '配件' : '商品'}`
    const { naming, untranslated } = makeNaming(row.nameJa, fallbackZhTW)
    if (untranslated.length > 0) {
      audit.untranslatedNames.push({ kind: 'product', id, nameJa: row.nameJa, untranslated })
    }

    let contents = []
    let contentsKnown = false
    const manualOverride = OFFICIAL_MANUAL_OVERRIDES[id]

    if (manualOverride) {
      const parsed = manualOverride.beys.map((entry) => {
        const bey = typeof entry === 'string' ? { name: entry, line } : entry
        return parseBey(bey.name, bey.line)
      })
      if (parsed.every(Boolean)) {
        contents = [
          ...parsed.flat(),
          ...(manualOverride.parts ?? []).map((part) => ({
            partId: ensurePart(part),
            quantity: 1,
          })),
          ...manualOverride.accessories.map((accessoryName) => ({ accessoryName, quantity: 1 })),
        ]
        contentsKnown = true
      }
    } else if (isRandom) {
      contentsKnown = false
    } else if (category === 'tool' || category === 'accessory') {
      contentsKnown = true
    } else if (row.nameJa.startsWith('ビットセット')) {
      const codes = (row.nameJa.match(/([A-Z]+(?:\/[A-Z]+)+)/) ?? [])[1]
      if (codes) {
        contents = codes
          .split('/')
          .map((code) => ({ partId: ensurePart({ family: 'bit', code, system: 'BX' }), quantity: 1 }))
        contentsKnown = true
      }
    } else if (row.categoryJa === 'ダブルスターター') {
      const segments = row.nameJa.split('/').map((segment) => segment.trim())
      const parsed = segments.map((segment) => {
        // 去掉聯名前綴，例如「マーベル アイアンマン4-80B」。
        const beyName = segment.includes(' ') ? segment.slice(segment.indexOf(' ') + 1) : segment
        return parseBey(beyName, line)
      })
      if (parsed.every(Boolean)) {
        contents = parsed.flat()
        contentsKnown = true
      }
    } else if (category === 'starter' || category === 'booster') {
      const { head } = splitBeyAndSuffix(row.nameJa)
      const parsed = parseBey(head, line)
      if (parsed) {
        contents = parsed
        contentsKnown = true
      }
    }

    if (!contentsKnown) {
      if (isRandom) {
        audit.contentsUnknownProducts.push({ id, nameJa: row.nameJa, reason: '隨機內容，官方未公布款式' })
      } else if (category === 'starter' || category === 'booster') {
        audit.unparsedBeyProducts.push({ id, nameJa: row.nameJa, reason: '商品名不符合可解析的零件命名規則' })
      } else {
        audit.contentsUnknownProducts.push({ id, nameJa: row.nameJa, reason: '套裝內容未在官方一覽頁公布' })
      }
    }

    products.push({
      id,
      sku: row.sku,
      line,
      category,
      naming,
      releaseDate: toIsoDate(row.dateJa),
      region: ['JP'],
      contents,
      isRandom,
      provenance: {
        sourceUrls: [LINEUP_URL, detailUrl, ...(manualOverride ? [manualOverride.sourceUrl] : [])],
        verifiedAt: FETCHED_AT,
        verificationStatus: contentsKnown ? 'official_verified' : 'needs_review',
      },
    })
  }

  const tournamentEvents = []
  const tournamentDecks = []
  const partById = parts
  for (const sourceEvent of tournamentSource.events) {
    const acceptedDecks = []
    for (const sourceDeck of sourceEvent.decks) {
      const reason = validateTournamentDeck(sourceDeck, partById)
      if (reason) {
        audit.rejectedTournamentDecks.push({ id: sourceDeck.id, reason })
        continue
      }
      const comboKeys = sourceDeck.comboPartIds.map((ids) => comboKeyFromPartIds(ids, partById))
      acceptedDecks.push({
        id: sourceDeck.id,
        eventId: sourceEvent.event.id,
        placement: sourceDeck.placement,
        comboKeys,
        comboPartIds: sourceDeck.comboPartIds,
        sourceUrl: sourceEvent.event.sourceUrl,
      })
    }
    if (acceptedDecks.length > 0) {
      tournamentEvents.push(sourceEvent.event)
      tournamentDecks.push(...acceptedDecks)
    }
  }

  const catalog = {
    version: CATALOG_VERSION,
    sourceUrl: LINEUP_URL,
    fetchedAt: FETCHED_AT,
    parts: [...parts.values()],
    partVariants: [],
    products,
    productVariants: [],
    compatibilityRules: [],
    images,
    tournamentEvents,
    tournamentDecks,
  }

  audit.productCount = products.length
  applyHubStats(catalog.parts, hubStats, audit)
  applyHubSetContents(catalog.products, hubSets, audit)
  addHubImages(catalog, hubStats, audit)
  audit.partCount = catalog.parts.length
  audit.tournamentEventCount = tournamentEvents.length
  audit.tournamentDeckCount = tournamentDecks.length
  const imageProductIds = new Set(
    images.filter((image) => image.entityType === 'product').map((image) => image.entityId),
  )
  audit.productsWithoutImages = products
    .filter((product) => !imageProductIds.has(product.id))
    .map((product) => ({ id: product.id, sku: product.sku }))

  mkdirSync(dirname(OUT_FILE), { recursive: true })
  writeFileSync(OUT_FILE, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8')
  writeFileSync(AUDIT_FILE, `${JSON.stringify(audit, null, 2)}\n`, 'utf8')

  console.log(`商品 ${products.length} 筆、零件 ${catalog.parts.length} 筆`)
  console.log(`零件組成未解析：${audit.unparsedBeyProducts.length} 筆`)
  console.log(`內容未知：${audit.contentsUnknownProducts.length} 筆`)
  console.log(`中文名稱未完全翻譯：${audit.untranslatedNames.length} 筆`)
  console.log(`賽事 ${tournamentEvents.length} 場、完整牌組 ${tournamentDecks.length} 副、拒絕 ${audit.rejectedTournamentDecks.length} 副`)
}

function validateTournamentDeck(deck, partById) {
  if (!Array.isArray(deck.comboPartIds) || deck.comboPartIds.length !== 3) return '牌組不是完整三顆配置'
  if (!Array.isArray(deck.reportedCombos) || deck.reportedCombos.length !== 3) return '缺少來源頁的三顆原始組合文字'
  for (const ids of deck.comboPartIds) {
    if (!Array.isArray(ids) || ids.length !== 3) return '單顆配置不是上蓋、固鎖、軸心三件式'
    const [blade, ratchet, bit] = ids.map((id) => partById.get(id))
    if (!blade || !ratchet || !bit) return `型錄找不到零件：${ids.join(', ')}`
    if (!['blade', 'integrated_blade'].includes(blade.family) || ratchet.family !== 'ratchet' || bit.family !== 'bit') {
      return `零件家族不符：${ids.join(', ')}`
    }
  }
  return undefined
}

function comboKeyFromPartIds(ids, partById) {
  const [blade, ratchet, bit] = ids.map((id) => partById.get(id))
  return `${blade.code} ${ratchet.code}${bit.code}`
}

main()
