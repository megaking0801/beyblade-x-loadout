/**
 * 從 BeybladeHub 擷取零件數值，輸出 src/catalog/sources/beybladehub-stats.json。
 *
 * 規格對照：第 20 節（強度分析需要類型／重量／旋向）、第 41 節（來源與驗證）、
 * 第 1.5 節（不得編造資料）。
 *
 * 為什麼需要這一份：Takara Tomy 官方商品頁不公布零件的重量、類型與旋向，
 * 少了這些欄位，配裝分析每一項都只能顯示「資料不足」，等於沒有功能。
 * BeybladeHub 是台灣社群整理的圖鑑，數值來自玩家實測，不是官方值，
 * 因此這份資料一律標 community_measured，前台要標示「社群實測」。
 *
 * 用法：node scripts/fetchHubStats.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const OUT_FILE = resolve(root, 'src/catalog/sources/beybladehub-stats.json')

const ORIGIN = 'https://beybladehub.app'
const PAGES = {
  blade: '/parts/blades',
  ratchet: '/parts/ratchets',
  bit: '/parts/bits',
}

// BeybladeHub 的徽章寫「防守」，不是「防禦」；兩種都收，少收一種會讓防禦型整批沒有類型。
const TYPE_BY_ZH = { 攻擊: 'attack', 防守: 'defense', 防禦: 'defense', 持久: 'stamina', 均衡: 'balance' }
const SPIN_BY_ZH = { 右旋: 'right', 左旋: 'left', 雙旋: 'dual' }
const CONTACT_BY_ZH = {
  平坦: 'flat',
  球形: 'ball',
  尖端: 'point',
  針狀: 'needle',
  橡膠: 'rubber',
}

async function fetchText(path) {
  const response = await fetch(`${ORIGIN}${path}`, {
    headers: { 'user-agent': 'beyblade-x-loadout/catalog-builder' },
  })
  if (!response.ok) throw new Error(`${path} 回應 ${response.status}`)
  return response.text()
}

/** 卡片是以 id="<family>-<key>" 開頭的一段 HTML，按這個切開再逐段解析。 */
function splitCards(html, family) {
  const parts = html.split(new RegExp(`id="${family}-([A-Za-z0-9_-]+)"`))
  const cards = []
  for (let i = 1; i < parts.length; i += 2) {
    cards.push({ key: parts[i], html: parts[i + 1].slice(0, 3000) })
  }
  return cards
}

function pick(pattern, html) {
  return pattern.exec(html)?.[1]?.trim()
}

function parseCard(family, key, html) {
  // 卡片分成「可見區」與 class="hidden" 的詳細區；英文／日文名只在詳細區，
  // 可見區的同款標記是卡片標題（軸心會是「F」這種代號），抓錯就會蓋掉真正的名稱。
  const hiddenAt = html.indexOf('class="hidden"')
  const detail = hiddenAt >= 0 ? html.slice(hiddenAt) : ''

  const typeZh = pick(/>(攻擊|防守|防禦|持久|均衡)</u, html)
  const spinZh = pick(/>(右旋|左旋|雙旋)</u, html)
  // 重量有兩種寫法：詳細區的「重量 34.8g」，以及圖片 alt 的「… 重量 34.8g」。
  const weightG =
    pick(/<span class="text-gray-500">重量<\/span><span[^>]*>([\d.]+)g</u, html) ??
    pick(/alt="[^"]*重量\s*([\d.]+)g"/u, html)
  const contactAny = pick(/>([^<>]{1,4})<!-- -->軸</u, html)
  const nameJa = pick(/<span class="text-gray-500">([぀-ヿー・]+)<\/span>/u, detail)
  const nameEn = pick(/Russo_One&#x27;\]">([A-Za-z][A-Za-z '.-]*)</u, detail)
  const description = pick(/<p class="text-gray-400 leading-relaxed pt-0\.5">([^<]+)<\/p>/u, html)
  // 卡片標題的中文名，套裝內容那支腳本要靠它把 CX 的紋章與主刃拼回合併件名稱。
  const zhTW = pick(/font-bold text-white truncate[^>]*>([^<]+)</u, html)
  // 單件去背圖。官方商品圖是整盒包裝（常常還是背面），在手機上縮成 44px 根本看不出是哪顆。
  const imageUrl = pick(/<img src="(https:\/\/img\.beybladehub\.app\/[^"]+)"/u, html)

  const entry = { family, key }
  if (typeZh) entry.type = TYPE_BY_ZH[typeZh]
  if (spinZh) entry.spinDirection = SPIN_BY_ZH[spinZh]
  if (weightG) entry.officialWeightG = Number(weightG)
  if (family === 'bit' && contactAny && CONTACT_BY_ZH[contactAny]) {
    entry.bitContact = CONTACT_BY_ZH[contactAny]
  } else if (family === 'bit' && contactAny) {
    entry.bitContact = 'other'
  }
  if (nameJa) entry.nameJa = nameJa
  if (nameEn) entry.nameEn = nameEn
  if (zhTW) entry.zhTW = zhTW
  if (imageUrl) entry.imageUrl = imageUrl
  if (description) entry.descriptionZhTW = description
  return entry
}

const rows = []
for (const [family, path] of Object.entries(PAGES)) {
  const html = await fetchText(path)
  const cards = splitCards(html, family)
  for (const card of cards) rows.push({ ...parseCard(family, card.key, card.html), sourcePath: path })
  console.log(`${family}: ${cards.length} 筆`)
}

mkdirSync(dirname(OUT_FILE), { recursive: true })
writeFileSync(
  OUT_FILE,
  `${JSON.stringify(
    {
      source: 'BeybladeHub',
      sourceUrls: Object.values(PAGES).map((path) => `${ORIGIN}${path}`),
      fetchedAt: new Date().toISOString().slice(0, 10),
      note: '玩家實測值，非 Takara Tomy 官方公布資料；前台需標示為社群實測。',
      parts: rows,
    },
    null,
    2,
  )}\n`,
  'utf8',
)
console.log(`寫入 ${OUT_FILE}，共 ${rows.length} 筆`)
