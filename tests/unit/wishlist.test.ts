import { describe, expect, it } from 'vitest'
import { analyzeWishlistProduct } from '../../src/domain/wishlist.ts'
import type { InventoryLot, Part, Product, ProductVariant } from '../../src/domain/types.ts'

const prov = { sourceUrls: [], verificationStatus: 'official_verified' as const }

function part(over: Partial<Part> & Pick<Part, 'id' | 'family'>): Part {
  return {
    system: 'BX',
    code: over.id,
    naming: { primaryZhTW: `中文-${over.id}` },
    provenance: prov,
    ...over,
  }
}

const blade = part({ id: 'b-atk', family: 'blade', type: 'attack', spinDirection: 'right', officialWeightG: 34 })
const ratchet = part({ id: 'r-60', family: 'ratchet', code: '3-60', spinDirection: 'dual', heightCode: 60, officialWeightG: 6 })
const bit = part({ id: 'bit-f', family: 'bit', code: 'F', type: 'attack', spinDirection: 'dual', officialWeightG: 3, bitContact: 'flat' })
const parts = [blade, ratchet, bit]

const fixedProduct: Product = {
  id: 'prod-fixed',
  line: 'BX',
  category: 'starter',
  naming: { primaryZhTW: '測試入門組' },
  region: ['JP'],
  isRandom: false,
  contents: [
    { partId: bit.id, quantity: 1 },
    { accessoryName: '測試發射器', quantity: 1 },
  ],
  provenance: prov,
}

const randomProduct: Product = {
  id: 'prod-random',
  line: 'BX',
  category: 'random_booster',
  naming: { primaryZhTW: '測試隨機包' },
  region: ['JP'],
  isRandom: true,
  contents: [],
  provenance: prov,
}

const variants: ProductVariant[] = [
  {
    id: 'var-a',
    productId: randomProduct.id,
    variantNameZhTW: 'A 款',
    contents: [{ partId: bit.id, quantity: 1 }],
    provenance: prov,
  },
  {
    id: 'var-b',
    productId: randomProduct.id,
    variantNameZhTW: 'B 款',
    contents: [{ partId: blade.id, quantity: 1 }],
    provenance: prov,
  },
]

function lot(partId: string, quantity = 1): InventoryLot {
  return {
    id: `lot-${partId}`,
    sourceType: 'standalone_part',
    partId,
    quantity,
    status: 'available',
    condition: 'new',
    createdAt: '2026-01-01T00:00:00.000Z',
  }
}

const base = {
  parts,
  rules: [],
  combos: [],
  variants,
}

describe('想買清單影響分析（第 35 節）', () => {
  it('列出買這盒會新增哪些零件與數量', () => {
    const r = analyzeWishlistProduct({
      ...base,
      product: fixedProduct,
      lots: [lot(blade.id), lot(ratchet.id)],
      quantity: 1,
    })
    expect(r.addedParts).toEqual([{ partId: bit.id, nameZhTW: '中文-bit-f', quantity: 1 }])
  })

  it('多買幾盒時數量跟著乘', () => {
    const r = analyzeWishlistProduct({
      ...base,
      product: fixedProduct,
      lots: [],
      quantity: 3,
    })
    expect(r.addedParts[0]!.quantity).toBe(3)
  })

  it('配件單獨列出，不算進可配裝零件', () => {
    const r = analyzeWishlistProduct({
      ...base,
      product: fixedProduct,
      lots: [],
      quantity: 1,
    })
    expect(r.addedAccessories).toEqual([{ name: '測試發射器', quantity: 1 }])
    expect(r.addedParts.some((p) => p.partId === '測試發射器')).toBe(false)
  })

  it('算出可解鎖的新配裝數量（第 35 節）', () => {
    const r = analyzeWishlistProduct({
      ...base,
      product: fixedProduct,
      lots: [lot(blade.id), lot(ratchet.id)],
      quantity: 1,
    })
    expect(r.currentBuildableCount).toBe(0)
    expect(r.buildableCountAfterPurchase).toBe(1)
    expect(r.unlockedComboCount).toBe(1)
  })

  it('已經有這些零件時解鎖數為 0', () => {
    const r = analyzeWishlistProduct({
      ...base,
      product: fixedProduct,
      lots: [lot(blade.id), lot(ratchet.id), lot(bit.id)],
      quantity: 1,
    })
    expect(r.unlockedComboCount).toBe(0)
  })

  it('列出解鎖配裝的實際例子', () => {
    const r = analyzeWishlistProduct({
      ...base,
      product: fixedProduct,
      lots: [lot(blade.id), lot(ratchet.id)],
      quantity: 1,
    })
    expect(r.unlockedExamplesZhTW.length).toBeGreaterThan(0)
  })

  it('Random Booster 的內容不確定，必須標記且不得當成必得零件（第 13、1.5 節）', () => {
    const r = analyzeWishlistProduct({
      ...base,
      product: randomProduct,
      lots: [lot(ratchet.id)],
      quantity: 1,
    })
    expect(r.isUncertain).toBe(true)
    expect(r.uncertaintyNoticeZhTW).toBe('此商品為隨機內容，實際到手零件依開封結果而定')
    expect(r.addedParts).toEqual([])
  })

  it('Random Booster 會列出所有可能款式與其內容', () => {
    const r = analyzeWishlistProduct({
      ...base,
      product: randomProduct,
      lots: [lot(ratchet.id)],
      quantity: 1,
    })
    expect(r.possibleVariants).toEqual([
      { variantId: 'var-a', variantNameZhTW: 'A 款', partNamesZhTW: ['中文-bit-f'] },
      { variantId: 'var-b', variantNameZhTW: 'B 款', partNamesZhTW: ['中文-b-atk'] },
    ])
  })

  it('數量為 0 時不新增任何零件', () => {
    const r = analyzeWishlistProduct({ ...base, product: fixedProduct, lots: [], quantity: 0 })
    expect(r.addedParts).toEqual([])
    expect(r.unlockedComboCount).toBe(0)
  })
})
