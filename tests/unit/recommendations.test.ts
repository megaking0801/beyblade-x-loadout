import { describe, expect, it } from 'vitest'
import { recommendNextProducts } from '../../src/domain/recommendations.ts'
import type { ExpertPartRatingRank } from '../../src/catalog/tierLists.ts'
import type { PartStrengthEntry } from '../../src/catalog/partStrength.ts'
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
      evidenceByCode: {
        'blade-a 1-60R': { appearances: 8, top4: 0, championships: 0, totalDecks: 8, sourceTier: 'community' },
        'blade-c 9-60FB': { appearances: 10, top4: 0, championships: 0, totalDecks: 10, sourceTier: 'community' },
      },
    })
    expect(result.recommendations).toHaveLength(1)
    expect(result.recommendations[0]?.product.id).toBe(fixed.id)
    expect(result.recommendations[0]?.rank).toBe(1)
    expect(result.recommendations[0]?.deckScoreGain).toBeGreaterThan(0)
    expect(result.randomProducts).toEqual([{ product: random, possiblePartNamesZhTW: [bitC.id] }])
  })

  it('competitiveEvidenceGain 吃 evidence.percentileScore，不是原始 appearances 筆數', () => {
    // 故意設一個 appearances 天文數字但 percentileScore 很低的證據，確認
    // gain 真的跟著百分位走，不會因為原始筆數大就衝到天上去——這是社群站台
    // 資料規模遠超本地資料時，用來避免系統性蓋過真實賽果的修正。
    const result = recommendNextProducts({
      products: [random, fixed],
      variants,
      ownedProducts: [],
      parts: [bladeA, bladeB, bladeC, ratchetA, ratchetB, ratchetC, bitA, bitB, bitC],
      rules: [],
      lots: [lot(bladeA.id), lot(bladeB.id), lot(bladeC.id), lot(ratchetA.id), lot(ratchetB.id), lot(ratchetC.id), lot(bitA.id), lot(bitB.id)],
      combos: [],
      // 固鎖沒設 type，三種固鎖搭配 blade-c+bitC 分數會打平，正式跑出來選哪一種
      // 是內部 tie-break 決定的；三種都給證據，不用去猜實際選到哪一顆。
      evidenceByCode: {
        'blade-c 1-60FB': { appearances: 999_999, percentileScore: 7, top4: 0, championships: 0, totalDecks: 999_999, sourceTier: 'community' },
        'blade-c 3-60FB': { appearances: 999_999, percentileScore: 7, top4: 0, championships: 0, totalDecks: 999_999, sourceTier: 'community' },
        'blade-c 9-60FB': { appearances: 999_999, percentileScore: 7, top4: 0, championships: 0, totalDecks: 999_999, sourceTier: 'community' },
      },
    })
    const gain = result.recommendations[0]?.competitiveEvidenceGain ?? -1
    expect(gain).toBeGreaterThan(0)
    expect(gain).toBeLessThan(100)
  })

  it('結構上完全等效的兩個商品，含高手評級零件的那個排名較高，且分數只算 X/SS/S', () => {
    // bitD 跟 bitA 的 type／bitContact 完全一樣，買哪一顆對合法 3on3 分數的影響
    // 應該相同——唯一差別是 bitA 有高手評級、bitD 沒有，用來獨立驗證
    // expertTierGain 在排序鏈裡的效力，不跟 deckScoreGain 的差異混在一起看。
    const bitD = { ...part('bit-d', 'bit', 'attack'), code: 'Rd', bitContact: 'flat' as const }
    // id 刻意讓字母序跟預期名次相反（'z-' 排最後、'a-' 排最前）：如果
    // expertTierGain 沒有真的接進排序鏈，會退回最後一個 tie-break（sku／id
    // 字母序），'a-without-rating' 會贏，剛好測出「假通過」。
    const productWithRatedBit: Product = {
      id: 'z-with-rating', line: 'BX', category: 'starter', naming: { primaryZhTW: '有評級固定包' }, region: ['JP'], isRandom: false,
      contents: [{ partId: bitA.id, quantity: 1 }], provenance,
    }
    const productWithoutRating: Product = {
      id: 'a-without-rating', line: 'BX', category: 'starter', naming: { primaryZhTW: '無評級固定包' }, region: ['JP'], isRandom: false,
      contents: [{ partId: bitD.id, quantity: 1 }], provenance,
    }
    const expertTierByPartId = new Map<string, ExpertPartRatingRank>([
      [bitA.id, { tierLabel: 'X', rank: 3, agreeCount: 2, expertCount: 5 }],
    ])
    const result = recommendNextProducts({
      products: [productWithRatedBit, productWithoutRating],
      variants: [],
      ownedProducts: [],
      parts: [bladeA, bladeB, bladeC, ratchetA, ratchetB, ratchetC, bitA, bitB, bitC, bitD],
      rules: [],
      // 已擁有 bitB／bitC（缺攻擊型的第三顆軸心，剛好呼應上一個測試的擁有狀態），
      // 買 bitA 或結構相同的 bitD 才能補滿第三顆，形成合法 3on3。
      lots: [lot(bladeA.id), lot(bladeB.id), lot(bladeC.id), lot(ratchetA.id), lot(ratchetB.id), lot(ratchetC.id), lot(bitB.id), lot(bitC.id)],
      combos: [],
      // 只是為了通過 isCompetitionRelevantProduct 的相關性篩選，appearances 故意
      // 設 0，不讓它貢獻 competitiveEvidenceGain，才能單獨看 expertTierGain 的效力。
      evidenceByCode: {
        'blade-a 1-60R': { appearances: 0, top4: 0, championships: 0, totalDecks: 0, sourceTier: 'community' },
        'blade-a 1-60Rd': { appearances: 0, top4: 0, championships: 0, totalDecks: 0, sourceTier: 'community' },
      },
      expertTierByPartId,
    })
    expect(result.recommendations).toHaveLength(2)
    const rated = result.recommendations.find((row) => row.product.id === productWithRatedBit.id)
    const unrated = result.recommendations.find((row) => row.product.id === productWithoutRating.id)
    expect(rated?.deckScoreGain).toBe(unrated?.deckScoreGain)
    expect(rated?.expertTierGain).toBe(3)
    expect(unrated?.expertTierGain).toBe(0)
    expect(rated?.rank).toBe(1)
    expect(rated?.reasonsZhTW.some((line) => line.includes('高手評級') && line.includes('X 級') && line.includes('2 位認同'))).toBe(true)
    expect(unrated?.reasonsZhTW.some((line) => line.includes('高手評級'))).toBe(false)
  })

  it('結構上完全等效的兩個商品，零件強度分數較高的那個排名較高，且不影響 deckScoreGain', () => {
    const bitE = { ...part('bit-e', 'bit', 'attack'), code: 'Re', bitContact: 'flat' as const }
    const productWithStrongPart: Product = {
      id: 'z-with-strength', line: 'BX', category: 'starter', naming: { primaryZhTW: '有戰績固定包' }, region: ['JP'], isRandom: false,
      contents: [{ partId: bitA.id, quantity: 1 }], provenance,
    }
    const productWithoutStrength: Product = {
      id: 'a-without-strength', line: 'BX', category: 'starter', naming: { primaryZhTW: '無戰績固定包' }, region: ['JP'], isRandom: false,
      contents: [{ partId: bitE.id, quantity: 1 }], provenance,
    }
    const partStrengthIndex = new Map<string, PartStrengthEntry>([
      [bitA.id, { podiumAppearances: 40, percentileScore: 85 }],
    ])
    const result = recommendNextProducts({
      products: [productWithStrongPart, productWithoutStrength],
      variants: [],
      ownedProducts: [],
      parts: [bladeA, bladeB, bladeC, ratchetA, ratchetB, ratchetC, bitA, bitB, bitC, bitE],
      rules: [],
      lots: [lot(bladeA.id), lot(bladeB.id), lot(bladeC.id), lot(ratchetA.id), lot(ratchetB.id), lot(ratchetC.id), lot(bitB.id), lot(bitC.id)],
      combos: [],
      evidenceByCode: {
        'blade-a 1-60R': { appearances: 0, top4: 0, championships: 0, totalDecks: 0, sourceTier: 'community' },
        'blade-a 1-60Re': { appearances: 0, top4: 0, championships: 0, totalDecks: 0, sourceTier: 'community' },
      },
      partStrengthIndex,
    })
    expect(result.recommendations).toHaveLength(2)
    const rated = result.recommendations.find((row) => row.product.id === productWithStrongPart.id)
    const unrated = result.recommendations.find((row) => row.product.id === productWithoutStrength.id)
    expect(rated?.deckScoreGain).toBe(unrated?.deckScoreGain)
    expect(rated?.partStrengthGain).toBe(85)
    expect(unrated?.partStrengthGain).toBe(0)
    expect(rated?.rank).toBe(1)
    expect(rated?.reasonsZhTW.some((line) => line.includes('零件歷史戰績推估') && line.includes('進前三 40 次'))).toBe(true)
  })

  it('強度／賽事證據／高手評級都沒有時，只要解鎖新合法配置仍要推薦，並用廣度話術而非強度話術', () => {
    // bladeE 跟 bladeC 同型（defense），已擁有完整 3x3x3（bladeA/B/C × ratchetA/B/C ×
    // bitA/B/C）已經是最佳隊伍；買 bladeE 只會新增跟 bladeC 同分的候選，不會贏過
    // 既有最強隊伍，deckScoreGain 應該是 0，但 unlocked 一定 > 0（bladeE 的 9 種
    // 全新組合此前都不存在）。
    const bladeE = part('blade-e', 'blade', 'defense')
    const productE: Product = {
      id: 'product-e', line: 'BX', category: 'starter', naming: { primaryZhTW: '備用防禦組' }, region: ['JP'], isRandom: false,
      contents: [{ partId: bladeE.id, quantity: 1 }], provenance,
    }
    const result = recommendNextProducts({
      products: [productE],
      variants: [],
      ownedProducts: [],
      parts: [bladeA, bladeB, bladeC, bladeE, ratchetA, ratchetB, ratchetC, bitA, bitB, bitC],
      rules: [],
      lots: [lot(bladeA.id), lot(bladeB.id), lot(bladeC.id), lot(ratchetA.id), lot(ratchetB.id), lot(ratchetC.id), lot(bitA.id), lot(bitB.id), lot(bitC.id)],
      combos: [],
      // 只是為了通過 isCompetitionRelevantProduct 的相關性篩選。
      evidenceByCode: {
        'blade-e 1-60R': { appearances: 0, top4: 0, championships: 0, totalDecks: 0, sourceTier: 'community' },
      },
    })
    expect(result.recommendations).toHaveLength(1)
    const rec = result.recommendations[0]!
    expect(rec.deckScoreGain).toBe(0)
    expect(rec.competitiveEvidenceGain).toBe(0)
    expect(rec.expertTierGain).toBe(0)
    expect(rec.unlockedExamplesZhTW.length).toBeGreaterThan(0)
    expect(rec.reasonsZhTW.some((line) => line.includes('供擴大配裝廣度參考'))).toBe(true)
    expect(rec.reasonsZhTW.some((line) => line.includes('組合分數可提升'))).toBe(false)
  })

  it('partStrengthGain 只能算邊際新增：使用者已經擁有商品全部零件時不會單靠 partStrengthGain 被推薦（最終審查 Finding 1 回歸測試）', () => {
    // 已擁有 3x3x3 全滿庫存（跟第一個測試同樣的最佳隊伍組成），再買一顆已經
    // 擁有的 bitA：deckScoreGain／competitiveEvidenceGain／expertTierGain／
    // unlocked 全部應該是 0，且因為 bitA 買之前 free 已經是 1（不是 0），
    // 就算 partStrengthIndex 給它很高的百分位，partStrengthGain 也必須是 0——
    // 否則舊版「加總整包所有零件的 percentileScore」會讓這個已經擁有、完全沒
    // 帶來任何新東西的商品被誤判成「有零件戰績佐證」而被推薦。
    const productAlreadyOwnedPart: Product = {
      id: 'already-owned-bit-a', line: 'BX', category: 'starter', naming: { primaryZhTW: '重複軸心包' }, region: ['JP'], isRandom: false,
      contents: [{ partId: bitA.id, quantity: 1 }], provenance,
    }
    const partStrengthIndex = new Map<string, PartStrengthEntry>([
      [bitA.id, { podiumAppearances: 40, percentileScore: 90 }],
    ])
    const result = recommendNextProducts({
      products: [productAlreadyOwnedPart],
      variants: [],
      ownedProducts: [],
      parts: [bladeA, bladeB, bladeC, ratchetA, ratchetB, ratchetC, bitA, bitB, bitC],
      rules: [],
      // 已經擁有完整 3x3x3 最佳庫存，包含 bitA 本身。
      lots: [lot(bladeA.id), lot(bladeB.id), lot(bladeC.id), lot(ratchetA.id), lot(ratchetB.id), lot(ratchetC.id), lot(bitA.id), lot(bitB.id), lot(bitC.id)],
      combos: [],
      // 只是為了通過 isCompetitionRelevantProduct 的相關性篩選。
      evidenceByCode: {
        'blade-a 1-60R': { appearances: 0, top4: 0, championships: 0, totalDecks: 0, sourceTier: 'community' },
      },
      partStrengthIndex,
    })
    const rec = result.recommendations.find((row) => row.product.id === productAlreadyOwnedPart.id)
    if (rec) {
      // 如果因為其他理由出現在推薦裡，partStrengthGain 至少也必須是 0。
      expect(rec.partStrengthGain).toBe(0)
    } else {
      expect(rec).toBeUndefined()
    }
  })

  it('不再有「整體強度」話術：六軸加總對純攻擊型系統性偏低（防守 57／攻擊 48），已整段下線（規格第 50.5、50.7 節）', () => {
    // bladeD 跟 bladeA 同型（attack）；六軸加總公式代入純攻擊型只有 48 分，
    // 純防守型有 57 分，舊版「整體強度」候選池與 overallStrengthGain 話術
    // 會系統性把純攻擊型商品排到純防守型後面，即使兩者對合法配置的貢獻相同。
    const bladeD = part('blade-d', 'blade', 'attack')
    const productD: Product = {
      id: 'product-d', line: 'BX', category: 'starter', naming: { primaryZhTW: '備用攻擊組' }, region: ['JP'], isRandom: false,
      contents: [{ partId: bladeD.id, quantity: 1 }], provenance,
    }
    const result = recommendNextProducts({
      products: [productD],
      variants: [],
      ownedProducts: [],
      parts: [bladeA, bladeB, bladeC, bladeD, ratchetA, ratchetB, ratchetC, bitA, bitB, bitC],
      rules: [],
      lots: [lot(bladeA.id), lot(bladeB.id), lot(bladeC.id), lot(ratchetA.id), lot(ratchetB.id), lot(ratchetC.id), lot(bitA.id), lot(bitB.id), lot(bitC.id)],
      combos: [],
      evidenceByCode: {
        'blade-d 1-60R': { appearances: 0, top4: 0, championships: 0, totalDecks: 0, sourceTier: 'community' },
      },
    })
    for (const rec of result.recommendations) {
      expect('overallStrengthGain' in rec).toBe(false)
      expect(rec.reasonsZhTW.some((line) => line.includes('整體強度'))).toBe(false)
    }
  })

  it('axisGains 用防守比重取代舊的穩定分數，且鍵名是 defense 不是 stability', () => {
    // bladeC 是既有 fixture 裡的防守型上蓋；這裡刻意不把它放進 lots，
    // 讓「買含 bladeC 的商品」變成新增的防守型候選，藉此觸發非零的
    // axisGains.defense。
    const productDefense: Product = {
      id: 'product-defense-2', line: 'BX', category: 'starter', naming: { primaryZhTW: '備用防禦組 2' }, region: ['JP'], isRandom: false,
      contents: [{ partId: bladeC.id, quantity: 1 }], provenance,
    }
    const result = recommendNextProducts({
      products: [productDefense],
      variants: [],
      ownedProducts: [],
      parts: [bladeA, bladeB, bladeC, ratchetA, ratchetB, ratchetC, bitA, bitB, bitC],
      rules: [],
      lots: [lot(bladeA.id), lot(bladeB.id), lot(ratchetA.id), lot(ratchetB.id), lot(ratchetC.id), lot(bitA.id), lot(bitB.id), lot(bitC.id)],
      combos: [],
      evidenceByCode: {
        'blade-c 1-60R': { appearances: 0, top4: 0, championships: 0, totalDecks: 0, sourceTier: 'community' },
      },
    })
    for (const rec of result.recommendations) {
      expect('stability' in rec.axisGains).toBe(false)
      expect(typeof rec.axisGains.defense).toBe('number')
    }
  })
})
