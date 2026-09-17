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
const HUB_STRUCTURE_FILE = resolve(root, 'src/catalog/sources/beybladehub-structure.json')
const HUB_CURATED_SETS_FILE = resolve(root, 'src/catalog/sources/beybladehub-curated-sets.json')
const LOCAL_IMAGES_FILE = resolve(root, 'src/catalog/images.local.json')

const LINEUP_URL = 'https://beyblade.takaratomy.co.jp/beyblade-x/lineup/'
const SITE_ORIGIN = 'https://beyblade.takaratomy.co.jp'
const FETCHED_AT = '2026-09-16'
// 非商品一覽的策展資料更新也必須讓既有裝置重新載入 Catalog。
const CATALOG_VERSION = `takaratomy-lineup-${FETCHED_AT}-r3`

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
/**
 * CX 商品名的字母段落。
 *
 * 三件式（鎖定紋章＋金屬主刃＋輔助戰刃）只有一個字母，例如ドランブレイブ「S」。
 * 四件式（超越拆組，再多一片超越戰刃）是相鄰兩個字母，前為超越、後為輔助，
 * 例如バハムートブリッツ「BK」= 超越 B + 輔助 K。
 *
 * 「某支商品是三件式還是四件式」官方商品頁沒有寫，來源是 BeybladeHub 的商品頁
 * （已逐筆確認 CX-01 三件式、CX-13／CX-14／CX-15 四件式），
 * 因此四件式拆出來的兩片零件標為社群來源。
 */
const CX_BEY = new RegExp(
  `^(?<blade>.+?)(?<blades>[A-Z][A-Za-z]?)(?<ratchet>${RATCHET})(?<bit>[A-Za-z]+)$`,
)

const HUB_COMBO_URL = 'https://beybladehub.app/parts/combos'

/*
 * 沒有固鎖代號的商品名。
 *
 * UX 的「擴張上蓋」與 Op／Tr 這類軸心已經把固鎖做在自己身上，商品名裡就沒有固鎖段，
 * 例如バレットグリフォン「H」、グローリーワルキューレ「LF」、ペガサスブラスト「A」「Tr」。
 * 只有在零件確實是固鎖一體型時才接受這種解析，否則會把正常商品亂拆。
 */
const BX_BEY_NO_RATCHET = /^(?<blade>.+?)(?<bit>[A-Za-z]+)$/u
const CX_BEY_NO_RATCHET = /^(?<blade>.+?)(?<blades>[A-Z][A-Za-z]?)(?<bit>[A-Za-z]+)$/u

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

/*
 * 圖片歸屬：BeybladeHub 提供的是去背整理過的零件圖，原始商品外觀的著作權仍屬
 * Takara Tomy，把 copyrightOwner 寫成 BeybladeHub 是錯的歸屬（第 25、1.5 節），
 * 所以只記「圖片取自哪裡」，不宣稱誰擁有版權。
 */
const HUB_IMAGE_SOURCE_NAME = 'BeybladeHub 零件去背圖（外部連結）'
const HUB_PARTS_URL = 'https://beybladehub.app/parts/blades'

/**
 * 把 BeybladeHub 的 CX 零件 key 轉成本專案的零件種類與代號。
 *
 * 官方只公布合併後的上蓋名稱（例：ドランブレイブ），個別的鎖定紋章與主刃名稱
 * 只有社群站有，所以這些零件的身分來源是 community_only。
 * 帶第二段後綴的 key（例：cx-chip-Dr-black）是顏色變體，不當成獨立零件。
 */
function cxKeyToPart(key) {
  const match = /^cx-(chip|main|metal|over|assist)-(.+)$/u.exec(key)
  if (!match) return null
  const [, kind, code] = match
  if (code.includes('-')) return null
  const family =
    kind === 'chip'
      ? 'lock_chip'
      : kind === 'over'
        ? 'over_blade'
        : kind === 'assist'
          ? 'assist_blade'
          : 'main_blade'
  return { family, code, isMetalMain: kind === 'metal' }
}

const PART_FAMILY_LABEL = {
  blade: '上蓋',
  main_blade: '主刃',
  over_blade: '超越戰刃',
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
function applyHubStats(parts, hubStats, audit, cxHubKeyByPartId = new Map()) {
  const byFamilyKey = new Map()
  for (const row of hubStats.parts) {
    // CX 的紋章／主刃／超越／輔助在本專案是獨立零件，代號就是社群站 key 的尾段。
    const cx = cxKeyToPart(row.key)
    if (cx) {
      byFamilyKey.set(`${cx.family}:${cx.code}`, row)
      continue
    }
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
  const byHubKey = new Map(hubStats.parts.map((row) => [row.key, row]))
  for (const part of parts) {
    const family = part.cxFused ? 'blade' : part.family
    const hubKey = cxHubKeyByPartId.get(part.id)
    const row = hubKey
      ? byHubKey.get(hubKey)
      : (byFamilyKey.get(`${part.family}:${part.code}`) ?? byFamilyKey.get(`${family}:${part.code}`))
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
/**
 * 把圖片換成本機副本。
 *
 * 規格對照：第 25 節。原本全部是外部連結，對方改路徑或擋掉就整批破圖，
 * 專案擁有者決定自存一份（`npm run fetch:images`）。
 *
 * 誠實界線：鏡像不等於取得授權，所以 usageStatus 從 link_only 改成 unknown
 * （授權狀態未確認），並保留原始網址與來源名稱，前台照樣把來源交代清楚。
 */
function applyLocalImageMirror(catalog, audit) {
  let localMap = {}
  try {
    localMap = JSON.parse(readFileSync(LOCAL_IMAGES_FILE, 'utf8')).byUrl ?? {}
  } catch {
    localMap = {}
  }
  if (Object.keys(localMap).length === 0) {
    audit.localImages = { mirrored: 0, stillRemote: catalog.images.length }
    console.log('沒有本機圖片對應表，圖片維持外部連結')
    return
  }

  let mirrored = 0
  for (const image of catalog.images) {
    const local = localMap[image.url]
    if (!local) continue
    image.remoteUrl = image.url
    image.url = local
    image.isLocalMirror = true
    image.usageStatus = 'unknown'
    // 名稱要講「圖片來自哪裡」，取得方式改由 isLocalMirror 表示。
    image.sourceName = image.sourceName.replace(/（外部(?:圖片)?連結）/u, '')
    mirrored += 1
  }
  const stillRemote = catalog.images.length - mirrored
  audit.localImages = { mirrored, stillRemote }
  console.log(`圖片改用本機副本 ${mirrored} 張，仍為外部連結 ${stillRemote} 張`)
}

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
function addHubImages(catalog, hubStats, audit, cxHubKeyByPartId = new Map()) {
  const imageByFamilyKey = new Map()
  for (const row of hubStats.parts) {
    if (!row.imageUrl) continue
    const cx = cxKeyToPart(row.key)
    if (cx) {
      imageByFamilyKey.set(`${cx.family}:${cx.code}`, row.imageUrl)
      continue
    }
    const lookupKey = row.family === 'blade' ? row.nameJa : row.key
    if (lookupKey) imageByFamilyKey.set(`${row.family}:${lookupKey}`, row.imageUrl)
  }

  const imageByHubKey = new Map(
    hubStats.parts.filter((row) => row.imageUrl).map((row) => [row.key, row.imageUrl]),
  )
  const imageByPartId = new Map()
  for (const part of catalog.parts) {
    // 合併主刃（cxFused）的 code 是日文合併名，要走 blade 索引；拆開後的主刃用自己的 family。
    const family = part.cxFused ? 'blade' : part.family
    const hubKey = cxHubKeyByPartId.get(part.id)
    const url = hubKey
      ? imageByHubKey.get(hubKey)
      : (imageByFamilyKey.get(`${part.family}:${part.code}`) ??
        imageByFamilyKey.get(`${family}:${part.code}`))
    if (!url) continue
    imageByPartId.set(part.id, url)
    catalog.images.push({
      id: `part:${part.id}:main`,
      entityType: 'part',
      entityId: part.id,
      url,
      sourceUrl: `https://beybladehub.app/parts/${family === 'blade' ? 'blades' : `${family}s`}`,
      sourceName: HUB_IMAGE_SOURCE_NAME,
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
      existing.sourceName = HUB_IMAGE_SOURCE_NAME
      // 換成社群去背圖之後，原本標的官方版權人與官方頁就不再是這張圖的來源。
      delete existing.copyrightOwner
      existing.sourceUrl = HUB_PARTS_URL
    } else {
      catalog.images.push({
        id: `product:${product.id}:hub`,
        entityType: 'product',
        entityId: product.id,
        url,
        sourceUrl: 'https://beybladehub.app/parts/blades',
        sourceName: HUB_IMAGE_SOURCE_NAME,
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
  const hubStructure = JSON.parse(readFileSync(HUB_STRUCTURE_FILE, 'utf8'))
  const curatedSets = JSON.parse(readFileSync(HUB_CURATED_SETS_FILE, 'utf8'))
  /** 固鎖一體型的上蓋（日文名）與軸心（代號）；官方商品名不會標，來源是社群站零件頁。 */
  const integratedBladeNames = new Set(
    hubStructure.integratedRatchetBlades.map((row) => row.nameJa),
  )
  const integratedBitCodes = new Set(hubStructure.integratedRatchetBits.map((row) => row.code))
  const structureProvenance = {
    sourceUrls: hubStructure.sourceUrls,
    verifiedAt: hubStructure.fetchedAt,
    verificationStatus: 'community_only',
  }

  /*
   * CX 上蓋拆解表。
   *
   * 官方只公布合併名稱（例：ドランブレイブ），個別的鎖定紋章與主刃名稱只有社群站有。
   * 用「紋章中文名 + 主刃中文名 == 合併件中文名」比對，比對得到才拆，
   * 比對不到的維持合併並標 cxFused（社群站尚未收錄的新款）。
   */
  const cxChips = []
  const cxMains = []
  for (const row of hubStats.parts) {
    const cx = cxKeyToPart(row.key)
    if (!cx || !row.zhTW) continue
    if (cx.family === 'lock_chip') cxChips.push({ ...cx, row })
    if (cx.family === 'main_blade') cxMains.push({ ...cx, row })
  }

  function decomposeCxBlade(zhName) {
    const hits = []
    for (const chip of cxChips) {
      for (const main of cxMains) {
        if (chip.row.zhTW + main.row.zhTW === zhName) hits.push({ chip, main })
      }
    }
    return hits.length === 1 ? hits[0] : null
  }

  /**
   * 由社群站資料建立 CX 零件；名稱與數值都來自社群站，所以身分也標社群來源。
   *
   * 金屬主刃要用獨立 id：普通主刃「烈焰」是 cx-main-Fr、金屬主刃「堡壘」是 cx-metal-Fr，
   * 代號同樣是 Fr，只靠 family:code 會撞號、後者會拿到前者的資料。
   */
  function ensureCxPiece(piece) {
    const id =
      piece.isMetalMain
        ? `${piece.family}:metal-${piece.code}`
        : `${piece.family}:${piece.code}`
    const created = ensurePart({
      id,
      family: piece.family,
      code: piece.code,
      system: 'CX',
      naming: {
        primaryZhTW: piece.row.zhTW,
        ...(piece.row.nameEn ? { nameEn: piece.row.nameEn } : {}),
        isProvisionalZhTW: false,
      },
      ...(piece.isMetalMain ? { extra: { cxOverBlade: true } } : {}),
      provenance: {
        sourceUrls: hubStats.sourceUrls,
        verifiedAt: hubStats.fetchedAt,
        verificationStatus: 'community_only',
      },
    })
    cxHubKeyByPartId.set(created, piece.row.key)
    return created
  }

  const parts = new Map()
  const products = []
  /** 舊零件 id → 新零件 id 陣列，供 repository 在載入圖鑑時遷移個人資料。 */
  const partIdMigrations = {}
  /** 零件 id → BeybladeHub 的 key，讓數值與圖片對得到正確那一筆。 */
  const cxHubKeyByPartId = new Map()
  const cxSplitSeen = new Set()
  const cxUnsplitSeen = new Set()
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
    tournamentObservationCount: 0,
    rejectedTournamentDecks: [],
    rejectedTournamentObservations: [],
    productsWithoutImages: [],
    unparsedBeyProducts: [],
    contentsUnknownProducts: [],
    randomContentsByDesign: [],
    cxSplitBlades: [],
    cxUnsplitBlades: [],
    noPartsProducts: [],
    untranslatedNames: [],
    knownGaps: [
      '官方商品頁未公布零件的類型、重量、旋向與軸心特性，因此這些欄位一律留空，強度分析會顯示資料不足。',
      '官方商品頁未公布隨機強化組的款式內容，因此款式清單為空；使用者開封後可自行登記實際內容。',
      '套裝商品的內含陀螺未在官方一覽頁公布，改以 BeybladeHub 商品頁逐筆彙整，這些商品標 community_only 並附該頁網址與原文引述。',
      '只出現在套裝內的上蓋（官方一覽頁沒有單獨列出）身分也標 community_only。',
      'CX 上蓋的鎖定紋章與主刃名稱官方未公布，依 BeybladeHub 零件頁拆成兩顆零件；該站未收錄的 4 顆維持合併並標記 cxFused。',
      '「哪些零件是固鎖一體型」官方商品名不會標，依 BeybladeHub 零件頁記錄，屬社群來源。',
      '中文名稱採用 BeybladeHub（beybladehub.app）台灣社群通用名稱；該站未收錄者仍為暫譯並已標記。',
      '圖片為本機副本（自存一份避免來源改路徑就破圖），不代表已取得授權：usageStatus 標 unknown，原始位置與來源名稱都保留在資料裡。',
    ],
  }

  function ensurePart({ family, code, system, extra, provenance, naming: givenNaming, id: givenId }) {
    const id = givenId ?? `${family}:${code}`
    if (parts.has(id)) return id
    if (givenNaming) {
      parts.set(id, {
        id,
        family,
        code,
        system,
        naming: givenNaming,
        ...(extra ?? {}),
        provenance: provenance ?? {
          sourceUrls: [LINEUP_URL],
          verifiedAt: FETCHED_AT,
          verificationStatus: 'official_verified',
        },
      })
      return id
    }
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
      provenance: provenance ?? {
        sourceUrls: [LINEUP_URL],
        verifiedAt: FETCHED_AT,
        verificationStatus: 'official_verified',
      },
    })
    return id
  }

  /*
   * 隨機包的已知款式與 CX 的個別紋章未必能從官方商品名直接解析，
   * 但若 BeybladeHub 零件頁已明確列出，就可用這份受限清單建立社群來源零件。
   * 不掃描整份社群資料，避免把沒有商品或可追溯用途的條目一併塞進圖鑑。
   */
  for (const spec of hubStructure.supplementalCatalogParts ?? []) {
    const hubRow = hubStats.parts.find((row) => row.key === spec.hubKey)
    if (!hubRow?.zhTW) throw new Error(`補充零件找不到 BeybladeHub 資料：${spec.hubKey}`)
    const cx = cxKeyToPart(hubRow.key)
    const code = spec.code ?? cx?.code ?? (hubRow.family === 'blade' ? hubRow.nameJa : hubRow.key)
    if (!code) throw new Error(`補充零件缺少代號：${spec.hubKey}`)
    const id = ensurePart({
      family: spec.family,
      code,
      system: spec.system,
      naming: {
        primaryZhTW: hubRow.zhTW,
        ...(hubRow.nameJa ? { nameJa: hubRow.nameJa } : {}),
        ...(hubRow.nameEn ? { nameEn: hubRow.nameEn } : {}),
        isProvisionalZhTW: false,
      },
      provenance: {
        sourceUrls: hubStats.sourceUrls,
        verifiedAt: hubStats.fetchedAt,
        verificationStatus: 'community_only',
      },
    })
    cxHubKeyByPartId.set(id, hubRow.key)
  }

  /** 解析單顆陀螺名稱，回傳內含零件清單；解析失敗回 null。 */
  function parseBey(beyName, line, sku) {
    if (line === 'CX') {
      const match = CX_BEY.exec(beyName)
      /*
       * CX 也有固鎖一體型軸心的款（例：ペガサスブラスト「A」「Tr」）。
       * 尾端的英文字母要自己試切：正規表達式會把 ATr 貪心切成 AT + r，
       * 所以依序試「輔助 1 字 + 軸心其餘」與「輔助 2 字 + 軸心其餘」，
       * 只有軸心確實是固鎖一體型才採用。
       */
      let usable = match?.groups ?? null
      if (!usable) {
        const tail = /^(?<blade>.+?)(?<letters>[A-Za-z]+)$/u.exec(beyName)
        const letters = tail?.groups?.letters ?? ''
        for (const assistLength of [1, 2]) {
          const assist = letters.slice(0, assistLength)
          const bitCode = letters.slice(assistLength)
          if (!bitCode || !/^[A-Z]/u.test(assist)) continue
          if (!integratedBitCodes.has(bitCode)) continue
          usable = { blade: tail.groups.blade, blades: assist, bit: bitCode }
          break
        }
      }
      if (!usable) return null
      const { blade, blades, ratchet, bit } = usable
      const heightCode = ratchet ? Number(ratchet.split('-')[1]) : undefined

      // 兩個字母 = 四件式：前面是超越戰刃、後面是輔助戰刃。
      const isFourPiece = blades.length === 2
      const overCode = isFourPiece ? blades[0] : null
      const assistCode = isFourPiece ? blades[1] : blades
      const communityProvenance = {
        sourceUrls: [LINEUP_URL, `${HUB_COMBO_URL}/${sku}`],
        verifiedAt: FETCHED_AT,
        verificationStatus: 'community_only',
      }

      /*
       * 上蓋：能對到社群站的紋章＋主刃就拆成兩顆，對不到就維持合併（cxFused）。
       * 拆開之後同一顆紋章才能換不同主刃，這是 CX 系統的重點。
       */
      const { translated: bladeZhTW, untranslated } = translate(blade)
      const decomposed = untranslated.length === 0 ? decomposeCxBlade(bladeZhTW) : null
      const fusedId = `main_blade:${blade}`

      const contents = []
      if (decomposed) {
        const chipId = ensureCxPiece(decomposed.chip)
        const mainId = ensureCxPiece(decomposed.main)
        contents.push({ partId: chipId, quantity: 1 }, { partId: mainId, quantity: 1 })
        if (!cxSplitSeen.has(fusedId)) {
          cxSplitSeen.add(fusedId)
          audit.cxSplitBlades.push({
            fusedId,
            nameJa: blade,
            nameZhTW: bladeZhTW,
            lockChipId: chipId,
            mainBladeId: mainId,
          })
          // 舊版把整顆上蓋存成一顆零件，使用者裝置上的庫存與配裝要照這張表遷移。
          partIdMigrations[fusedId] = [chipId, mainId]
        }
      } else {
        contents.push({
          partId: ensurePart({
            family: 'main_blade',
            code: blade,
            system: 'CX',
            extra: { cxFused: true, ...(isFourPiece ? { cxOverBlade: true } : {}) },
          }),
          quantity: 1,
        })
        if (!cxUnsplitSeen.has(fusedId)) {
          cxUnsplitSeen.add(fusedId)
          audit.cxUnsplitBlades.push({
            fusedId,
            nameJa: blade,
            nameZhTW: bladeZhTW,
            reason: '社群站尚未收錄這顆的鎖定紋章或主刃，維持合併',
          })
        }
      }
      if (overCode) {
        contents.push({
          partId: ensurePart({
            family: 'over_blade',
            code: overCode,
            system: 'CX',
            provenance: communityProvenance,
          }),
          quantity: 1,
        })
      }
      contents.push(
        {
          partId: ensurePart({
            family: 'assist_blade',
            code: assistCode,
            system: 'CX',
            ...(isFourPiece ? { provenance: communityProvenance } : {}),
          }),
          quantity: 1,
        },
        { partId: ensureBit(bit), quantity: 1 },
      )
      if (ratchet) {
        contents.splice(contents.length - 1, 0, {
          partId: ensurePart({ family: 'ratchet', code: ratchet, system: 'CX', extra: { heightCode } }),
          quantity: 1,
        })
      }
      return contents
    }
    const match = BX_BEY.exec(beyName)
    if (match?.groups) {
      const { blade, ratchet, bit } = match.groups
      const heightCode = Number(ratchet.split('-')[1])
      return [
        { partId: ensureBlade(blade, line), quantity: 1 },
        { partId: ensurePart({ family: 'ratchet', code: ratchet, system: 'BX', extra: { heightCode } }), quantity: 1 },
        { partId: ensureBit(bit), quantity: 1 },
      ]
    }

    // 沒有固鎖段的商品名：只有上蓋或軸心確實是固鎖一體型時才這樣解析。
    const noRatchet = BX_BEY_NO_RATCHET.exec(beyName)
    if (noRatchet?.groups) {
      const { blade, bit } = noRatchet.groups
      if (integratedBladeNames.has(blade) || integratedBitCodes.has(bit)) {
        return [
          { partId: ensureBlade(blade, line), quantity: 1 },
          { partId: ensureBit(bit), quantity: 1 },
        ]
      }
    }
    return null
  }

  /** 上蓋：固鎖一體型的歸到「特殊一體式」並標記，結構才會少掉固鎖欄位。 */
  function ensureBlade(code, line) {
    const integrated = integratedBladeNames.has(code)
    return ensurePart({
      family: integrated ? 'integrated_blade' : 'blade',
      code,
      system: line === 'UX' ? 'UX' : 'BX',
      ...(integrated
        ? { extra: { integratedRatchet: true }, provenance: structureProvenance }
        : {}),
    })
  }

  /** 軸心：Op／Tr 這類把固鎖做在軸心上的要標記。 */
  function ensureBit(code) {
    const integrated = integratedBitCodes.has(code)
    return ensurePart({
      family: 'bit',
      code,
      system: 'BX',
      ...(integrated ? { extra: { integratedRatchet: true } } : {}),
    })
  }

  /**
   * 補上人工彙整的套裝內容。
   *
   * 對象是自動抓取處理不了的兩類：多顆套裝（商品頁的錨點混了「推薦搭配」池，
   * 照抄會多列一堆不在盒內的零件）與 BX-00／UX-00／CX-00 這類無編號商品
   * （社群站網址不是用型號組的，抓取腳本一律 404）。
   *
   * 每一筆都附商品頁網址與原文引述；只有盒內才有的上蓋會在這裡建立，
   * 身分標 community_only（官方一覽頁沒有單獨列出它們）。
   */
  function applyCuratedSets(catalogRef, curated, auditRef) {
    const byId = new Map(catalogRef.products.map((product) => [product.id, product]))
    const curatedProvenanceBase = {
      verifiedAt: curated.fetchedAt,
      verificationStatus: 'community_only',
    }
    const applied = []
    const failed = []

    /** 建立只在套裝裡出現的上蓋；有日文名就沿用既有命名規則，沒有就用中文名當代號。 */
    function ensureCuratedBlade(spec, integrated) {
      const hubRow = spec.hubKey ? hubStats.parts.find((row) => row.key === spec.hubKey) : undefined
      const code = spec.nameJa ?? spec.zhTW
      const family = integrated ? 'integrated_blade' : 'blade'
      const id = `${family}:${code}`
      const provenance = {
        sourceUrls: [...(hubStructure.sourceUrls ?? []), ...(hubRow ? hubStats.sourceUrls : [])],
        ...curatedProvenanceBase,
      }
      const partId = ensurePart({
        id,
        family,
        code,
        system: 'UX',
        naming: {
          primaryZhTW: spec.zhTW,
          ...(spec.nameJa ? { nameJa: spec.nameJa } : {}),
          ...(hubRow?.nameEn ? { nameEn: hubRow.nameEn } : {}),
          isProvisionalZhTW: false,
        },
        ...(integrated ? { extra: { integratedRatchet: true } } : {}),
        provenance,
      })
      if (spec.hubKey) cxHubKeyByPartId.set(partId, spec.hubKey)
      return partId
    }

    for (const set of curated.sets) {
      const product = byId.get(set.productId)
      if (!product) {
        failed.push({ productId: set.productId, reason: '找不到這個商品 id' })
        continue
      }
      if (product.contents.length > 0) continue

      const contents = []
      let ok = true
      for (const bey of set.beys) {
        if (bey.kind === 'cx') {
          const chip = cxChips.find((row) => row.code === bey.chip)
          const main = cxMains.find((row) => row.code === bey.main)
          if (!chip || !main) {
            failed.push({ productId: set.productId, reason: `社群站查不到 CX 零件：${bey.chip}/${bey.main}` })
            ok = false
            break
          }
          contents.push({ partId: ensureCxPiece(chip), quantity: 1 })
          contents.push({ partId: ensureCxPiece(main), quantity: 1 })
          contents.push({
            partId: ensurePart({ family: 'assist_blade', code: bey.assist, system: 'CX' }),
            quantity: 1,
          })
          if (bey.ratchet) {
            contents.push({
              partId: ensurePart({
                family: 'ratchet',
                code: bey.ratchet,
                system: 'CX',
                extra: { heightCode: Number(bey.ratchet.split('-')[1]) },
              }),
              quantity: 1,
            })
          }
          contents.push({ partId: ensureBit(bey.bit), quantity: 1 })
          continue
        }

        const integrated = bey.kind === 'integrated'
        const bladeId = bey.bladeJa
          ? ensureBlade(bey.bladeJa, 'UX')
          : ensureCuratedBlade(bey.blade, integrated)
        contents.push({ partId: bladeId, quantity: 1 })
        if (bey.ratchet) {
          contents.push({
            partId: ensurePart({
              family: 'ratchet',
              code: bey.ratchet,
              system: 'BX',
              extra: { heightCode: Number(bey.ratchet.split('-')[1]) },
            }),
            quantity: 1,
          })
        }
        contents.push({ partId: ensureBit(bey.bit), quantity: 1 })
      }
      if (!ok) continue

      product.contents = contents
      product.provenance = {
        sourceUrls: [...product.provenance.sourceUrls, set.sourceUrl],
        verifiedAt: curated.fetchedAt,
        verificationStatus: 'community_only',
      }
      applied.push({ productId: set.productId, sku: set.sku, beys: set.beys.length })
    }

    auditRef.curatedSets = {
      source: curated.source,
      fetchedAt: curated.fetchedAt,
      applied,
      failed,
    }
    console.log(`人工彙整套裝內容補上 ${applied.length} 筆，失敗 ${failed.length} 筆`)
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
        return parseBey(bey.name, bey.line, row.sku)
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
      // 配件類本來就不含可配裝零件，算「已知：沒有零件」，不是待查。
      contentsKnown = true
      audit.noPartsProducts.push({ id, nameJa: row.nameJa, category })
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
        return parseBey(beyName, line, row.sku)
      })
      if (parsed.every(Boolean)) {
        contents = parsed.flat()
        contentsKnown = true
      }
    } else if (category === 'starter' || category === 'booster') {
      const { head } = splitBeyAndSuffix(row.nameJa)
      const parsed = parseBey(head, line, row.sku)
      if (parsed) {
        contents = parsed
        contentsKnown = true
      }
    }

    if (!contentsKnown) {
      if (isRandom) {
        // 隨機補充包是刻意不填，不是資料缺漏，分開記才不會看起來像 20 幾筆待補。
        audit.randomContentsByDesign.push({
          id,
          nameJa: row.nameJa,
          reason: '隨機內容，開封後由使用者自行登記實際抽到的零件',
        })
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
  const tournamentObservations = []
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

  for (const sourceEvent of tournamentSource.observationEvents ?? []) {
    const acceptedObservations = []
    for (const sourceObservation of sourceEvent.observations) {
      const reason = validateTournamentObservation(sourceObservation, partById)
      if (reason) {
        audit.rejectedTournamentObservations.push({ id: sourceObservation.id, reason })
        continue
      }
      acceptedObservations.push({
        id: sourceObservation.id,
        eventId: sourceEvent.event.id,
        placement: sourceObservation.placement,
        comboPartIds: sourceObservation.comboPartIds,
        reportedCombo: sourceObservation.reportedCombo,
        sourceUrl: sourceEvent.event.sourceUrl,
      })
    }
    if (acceptedObservations.length > 0) {
      if (!tournamentEvents.some((event) => event.id === sourceEvent.event.id)) {
        tournamentEvents.push(sourceEvent.event)
      }
      tournamentObservations.push(...acceptedObservations)
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
    tournamentObservations,
    partIdMigrations,
  }

  audit.cxSplitCount = audit.cxSplitBlades.length
  audit.productCount = products.length

  // 人工彙整的套裝會建立只在盒內出現的零件，所以要先補內容，再把零件清單重新取一次快照。
  applyCuratedSets(catalog, curatedSets, audit)
  applyHubSetContents(catalog.products, hubSets, audit)
  catalog.parts = [...parts.values()]

  // 數值與圖片要在零件清單完整之後才套，否則後面才建立的零件拿不到。
  applyHubStats(catalog.parts, hubStats, audit, cxHubKeyByPartId)

  /*
   * 稽核是在逐筆處理商品時累加的，但社群與人工彙整的內容是之後才補上去的。
   * 不重算的話，已經補好的商品還會留在「內容未知」名單裡，看起來像沒補。
   */
  const stillEmpty = (row) => {
    const product = catalog.products.find((item) => item.id === row.id)
    return !product || product.contents.length === 0
  }
  audit.contentsUnknownProducts = audit.contentsUnknownProducts.filter(stillEmpty)
  // 商品名解析不出零件的那幾筆，若已由人工彙整補上內容，就不再算缺漏。
  audit.unparsedBeyProducts = audit.unparsedBeyProducts.filter(stillEmpty)

  addHubImages(catalog, hubStats, audit, cxHubKeyByPartId)
  applyLocalImageMirror(catalog, audit)
  audit.partCount = catalog.parts.length
  audit.tournamentEventCount = tournamentEvents.length
  audit.tournamentDeckCount = tournamentDecks.length
  audit.tournamentObservationCount = tournamentObservations.length
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
  console.log(
    `CX 上蓋拆成紋章＋主刃 ${audit.cxSplitBlades.length} 顆、` +
      `維持合併 ${audit.cxUnsplitBlades.length} 顆`,
  )
  console.log(`零件組成未解析：${audit.unparsedBeyProducts.length} 筆`)
  console.log(
    `內容未知：${audit.contentsUnknownProducts.length} 筆、` +
      `隨機包刻意不填：${audit.randomContentsByDesign.length} 筆、` +
      `無零件商品：${audit.noPartsProducts.length} 筆`,
  )
  console.log(`中文名稱未完全翻譯：${audit.untranslatedNames.length} 筆`)
  console.log(`賽事 ${tournamentEvents.length} 場、完整牌組 ${tournamentDecks.length} 副、來源觀測 ${tournamentObservations.length} 筆`)
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

function validateTournamentObservation(observation, partById) {
  if (typeof observation.reportedCombo !== 'string' || observation.reportedCombo.trim() === '') {
    return '缺少來源頁的原始配置文字'
  }
  if (!Array.isArray(observation.comboPartIds) || observation.comboPartIds.length !== 3) {
    return '觀測配置不是上蓋、固鎖、軸心三件式'
  }
  const [blade, ratchet, bit] = observation.comboPartIds.map((id) => partById.get(id))
  if (!blade || !ratchet || !bit) return `型錄找不到零件：${observation.comboPartIds.join(', ')}`
  if (!['blade', 'integrated_blade'].includes(blade.family) || ratchet.family !== 'ratchet' || bit.family !== 'bit') {
    return `零件家族不符：${observation.comboPartIds.join(', ')}`
  }
  return undefined
}

function comboKeyFromPartIds(ids, partById) {
  const [blade, ratchet, bit] = ids.map((id) => partById.get(id))
  return `${blade.code} ${ratchet.code}${bit.code}`
}

main()
