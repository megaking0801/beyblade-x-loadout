import { describe, expect, it } from 'vitest'
import { catalog } from '../../src/catalog/index.ts'
import { getPartSources, NO_SOURCE_NOTE_ZH } from '../../src/domain/sources.ts'
import type { ComboSlots, Part } from '../../src/domain/types.ts'

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

/** getPartSources 的輸入是配裝槽位；稽核時依零件種類放進對應槽位即可。 */
function sourceForPart(part: Part) {
  const slots: ComboSlots =
    part.family === 'blade' || part.family === 'integrated_blade'
      ? { bladeId: part.id }
      : part.family === 'ratchet'
        ? { ratchetId: part.id }
        : part.family === 'bit'
          ? { bitId: part.id }
          : part.family === 'lock_chip'
            ? { lockChipId: part.id }
            : part.family === 'main_blade'
              ? { mainBladeId: part.id }
              : part.family === 'over_blade'
                ? { overBladeId: part.id }
                : part.family === 'assist_blade'
                  ? { assistBladeId: part.id }
                  : {}
  return sourcesFor(slots)[0]
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

  it('E 軸會列出所有已映射的官方隨機強化組', () => {
    const eAxis = sourcesFor({ bitId: 'bit:E' }).find((source) => source.partId === 'bit:E')
    expect(eAxis?.randomProducts.map((product) => product.sku)).toEqual(['BX-36', 'BX-48', 'UX-12'])
  })

  it('全圖鑑每個零件的購買來源，都和固定內容與官方隨機款式完全一致', () => {
    for (const part of catalog.parts) {
      const source = sourceForPart(part)
      expect(source, `${part.id} 應該能建立購買來源`).toBeDefined()

      const expectedFixed = catalog.products
        .filter((product) => !product.isRandom && product.contents.some((entry) => entry.partId === part.id))
        .map((product) => product.id)
        .sort()
      const actualFixed = source!.products.map((product) => product.productId).sort()
      expect(actualFixed, `${part.id} 的固定商品來源不完整或多列`).toEqual(expectedFixed)

      const expectedRandom = catalog.products
        .filter(
          (product) =>
            product.isRandom &&
            catalog.productVariants
              .filter((variant) => variant.productId === product.id)
              .some((variant) => variant.contents.some((entry) => entry.partId === part.id)),
        )
        .map((product) => product.id)
        .sort()
      const actualRandom = source!.randomProducts.map((product) => product.productId).sort()
      expect(actualRandom, `${part.id} 的隨機強化組來源不完整或多列`).toEqual(expectedRandom)
    }
  })

  it('查不到來源時有固定說明，不是留白', () => {
    expect(NO_SOURCE_NOTE_ZH).toContain('抽選池')
  })
})
