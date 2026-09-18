import { describe, expect, it } from 'vitest'
import { recommendNextProducts } from '../../src/domain/recommendations.ts'
import type { InventoryLot, Part, Product, ProductVariant } from '../../src/domain/types.ts'

const provenance = { sourceUrls: [], verificationStatus: 'official_verified' as const }
const part = (id: string, family: Part['family'], type?: Part['type']): Part => ({
  id,
  family,
  system: 'BX',
  code: id,
  naming: { primaryZhTW: id },
  type,
  spinDirection: family === 'blade' ? 'right' : 'dual',
  provenance,
})
const blade = part('blade', 'blade', 'attack')
const ratchet = part('ratchet', 'ratchet')
const bit = { ...part('bit', 'bit', 'attack'), bitContact: 'flat' as const }
const fixed: Product = {
  id: 'fixed', line: 'BX', category: 'starter', naming: { primaryZhTW: '固定包' }, region: ['JP'], isRandom: false,
  contents: [{ partId: bit.id, quantity: 1 }], provenance,
}
const random: Product = {
  id: 'random', line: 'BX', category: 'random_booster', naming: { primaryZhTW: '隨機包' }, region: ['JP'], isRandom: true,
  contents: [], provenance,
}
const variants: ProductVariant[] = [{ id: 'random-a', productId: random.id, variantNameZhTW: 'A', contents: [{ partId: bit.id, quantity: 1 }], provenance }]
const lot = (partId: string): InventoryLot => ({ id: `lot-${partId}`, sourceType: 'standalone_part', partId, quantity: 1, status: 'available', condition: 'new', createdAt: '' })

describe('下一包推薦', () => {
  it('將保證內容商品依模擬的可用配裝提升排序，隨機包獨立列出', () => {
    const result = recommendNextProducts({
      products: [random, fixed],
      variants,
      ownedProducts: [],
      parts: [blade, ratchet, bit],
      rules: [],
      lots: [lot(blade.id), lot(ratchet.id)],
      combos: [],
    })
    expect(result.recommendations).toHaveLength(1)
    expect(result.recommendations[0]?.product.id).toBe(fixed.id)
    expect(result.recommendations[0]?.rank).toBe(1)
    expect(result.recommendations[0]?.unlockedExamplesZhTW).toHaveLength(1)
    expect(result.randomProducts).toEqual([{ product: random, possiblePartNamesZhTW: [bit.id] }])
  })
})
