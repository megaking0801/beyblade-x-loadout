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
const bladeA = part('blade-a', 'blade', 'attack')
const bladeB = part('blade-b', 'blade', 'stamina')
const bladeC = part('blade-c', 'blade', 'defense')
const ratchetA = { ...part('ratchet-a', 'ratchet'), code: '1-60', heightCode: 60 }
const ratchetB = { ...part('ratchet-b', 'ratchet'), code: '3-60', heightCode: 60 }
const ratchetC = { ...part('ratchet-c', 'ratchet'), code: '9-60', heightCode: 60 }
const bitA = { ...part('bit-a', 'bit', 'attack'), code: 'R', bitContact: 'flat' as const }
const bitB = { ...part('bit-b', 'bit', 'stamina'), code: 'H', bitContact: 'ball' as const }
const bitC = { ...part('bit-c', 'bit', 'defense'), code: 'FB', bitContact: 'point' as const }
const fixed: Product = {
  id: 'fixed', line: 'BX', category: 'starter', naming: { primaryZhTW: '固定包' }, region: ['JP'], isRandom: false,
  contents: [{ partId: bitC.id, quantity: 1 }], provenance,
}
const random: Product = {
  id: 'random', line: 'BX', category: 'random_booster', naming: { primaryZhTW: '隨機包' }, region: ['JP'], isRandom: true,
  contents: [], provenance,
}
const variants: ProductVariant[] = [{ id: 'random-a', productId: random.id, variantNameZhTW: 'A', contents: [{ partId: bitC.id, quantity: 1 }], provenance }]
const lot = (partId: string): InventoryLot => ({ id: `lot-${partId}`, sourceType: 'standalone_part', partId, quantity: 1, status: 'available', condition: 'new', createdAt: '' })

describe('下一包推薦', () => {
  it('只在買後能組出更好的合法 3on3 時推薦固定內容商品，隨機包獨立列出', () => {
    const result = recommendNextProducts({
      products: [random, fixed],
      variants,
      ownedProducts: [],
      parts: [bladeA, bladeB, bladeC, ratchetA, ratchetB, ratchetC, bitA, bitB, bitC],
      rules: [],
      lots: [lot(bladeA.id), lot(bladeB.id), lot(bladeC.id), lot(ratchetA.id), lot(ratchetB.id), lot(ratchetC.id), lot(bitA.id), lot(bitB.id)],
      combos: [],
    })
    expect(result.recommendations).toHaveLength(1)
    expect(result.recommendations[0]?.product.id).toBe(fixed.id)
    expect(result.recommendations[0]?.rank).toBe(1)
    expect(result.recommendations[0]?.deckScoreGain).toBeGreaterThan(0)
    expect(result.randomProducts).toEqual([{ product: random, possiblePartNamesZhTW: [bitC.id] }])
  })
})
