/**
 * 取得商品主圖「外部連結」，不下載、不複製、不重散布任何圖檔。
 *
 * 優先用官方商品頁。官方舊頁的檔案已失效時，才以 Rakuten 搜尋結果中「型號與商品名皆
 * 命中」的圖片做備援；同樣僅作外部連結，並將電商來源明確保留。此腳本應在更新商品
 * 一覽後手動執行，避免一般 build 產生網路依賴。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const SOURCE_FILE = resolve(root, 'src/catalog/sources/takaratomy-lineup.psv')
const OUT_FILE = resolve(root, 'src/catalog/images.generated.json')
const AUDIT_FILE = resolve(root, 'src/catalog/catalog-images-audit.json')
const SITE_ORIGIN = 'https://beyblade.takaratomy.co.jp'
const SOURCE_NAME = 'Takara Tomy BEYBLADE X 官方商品頁'
const RAKUTEN_SOURCE_NAME = 'Rakuten 日本樂天市場商品搜尋（外部圖片連結）'
const AMAZON_SOURCE_NAME = 'Amazon Japan 商品搜尋（外部圖片連結）'
const CONCURRENCY = 6

function products() {
  return readFileSync(SOURCE_FILE, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const [sku, nameJa, , , path] = line.split('|')
      const id = path.split('/').pop().replace(/\.html$/, '')
      return { id, sku, nameJa, url: new URL(path, SITE_ORIGIN).href }
    })
}

function extractMainImage(html, pageUrl) {
  const match = html.match(/<img\s+src="([^"]*\/detail_[^"]+\.(?:png|jpe?g|webp))"/i)
  return match ? new URL(match[1], pageUrl).href : null
}

function attribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}="([^"]*)"`, 'i'))
  return match?.[1]
}

function normalized(value) {
  return value.replace(/\s+/g, '').replace(/[：:・]/g, '').toLowerCase()
}

/** Rakuten 搜尋頁會列出商品圖片；只接受型號、商品名關鍵詞都匹配的第一張。 */
async function findRakutenImage(product) {
  const query = `${product.sku} ${product.nameJa}`
  const sourceUrl = `https://search.rakuten.co.jp/search/mall/${encodeURIComponent(query)}/`
  try {
    const response = await fetch(sourceUrl, {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; BeybladeCatalog/1.0)' },
      signal: AbortSignal.timeout(20_000),
    })
    if (!response.ok) return { reason: `Rakuten 搜尋 HTTP ${response.status}` }
    const targetName = normalized(product.nameJa)
    const significant = targetName.length >= 6 ? targetName.slice(0, Math.min(targetName.length, 8)) : targetName
    const candidates = [...(await response.text()).matchAll(/<img\b[^>]*>/gi)]
      .map((match) => ({ tag: match[0], url: attribute(match[0], 'src'), alt: attribute(match[0], 'alt') ?? '' }))
      .filter((candidate) => candidate.url?.startsWith('https://tshop.r10s.jp/'))
      .filter((candidate) => {
        const alt = normalized(candidate.alt)
        // BX-00／CX-00 是官方共用型號，電商標題往往省略它；此時以商品名匹配。
        // 其他型號仍須雙重匹配，避免搜尋結果誤選同系列其他商品。
        const genericSku = /^(?:BX|UX|CX)-00$/.test(product.sku)
        return (genericSku || alt.includes(normalized(product.sku))) && alt.includes(significant)
      })
    const chosen = candidates[0]
    if (!chosen?.url) return { reason: 'Rakuten 搜尋找不到型號與商品名皆匹配的圖片' }
    const imageResponse = await fetch(chosen.url, { signal: AbortSignal.timeout(20_000) })
    if (!imageResponse.ok || !imageResponse.headers.get('content-type')?.startsWith('image/')) {
      return { reason: 'Rakuten 圖片連結不可用' }
    }
    return { url: chosen.url, sourceUrl, sourceName: RAKUTEN_SOURCE_NAME }
  } catch (error) {
    return { reason: error instanceof Error ? `Rakuten 搜尋失敗：${error.message}` : 'Rakuten 搜尋失敗' }
  }
}

async function findAmazonImage(product) {
  const sourceUrl = `https://www.amazon.co.jp/s?k=${encodeURIComponent(`${product.sku} ${product.nameJa}`)}`
  try {
    const response = await fetch(sourceUrl, {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; BeybladeCatalog/1.0)' },
      signal: AbortSignal.timeout(20_000),
    })
    if (!response.ok) return { reason: `Amazon 搜尋 HTTP ${response.status}` }
    const targetName = normalized(product.nameJa)
    const significant = targetName.slice(0, Math.min(targetName.length, 8))
    const candidates = [...(await response.text()).matchAll(/<img\b[^>]*>/gi)]
      .map((match) => ({ tag: match[0], url: attribute(match[0], 'src'), alt: attribute(match[0], 'alt') ?? '' }))
      .filter((candidate) => candidate.url?.startsWith('https://m.media-amazon.com/images/'))
      .filter((candidate) => normalized(candidate.alt).includes(significant))
    const chosen = candidates[0]
    if (!chosen?.url) return { reason: 'Amazon 搜尋找不到商品名匹配的圖片' }
    const imageResponse = await fetch(chosen.url, { signal: AbortSignal.timeout(20_000) })
    if (!imageResponse.ok || !imageResponse.headers.get('content-type')?.startsWith('image/')) {
      return { reason: 'Amazon 圖片連結不可用' }
    }
    return { url: chosen.url, sourceUrl, sourceName: AMAZON_SOURCE_NAME }
  } catch (error) {
    return { reason: error instanceof Error ? `Amazon 搜尋失敗：${error.message}` : 'Amazon 搜尋失敗' }
  }
}

async function mapWithConcurrency(items, callback) {
  const results = []
  let index = 0
  async function worker() {
    while (index < items.length) {
      const current = index
      index += 1
      results[current] = await callback(items[current])
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker))
  return results
}

const rows = products()
const results = await mapWithConcurrency(rows, async (product) => {
  try {
    const response = await fetch(product.url, { signal: AbortSignal.timeout(20_000) })
    if (!response.ok) {
      const fallback = await findRakutenImage(product)
      if (fallback.url) return { product, ...fallback }
      const amazon = await findAmazonImage(product)
      return amazon.url ? { product, ...amazon } : { product, reason: `官方頁 HTTP ${response.status}；${fallback.reason}；${amazon.reason}` }
    }
    const url = extractMainImage(await response.text(), product.url)
    if (!url) {
      const fallback = await findRakutenImage(product)
      if (fallback.url) return { product, ...fallback }
      const amazon = await findAmazonImage(product)
      return amazon.url ? { product, ...amazon } : { product, reason: `找不到官方商品主圖；${fallback.reason}；${amazon.reason}` }
    }
    // 官方舊商品頁有時仍引用已移除的圖檔；不可把 404 URL 寫進 Catalog。
    const imageResponse = await fetch(url, { signal: AbortSignal.timeout(20_000) })
    if (!imageResponse.ok) {
      const fallback = await findRakutenImage(product)
      if (fallback.url) return { product, ...fallback }
      const amazon = await findAmazonImage(product)
      return amazon.url ? { product, ...amazon } : { product, reason: `官方商品主圖 HTTP ${imageResponse.status}；${fallback.reason}；${amazon.reason}` }
    }
    if (!imageResponse.headers.get('content-type')?.startsWith('image/')) {
      const fallback = await findRakutenImage(product)
      if (fallback.url) return { product, ...fallback }
      const amazon = await findAmazonImage(product)
      return amazon.url ? { product, ...amazon } : { product, reason: `官方商品主圖不是圖片格式；${fallback.reason}；${amazon.reason}` }
    }
    return { product, url, sourceUrl: product.url, sourceName: SOURCE_NAME }
  } catch (error) {
    return { product, reason: error instanceof Error ? error.message : '讀取失敗' }
  }
})

const images = results
  .filter((result) => result.url)
  .map((result) => ({
    id: `product:${result.product.id}:main`,
    entityType: 'product',
    entityId: result.product.id,
    url: result.url,
    sourceUrl: result.sourceUrl,
    sourceName: result.sourceName,
    ...(result.sourceName === SOURCE_NAME ? { copyrightOwner: 'Takara Tomy' } : {}),
    usageStatus: 'link_only',
  }))

const unresolved = results
  .filter((result) => !result.url)
  .map((result) => ({ id: result.product.id, sku: result.product.sku, reason: result.reason }))

writeFileSync(OUT_FILE, `${JSON.stringify(images, null, 2)}\n`, 'utf8')
writeFileSync(
  AUDIT_FILE,
  `${JSON.stringify({ sources: [SOURCE_NAME, RAKUTEN_SOURCE_NAME, AMAZON_SOURCE_NAME], generatedAt: new Date().toISOString(), productCount: rows.length, imageCount: images.length, officialImageCount: images.filter((image) => image.sourceName === SOURCE_NAME).length, rakutenImageCount: images.filter((image) => image.sourceName === RAKUTEN_SOURCE_NAME).length, amazonImageCount: images.filter((image) => image.sourceName === AMAZON_SOURCE_NAME).length, unresolved }, null, 2)}\n`,
  'utf8',
)

console.log(`外部主圖 ${images.length}/${rows.length} 筆（官方 ${images.filter((image) => image.sourceName === SOURCE_NAME).length}、Rakuten ${images.filter((image) => image.sourceName === RAKUTEN_SOURCE_NAME).length}、Amazon ${images.filter((image) => image.sourceName === AMAZON_SOURCE_NAME).length}）；未取得 ${unresolved.length} 筆`)
