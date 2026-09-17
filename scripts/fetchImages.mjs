/**
 * 把圖鑑用到的外部圖片抓成本機副本。
 *
 * 規格對照：第 25 節（圖片來源與使用狀態必須可追蹤）。
 *
 * 背景：原本全部是外部連結，對方改路徑或擋掉就整批破圖。專案擁有者決定自存一份，
 * 所以這裡把圖片下載到 public/img/ 並改用本機路徑。
 *
 * 誠實界線：這不是取得授權，只是本機鏡像。因此
 *  - usageStatus 標 unknown（授權狀態未確認），不寫成 permission_granted
 *  - sourceName／sourceUrl／原始網址全部保留，前台照樣顯示來源
 *
 * 用法：npm run fetch:images
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CATALOG_FILE = resolve(root, 'src/catalog/catalog.generated.json')
const OUT_DIR = resolve(root, 'public/img')
const MAP_FILE = resolve(root, 'src/catalog/images.local.json')

/**
 * 顯示尺寸最大只到約 72px（詳情頁），原始官方 PNG 有到 2 MB，
 * 全部收進 PWA 會讓安裝包爆掉。縮到長邊 320px 就夠用。
 * sips 是 macOS 內建；其他平台抓不到就原樣保留，並在結尾提醒。
 */
const MAX_EDGE = 320
let resizeAvailable = true
function shrink(path) {
  if (!resizeAvailable) return false
  try {
    execFileSync('sips', ['-Z', String(MAX_EDGE), path, '--out', path], { stdio: 'ignore' })
    return true
  } catch {
    resizeAvailable = false
    return false
  }
}

const EXT_BY_TYPE = {
  'image/webp': 'webp',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/avif': 'avif',
}

const catalog = JSON.parse(readFileSync(CATALOG_FILE, 'utf8'))
const urls = [...new Set((catalog.images ?? []).map((image) => image.url))]
console.log(`要抓 ${urls.length} 個網址`)

mkdirSync(OUT_DIR, { recursive: true })

let previous = {}
try {
  previous = JSON.parse(readFileSync(MAP_FILE, 'utf8')).byUrl ?? {}
} catch {
  previous = {}
}

const byUrl = {}
const failed = []
let downloaded = 0
let reused = 0
let bytes = 0

async function fetchOne(url) {
  // 檔名用網址雜湊，來源改版時會自然變成新檔名。
  const hash = createHash('sha256').update(url).digest('hex').slice(0, 16)
  const known = previous[url]
  if (known && existsSync(resolve(root, 'public', known.replace(/^\//, '')))) {
    byUrl[url] = known
    reused += 1
    bytes += statSync(resolve(root, 'public', known.replace(/^\//, ''))).size
    return
  }
  try {
    const response = await fetch(url, {
      headers: { 'user-agent': 'beyblade-x-loadout/image-mirror' },
    })
    if (!response.ok) {
      failed.push({ url, reason: `HTTP ${response.status}` })
      return
    }
    const type = (response.headers.get('content-type') ?? '').split(';')[0]
    const ext = EXT_BY_TYPE[type]
    if (!ext) {
      failed.push({ url, reason: `不是支援的圖片格式：${type}` })
      return
    }
    const buffer = Buffer.from(await response.arrayBuffer())
    const file = `${hash}.${ext}`
    const path = resolve(OUT_DIR, file)
    writeFileSync(path, buffer)
    // webp 本來就小，只縮 png／jpg。
    if (ext === 'png' || ext === 'jpg') shrink(path)
    byUrl[url] = `/img/${file}`
    downloaded += 1
    bytes += statSync(path).size
  } catch (error) {
    failed.push({ url, reason: String(error) })
  }
}

const queue = [...urls]
await Promise.all(
  Array.from({ length: 6 }, async () => {
    for (;;) {
      const url = queue.shift()
      if (!url) return
      await fetchOne(url)
    }
  }),
)

writeFileSync(
  MAP_FILE,
  `${JSON.stringify(
    {
      note: '外部圖片的本機副本對應表。usageStatus 仍標 unknown：這是鏡像，不是取得授權。',
      fetchedAt: new Date().toISOString().slice(0, 10),
      count: Object.keys(byUrl).length,
      byUrl,
      failed,
    },
    null,
    2,
  )}\n`,
  'utf8',
)

const mb = (bytes / 1024 / 1024).toFixed(2)
console.log(`新抓 ${downloaded} 張、沿用 ${reused} 張，合計 ${Object.keys(byUrl).length} 張、${mb} MB`)
if (!resizeAvailable) {
  console.log('找不到 sips，圖片沒有縮小；在 macOS 以外的平台請自行壓縮 public/img。')
}
if (failed.length > 0) {
  console.log(`失敗 ${failed.length} 張：`)
  for (const row of failed.slice(0, 10)) console.log(`  ${row.reason} ${row.url}`)
  process.exitCode = 1
}
