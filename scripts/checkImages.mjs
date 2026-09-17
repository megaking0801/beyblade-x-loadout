/**
 * 檢查圖鑑用到的所有外部圖片是否還取得到。
 *
 * 規格對照：第 25 節（圖片只連結、不重新散布；要能追蹤來源）、
 * 第 47.1 節（不能只靠推論，要實際跑驗證）。
 *
 * 圖片全部是外部連結，對方隨時可能改路徑或擋掉，所以這支要能隨時重跑。
 * 用法：npm run check:images
 */
import { readFileSync, existsSync, statSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
/*
 * 要檢查的是「實際會被 App 用到的」那份，也就是產生出來的圖鑑裡的 images。
 * images.generated.json 只是商品圖的中間產物，單靠它會漏掉 135 張零件圖。
 */
const catalog = JSON.parse(readFileSync(resolve(root, 'src/catalog/catalog.generated.json'), 'utf8'))

const KIND_ZH = { product: '商品圖', product_variant: '款式圖', part: '零件圖', part_variant: '零件款式圖' }
const targets = (catalog.images ?? []).map((image) => ({
  kind: KIND_ZH[image.entityType] ?? image.entityType,
  id: image.entityId,
  url: image.url,
  local: image.isLocalMirror === true,
}))

console.log(`要檢查 ${targets.length} 張圖片`)

const CONCURRENCY = 8
const broken = []
const byHost = new Map()

async function head(target) {
  // 本機副本檢查檔案在不在、是不是空的就好，不用連外。
  if (target.local) {
    byHost.set('本機 public/img', (byHost.get('本機 public/img') ?? 0) + 1)
    const path = resolve(root, 'public', target.url.replace(/^\//, ''))
    if (!existsSync(path)) {
      broken.push({ ...target, reason: '本機副本不存在（跑 npm run fetch:images）' })
      return
    }
    if (statSync(path).size === 0) {
      broken.push({ ...target, reason: '本機副本是空檔' })
    }
    return
  }
  const host = new URL(target.url).host
  byHost.set(host, (byHost.get(host) ?? 0) + 1)
  try {
    const response = await fetch(target.url, {
      method: 'GET',
      headers: { 'user-agent': 'beyblade-x-loadout/image-check', range: 'bytes=0-0' },
    })
    const type = response.headers.get('content-type') ?? ''
    if (!response.ok) {
      broken.push({ ...target, reason: `HTTP ${response.status}` })
      return
    }
    if (!type.startsWith('image/')) {
      broken.push({ ...target, reason: `content-type 不是圖片：${type}` })
    }
  } catch (error) {
    broken.push({ ...target, reason: `取得失敗：${String(error)}` })
  }
}

const queue = [...targets]
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      const target = queue.shift()
      if (!target) return
      await head(target)
    }
  }),
)

console.log('來源網域:', Object.fromEntries(byHost))
if (broken.length === 0) {
  console.log('全部可取得。')
} else {
  console.log(`\n取不到 ${broken.length} 張：`)
  for (const row of broken) console.log(`  ${row.kind} ${row.id} ${row.reason}\n    ${row.url}`)
  process.exitCode = 1
}
