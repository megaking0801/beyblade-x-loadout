import { describe, expect, it } from 'vitest'
import { catalog } from '../../src/catalog/index.ts'
import { getPartSources, NO_SOURCE_NOTE_ZH } from '../../src/domain/sources.ts'
import type { ComboSlots } from '../../src/domain/types.ts'

const BX01: ComboSlots = {
  bladeId: 'blade:ドランソード',
  ratchetId: 'ratchet:3-60',
  bitId: 'bit:F',
}

function sourcesFor(slots: ComboSlots, ownedPartIds?: string[]) {
  return getPartSources({
    slots,
    parts: catalog.parts,
    products: catalog.products,
    productVariants: catalog.productVariants,
    ...(ownedPartIds ? { ownedPartIds } : {}),
  })
}

describe('零件要去買哪一盒（第 8、14 節）', () => {
  it('沒選零件時不回傳任何來源', () => {
    expect(sourcesFor({})).toEqual([])
  })

  it('每個選到的零件都查得出含它的商品', () => {
    const sources = sourcesFor(BX01)
    expect(sources).toHaveLength(3)
    for (const source of sources) {
      expect(source.products.length).toBeGreaterThan(0)
      for (const product of source.products) {
        const product2 = catalog.products.find((row) => row.id === product.productId)
        expect(product2?.contents.some((entry) => entry.partId === source.partId)).toBe(true)
      }
    }
  })

  it('隨機強化組不列入保證取得，但會獨立列出官方確認的可能款式', () => {
    const randomIds = new Set(
      catalog.products.filter((product) => product.isRandom).map((product) => product.id),
    )
    expect(randomIds.size).toBeGreaterThan(0)
    for (const source of sourcesFor(BX01)) {
      for (const product of source.products) {
        expect(randomIds.has(product.productId)).toBe(false)
      }
    }
    const dranSword = sourcesFor(BX01).find((source) => source.partId === BX01.bladeId)
    expect(dranSword?.randomProducts).toContainEqual(
      expect.objectContaining({ sku: 'BX-14', matchingVariantCount: 1, totalVariantCount: 6 }),
    )
  })

  it('固定商品完整列出，只以型號與名稱做穩定排序，不推薦其中任何一款', () => {
    const products = sourcesFor(BX01)[0]?.products ?? []
    const keys = products.map((product) => `${product.sku ?? ''}\u0000${product.nameZhTW}`)
    expect(keys).toEqual([...keys].sort((a, b) => a.localeCompare(b)))
    // BX-00 版本 2.0 是限定品；仍要列出，不能因為系統預設它較難買而隱藏。
    expect(products.some((product) => product.sku === 'BX-00')).toBe(true)
  })

  it('查不到來源時有固定說明，不是留白', () => {
    expect(NO_SOURCE_NOTE_ZH).toContain('抽選池')
  })
})
