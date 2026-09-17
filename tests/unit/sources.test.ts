import { describe, expect, it } from 'vitest'
import { catalog } from '../../src/catalog/index.ts'
import { getBestValueProduct, getPartSources, NO_SOURCE_NOTE_ZH } from '../../src/domain/sources.ts'
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

  it('隨機補充包不列入：官方沒公布固定內容，列進去等於暗示買了就會有', () => {
    const randomIds = new Set(
      catalog.products.filter((product) => product.isRandom).map((product) => product.id),
    )
    expect(randomIds.size).toBeGreaterThan(0)
    for (const source of sourcesFor(BX01)) {
      for (const product of source.products) {
        expect(randomIds.has(product.productId)).toBe(false)
      }
    }
  })

  it('推薦一般商品而不是限定品：型號結尾 -00 的排在後面', () => {
    // BX-01 與「BX-00 版本2.0」都含這三件，但後者是 B4 門市限定，買不到。
    const first = sourcesFor(BX01)[0]?.products[0]
    expect(first?.sku).toBe('BX-01')
  })

  it('最划算的一盒＝一次補到最多種缺件', () => {
    const best = getBestValueProduct(sourcesFor(BX01))
    expect(best?.sku).toBe('BX-01')
    expect(best?.coversPartCount).toBe(3)
  })

  it('全部零件都已擁有時不推薦購買，不製造需求', () => {
    const owned = ['blade:ドランソード', 'ratchet:3-60', 'bit:F']
    const sources = sourcesFor(BX01, owned)
    expect(sources.every((source) => source.owned)).toBe(true)
    expect(getBestValueProduct(sources)).toBeUndefined()
  })

  it('查不到來源時有固定說明，不是留白', () => {
    expect(NO_SOURCE_NOTE_ZH).toContain('隨機補充包')
  })
})
