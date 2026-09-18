/**
 * 「這顆零件要去買哪一盒」。
 *
 * 規格對照：第 8 節（商品內容）、第 14 節（想買清單）、第 46 節（主流程引導）。
 *
 * 為什麼需要：配裝器算得出一套配置，但使用者下一個問題一定是「那我要買什麼」。
 * 零件不單賣，只能透過商品取得，這一層就是把零件反查回商品。
 *
 * 固定內容與隨機強化組分開回報：前者可保證取得，後者只顯示官方確認的可能款式，
 * 不得混進「最划算」或保證購買來源（第 1.5、13 節）。
 */
import type { ComboSlots, Part, Product, ProductVariant } from './types.ts'
import { PART_FAMILY_ZH } from './types.ts'
import { resolveDisplayName } from './naming.ts'

/** 商品庫用的限定品辨識；不參與配裝來源的排序或推薦。 */
export function isLimitedSku(sku: string | undefined): boolean {
  return !sku || /-0+$/u.test(sku)
}

export interface PartSourceProduct {
  productId: string
  sku?: string
  nameZhTW: string
  /** 這一盒裡有幾個這顆零件。 */
  quantity: number
}

/** 隨機強化組的「可抽到」來源；不保證一盒會拿到，故獨立於 products。 */
export interface PartRandomSourceProduct {
  productId: string
  sku?: string
  nameZhTW: string
  /** 此零件出現在該商品官方列出的幾個可能款式中。 */
  matchingVariantCount: number
  totalVariantCount: number
  sourceUrl: string
}

export interface PartSource {
  partId: string
  familyZhTW: string
  nameZhTW: string
  /** 使用者目前庫存是否已經有這顆；缺的才需要買。 */
  owned: boolean
  /** 固定內容，買到即取得。 */
  products: PartSourceProduct[]
  /** 官方列出的可能款式，僅供辨識抽選來源，不保證取得。 */
  randomProducts: PartRandomSourceProduct[]
}

/**
 * 逐顆零件列出可以買到它的商品。
 *
 * 商品只依型號、名稱做穩定排序，不評比或推薦任何一盒。
 */
export function getPartSources(args: {
  slots: ComboSlots
  parts: Part[]
  products: Product[]
  productVariants?: ProductVariant[]
  /** 目前庫存已經有的零件 id；沒傳就一律當成缺件。 */
  ownedPartIds?: Iterable<string>
}): PartSource[] {
  const selected = Object.values(args.slots).filter((id): id is string => Boolean(id))
  if (selected.length === 0) return []

  const owned = new Set(args.ownedPartIds ?? [])
  const partById = new Map(args.parts.map((part) => [part.id, part]))

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
      })
    }

    products.sort((a, b) =>
      (a.sku ?? '').localeCompare(b.sku ?? '') || a.nameZhTW.localeCompare(b.nameZhTW),
    )

    const randomProducts = args.products
      .filter((product) => product.isRandom)
      .map((product) => {
        const variants = (args.productVariants ?? []).filter((variant) => variant.productId === product.id)
        const matchingVariantCount = variants.filter((variant) =>
          variant.contents.some((entry) => entry.partId === partId),
        ).length
        if (matchingVariantCount === 0) return undefined
        return {
          productId: product.id,
          ...(product.sku ? { sku: product.sku } : {}),
          nameZhTW: resolveDisplayName(product.naming).titleZhTW,
          matchingVariantCount,
          totalVariantCount: variants.length,
          sourceUrl: variants[0]?.provenance.sourceUrls[0] ?? product.provenance.sourceUrls[0] ?? '',
        }
      })
      .filter((product): product is PartRandomSourceProduct => Boolean(product))
      .sort((a, b) =>
        (a.sku ?? '').localeCompare(b.sku ?? '') || a.nameZhTW.localeCompare(b.nameZhTW),
      )

    sources.push({
      partId,
      familyZhTW: PART_FAMILY_ZH[part.family],
      nameZhTW: resolveDisplayName(part.naming).titleZhTW,
      owned: owned.has(partId),
      products,
      randomProducts,
    })
  }
  return sources
}

/** 沒有任何商品收錄這顆零件時的說明，不要只留空白。 */
export const NO_SOURCE_NOTE_ZH =
  '圖鑑沒有記載固定內容或已確認抽選池含這顆零件。'
