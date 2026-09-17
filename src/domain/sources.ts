/**
 * 「這顆零件要去買哪一盒」。
 *
 * 規格對照：第 8 節（商品內容）、第 14 節（想買清單）、第 46 節（主流程引導）。
 *
 * 為什麼需要：配裝器算得出一套配置，但使用者下一個問題一定是「那我要買什麼」。
 * 零件不單賣，只能透過商品取得，這一層就是把零件反查回商品。
 *
 * 只回報圖鑑裡確實記載內容的商品。隨機補充包即使可能開出這顆也不列入 ——
 * 官方沒有公布固定內容，列進去等於暗示買了就會有（第 1.5、13 節）。
 */
import type { ComboSlots, Part, Product } from './types.ts'
import { PART_FAMILY_ZH } from './types.ts'
import { resolveDisplayName } from './naming.ts'

/**
 * 型號結尾是 -00 的商品沒有正式編號：限定色、聯名、門市獨佔、抽選品。
 * 推薦「去買哪一盒」時要排在一般商品後面，不然會叫人去買買不到的東西。
 */
function isLimitedSku(sku: string | undefined): boolean {
  return !sku || /-0+$/u.test(sku)
}

export interface PartSourceProduct {
  productId: string
  sku?: string
  nameZhTW: string
  /** 這一盒裡有幾個這顆零件。 */
  quantity: number
  /** 這一盒同時補到這套配裝的幾種零件；一次補越多越值得買。 */
  coversPartCount: number
  /** 這一盒總共含幾件零件，用來在補的件數相同時挑比較單純的那盒。 */
  totalPartCount: number
}

export interface PartSource {
  partId: string
  familyZhTW: string
  nameZhTW: string
  /** 使用者目前庫存是否已經有這顆；缺的才需要買。 */
  owned: boolean
  products: PartSourceProduct[]
}

/**
 * 逐顆零件列出可以買到它的商品。
 *
 * 排序規則：
 *  1. 能同時補到越多種零件的排前面（買一盒解決兩三件最划算）
 *  2. 有編號的一般商品排在無編號的前面 —— 型號結尾是 -00 的是限定、聯名或
 *     門市獨佔品（BX-00 版本2.0 是 B4 門市限定），買不到的東西推薦了也沒用
 *  3. 補的件數一樣時，內容越單純的排前面 —— 一盒剛好就是這顆陀螺的入門組，
 *     比同樣含這三件的「25 週年紀念套組」好買太多
 *  4. 最後才比型號，讓輸出穩定
 */
export function getPartSources(args: {
  slots: ComboSlots
  parts: Part[]
  products: Product[]
  /** 目前庫存已經有的零件 id；沒傳就一律當成缺件。 */
  ownedPartIds?: Iterable<string>
}): PartSource[] {
  const selected = Object.values(args.slots).filter((id): id is string => Boolean(id))
  if (selected.length === 0) return []

  const selectedSet = new Set(selected)
  const owned = new Set(args.ownedPartIds ?? [])
  const partById = new Map(args.parts.map((part) => [part.id, part]))

  /** 每個商品補到這套配裝的哪幾種零件，用來算「一次補幾件」。 */
  const coverageByProduct = new Map<string, Set<string>>()
  for (const product of args.products) {
    if (product.isRandom) continue
    const covered = new Set<string>()
    for (const entry of product.contents) {
      if (entry.partId && selectedSet.has(entry.partId)) covered.add(entry.partId)
    }
    if (covered.size > 0) coverageByProduct.set(product.id, covered)
  }

  const sources: PartSource[] = []
  for (const partId of selected) {
    const part = partById.get(partId)
    if (!part) continue

    const products: PartSourceProduct[] = []
    for (const product of args.products) {
      if (product.isRandom) continue
      const quantity = product.contents
        .filter((entry) => entry.partId === partId)
        .reduce((sum, entry) => sum + entry.quantity, 0)
      if (quantity === 0) continue
      products.push({
        productId: product.id,
        ...(product.sku ? { sku: product.sku } : {}),
        nameZhTW: resolveDisplayName(product.naming).titleZhTW,
        quantity,
        coversPartCount: coverageByProduct.get(product.id)?.size ?? 1,
        totalPartCount: product.contents.reduce((sum, entry) => sum + entry.quantity, 0),
      })
    }

    products.sort(
      (a, b) =>
        b.coversPartCount - a.coversPartCount ||
        Number(isLimitedSku(a.sku)) - Number(isLimitedSku(b.sku)) ||
        a.totalPartCount - b.totalPartCount ||
        b.quantity - a.quantity ||
        (a.sku ?? '').localeCompare(b.sku ?? ''),
    )

    sources.push({
      partId,
      familyZhTW: PART_FAMILY_ZH[part.family],
      nameZhTW: resolveDisplayName(part.naming).titleZhTW,
      owned: owned.has(partId),
      products,
    })
  }
  return sources
}

/**
 * 只買一盒的話買哪一盒最值得。
 *
 * 判斷依據是「一次補到最多種缺件」。全部都有了就回 undefined ——
 * 沒有缺件時推薦一盒購買是在製造需求，不是幫忙。
 */
export function getBestValueProduct(sources: PartSource[]): PartSourceProduct | undefined {
  const missing = sources.filter((source) => !source.owned)
  if (missing.length === 0) return undefined

  const scoreByProduct = new Map<string, { product: PartSourceProduct; covers: Set<string> }>()
  for (const source of missing) {
    for (const product of source.products) {
      const existing = scoreByProduct.get(product.productId)
      if (existing) {
        existing.covers.add(source.partId)
        continue
      }
      scoreByProduct.set(product.productId, { product, covers: new Set([source.partId]) })
    }
  }

  const ranked = [...scoreByProduct.values()].sort(
    (a, b) =>
      b.covers.size - a.covers.size ||
      Number(isLimitedSku(a.product.sku)) - Number(isLimitedSku(b.product.sku)) ||
      a.product.totalPartCount - b.product.totalPartCount ||
      (a.product.sku ?? '').localeCompare(b.product.sku ?? ''),
  )
  const best = ranked[0]
  if (!best) return undefined
  return { ...best.product, coversPartCount: best.covers.size }
}

/** 沒有任何商品收錄這顆零件時的說明，不要只留空白。 */
export const NO_SOURCE_NOTE_ZH =
  '圖鑑裡沒有記載固定內容的商品含這顆零件；它可能只出現在隨機補充包，或還沒收錄。'
