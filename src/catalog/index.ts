/**
 * Master Catalog 載入與驗證。
 *
 * 規格對照：第 24 節（初版 Seed Data）、第 41 節（來源與驗證）、第 42 節（Catalog Audit）。
 *
 * catalog.generated.json 由 `npm run build:catalog` 從官方商品一覽產生，請勿手改。
 */
import rawCatalog from './catalog.generated.json'
import rawAudit from './catalog-audit.json'
import type { CatalogBundle } from '../data/repository.ts'
import { JAPANESE_KANA } from '../domain/naming.ts'
import type { Part, Product } from '../domain/types.ts'

export interface CatalogAudit {
  catalogVersion: string
  sourceUrl: string
  fetchedAt: string
  generatedAt: string
  productCount: number
  partCount: number
  imageCount: number
  productsWithoutImages: { id: string; sku?: string }[]
  unparsedBeyProducts: { id: string; nameJa: string; reason: string }[]
  contentsUnknownProducts: { id: string; nameJa: string; reason: string }[]
  untranslatedNames: unknown[]
  knownGaps: string[]
}

export interface CatalogMeta {
  version: string
  sourceUrl: string
  fetchedAt: string
}

/** 日文假名判斷集中在 naming.ts，避免各處寫出不一致的字元範圍。 */
const KANA = JAPANESE_KANA

export interface CatalogIssue {
  entity: string
  id: string
  messageZhTW: string
}

/**
 * 第 42 節 Catalog Audit：發布前必須檢查的項目。
 * 回傳所有問題，呼叫端決定要擋還是只提醒。
 */
export function auditCatalog(bundle: CatalogBundle): CatalogIssue[] {
  const issues: CatalogIssue[] = []
  const partIds = new Set<string>()
  const productIds = new Set<string>()

  const checkNaming = (entity: string, id: string, naming: Part['naming']): void => {
    if (!naming.primaryZhTW?.trim()) {
      issues.push({ entity, id, messageZhTW: '缺少台灣中文主名稱' })
      return
    }
    if (KANA.test(naming.primaryZhTW)) {
      issues.push({ entity, id, messageZhTW: `主名稱含日文假名：${naming.primaryZhTW}` })
    }
  }

  for (const part of bundle.parts) {
    if (partIds.has(part.id)) issues.push({ entity: 'part', id: part.id, messageZhTW: '零件 id 重複' })
    partIds.add(part.id)
    if (!part.code?.trim()) issues.push({ entity: 'part', id: part.id, messageZhTW: '缺少型號' })
    if (part.provenance.sourceUrls.length === 0) {
      issues.push({ entity: 'part', id: part.id, messageZhTW: '缺少來源網址' })
    }
    checkNaming('part', part.id, part.naming)
  }

  for (const product of bundle.products) {
    if (productIds.has(product.id)) {
      issues.push({ entity: 'product', id: product.id, messageZhTW: '商品 id 重複' })
    }
    productIds.add(product.id)
    if (product.provenance.sourceUrls.length === 0) {
      issues.push({ entity: 'product', id: product.id, messageZhTW: '缺少來源網址' })
    }
    checkNaming('product', product.id, product.naming)

    for (const content of product.contents) {
      if (content.partId && !partIds.has(content.partId)) {
        issues.push({
          entity: 'product',
          id: product.id,
          messageZhTW: `內含零件不存在：${content.partId}`,
        })
      }
    }

    const expectsContents = !['tool', 'accessory'].includes(product.category)
    if (expectsContents && product.contents.length === 0 && !product.isRandom) {
      if (product.provenance.verificationStatus !== 'needs_review') {
        issues.push({
          entity: 'product',
          id: product.id,
          messageZhTW: '內容未知卻未標記為待查',
        })
      }
    }
  }

  for (const variant of bundle.productVariants) {
    if (!productIds.has(variant.productId)) {
      issues.push({
        entity: 'productVariant',
        id: variant.id,
        messageZhTW: `所屬商品不存在：${variant.productId}`,
      })
    }
  }

  return issues
}

const parsed = rawCatalog as unknown as CatalogBundle & CatalogMeta

/** 公共 Catalog。載入到 IndexedDB 時絕對不會動到個人 Inventory（第 3 節）。 */
export const catalog: CatalogBundle = {
  version: parsed.version,
  parts: parsed.parts,
  partVariants: parsed.partVariants,
  products: parsed.products,
  productVariants: parsed.productVariants,
  compatibilityRules: parsed.compatibilityRules,
  images: parsed.images,
  tournamentEvents: parsed.tournamentEvents ?? [],
  tournamentDecks: parsed.tournamentDecks ?? [],
}

export const catalogMeta: CatalogMeta = {
  version: parsed.version,
  sourceUrl: parsed.sourceUrl,
  fetchedAt: parsed.fetchedAt,
}

export const catalogAudit = rawAudit as unknown as CatalogAudit

/** 第 24 節：賽事資料不足時的固定訊息。 */
export const TOURNAMENT_PENDING_NOTICE = '尚無可對應此配裝的賽事資料'

export function findProduct(id: string): Product | undefined {
  return catalog.products.find((product) => product.id === id)
}
