import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DECK_RULES,
  estimateComboPartStrength,
  scoreDeck,
  suggestDecks,
  validateDeck,
  type DeckMember,
} from '../../src/domain/deck.ts'
import { generateBuildableCombos } from '../../src/domain/builder.ts'
import { analyzeCombo, type EvidenceInput } from '../../src/domain/analysis.ts'
import type { ExpertPartRatingRank } from '../../src/catalog/tierLists.ts'
import type { ComboSlots, InventoryLot, Part } from '../../src/domain/types.ts'

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

const bladeA = part({ id: 'b-atk', family: 'blade', type: 'attack', spinDirection: 'right', officialWeightG: 34 })
const bladeS = part({ id: 'b-sta', family: 'blade', type: 'stamina', spinDirection: 'right', officialWeightG: 34 })
const bladeD = part({ id: 'b-def', family: 'blade', type: 'defense', spinDirection: 'right', officialWeightG: 36 })
const ratchet60 = part({ id: 'r-60', family: 'ratchet', code: '3-60', spinDirection: 'dual', heightCode: 60, officialWeightG: 6 })
const ratchet80 = part({ id: 'r-80', family: 'ratchet', code: '9-80', spinDirection: 'dual', heightCode: 80, officialWeightG: 7 })
const ratchet70 = part({ id: 'r-70', family: 'ratchet', code: '5-70', spinDirection: 'dual', heightCode: 70, officialWeightG: 6 })
const bitFlat = part({ id: 'bit-f', family: 'bit', code: 'F', type: 'attack', spinDirection: 'dual', officialWeightG: 3, bitContact: 'flat' })
const bitBall = part({ id: 'bit-b', family: 'bit', code: 'B', type: 'stamina', spinDirection: 'dual', officialWeightG: 3, bitContact: 'ball' })
const bitPoint = part({ id: 'bit-p', family: 'bit', code: 'P', type: 'defense', spinDirection: 'dual', officialWeightG: 3, bitContact: 'point' })
const lockChipOther = part({ id: 'chip-other', family: 'lock_chip', system: 'CX', code: 'ドラン' })
const lockChipValkyrie = part({ id: 'chip-valkyrie', family: 'lock_chip', system: 'CX', code: 'ワルキューレ' })

const parts: Part[] = [bladeA, bladeS, bladeD, ratchet60, ratchet80, ratchet70, bitFlat, bitBall, bitPoint, lockChipOther, lockChipValkyrie]

function lot(partId: string, quantity = 1, status: InventoryLot['status'] = 'available'): InventoryLot {
  return {
    id: `lot-${partId}-${status}-${quantity}`,
    sourceType: 'standalone_part',
    partId,
    quantity,
    status,
    condition: 'new',
    createdAt: '2026-01-01T00:00:00.000Z',
  }
}

const threeDistinct: ComboSlots[] = [
  { bladeId: 'b-atk', ratchetId: 'r-60', bitId: 'bit-f' },
  { bladeId: 'b-sta', ratchetId: 'r-80', bitId: 'bit-b' },
  { bladeId: 'b-def', ratchetId: 'r-70', bitId: 'bit-p' },
]

/**
 * 固鎖與軸心各備 3 個，讓不同隊伍組合在操作難度上真的有差別。
 * 若每種只有 1 個，合法隊伍會被庫存鎖死成固定配對，難度總和恆等，測不出策略差異。
 */
const fullStock = [
  lot('b-atk'),
  lot('b-sta'),
  lot('b-def'),
  lot('r-60', 3),
  lot('r-80', 3),
  lot('r-70', 3),
  lot('bit-f', 3),
  lot('bit-b', 3),
  lot('bit-p', 3),
  lot('chip-other', 2),
  lot('chip-valkyrie', 2),
]

function validate(slotsList: ComboSlots[], lots: InventoryLot[] = fullStock) {
  return validateDeck({ slotsList, parts, rules: [], lots, combos: [], ruleSet: DEFAULT_DECK_RULES })
}

describe('預設隊伍規則（第 32 節）', () => {
  it('隊伍人數為 3', () => {
    expect(DEFAULT_DECK_RULES.teamSize).toBe(3)
  })

  it('預設禁止所有一般可玩零件重複', () => {
    expect(DEFAULT_DECK_RULES.noDuplicateFamilies).toContain('blade')
    expect(DEFAULT_DECK_RULES.noDuplicateFamilies).toContain('ratchet')
    expect(DEFAULT_DECK_RULES.noDuplicateFamilies).toContain('bit')
  })

  it('規則有官方規章來源', () => {
    expect(DEFAULT_DECK_RULES.provenance.verificationStatus).toBe('official_verified')
    expect(DEFAULT_DECK_RULES.provenance.sourceUrls[0]).toContain('regulation.pdf')
  })
})

describe('3on3 驗證（第 32 節、第 45 節 Case 9）', () => {
  it('三套不重複且庫存足夠時通過', () => {
    const r = validate(threeDistinct)
    expect(r.ok).toBe(true)
    expect(r.errorsZhTW).toEqual([])
  })

  it('官方規則已核對，不提出待查提醒', () => {
    expect(validate(threeDistinct).warningsZhTW).toEqual([])
  })

  it('只有兩套配裝時不通過', () => {
    const r = validate(threeDistinct.slice(0, 2))
    expect(r.ok).toBe(false)
    expect(r.errorsZhTW).toContain('3on3 需要 3 套配裝，目前有 2 套')
  })

  it('四套配裝時不通過', () => {
    const r = validate([...threeDistinct, { bladeId: 'b-atk', ratchetId: 'r-60', bitId: 'bit-b' }])
    expect(r.ok).toBe(false)
  })

  it('重複使用同一上蓋時不通過', () => {
    const r = validate([
      { bladeId: 'b-atk', ratchetId: 'r-60', bitId: 'bit-f' },
      { bladeId: 'b-atk', ratchetId: 'r-80', bitId: 'bit-b' },
      { bladeId: 'b-def', ratchetId: 'r-80', bitId: 'bit-p' },
    ])
    expect(r.ok).toBe(false)
    expect(r.errorsZhTW).toContain('同一隊伍不可重複使用相同上蓋：中文-b-atk')
  })

  it('重複使用相同固鎖或軸心時不通過，即使庫存數量足夠', () => {
    const r = validate([
      { bladeId: 'b-atk', ratchetId: 'r-80', bitId: 'bit-f' },
      { bladeId: 'b-sta', ratchetId: 'r-80', bitId: 'bit-b' },
      { bladeId: 'b-def', ratchetId: 'r-70', bitId: 'bit-p' },
    ])
    expect(r.ok).toBe(false)
    expect(r.errorsZhTW).toEqual(
      expect.arrayContaining([
        '同一隊伍不可重複使用相同固鎖：中文-r-80',
      ]),
    )
  })

  it('CX 一般鎖定紋章可重複，但ワルキューレ鎖定紋章不可重複', () => {
    const generic = validate([
      { bladeId: 'b-atk', ratchetId: 'r-60', bitId: 'bit-f', lockChipId: 'chip-other' },
      { bladeId: 'b-sta', ratchetId: 'r-80', bitId: 'bit-b', lockChipId: 'chip-other' },
      { bladeId: 'b-def', ratchetId: 'r-80', bitId: 'bit-p' },
    ])
    expect(generic.errorsZhTW.some((error) => error.includes('中文-chip-other'))).toBe(false)

    const valkyrie = validate([
      { bladeId: 'b-atk', ratchetId: 'r-60', bitId: 'bit-f', lockChipId: 'chip-valkyrie' },
      { bladeId: 'b-sta', ratchetId: 'r-80', bitId: 'bit-b', lockChipId: 'chip-valkyrie' },
      { bladeId: 'b-def', ratchetId: 'r-80', bitId: 'bit-p' },
    ])
    expect(valkyrie.errorsZhTW).toContain('同一隊伍不可重複使用相同鎖定紋章：中文-chip-valkyrie')
  })

  it('庫存不足時不通過並指出缺幾個（第 45 節 Case 9）', () => {
    const r = validate(threeDistinct, [
      lot('b-atk'),
      lot('b-sta'),
      lot('b-def'),
      lot('r-60'),
      lot('r-80'),
      lot('bit-f'),
      lot('bit-b'),
      lot('bit-p'),
    ])
    expect(r.ok).toBe(false)
    expect(r.errorsZhTW).toContain('中文-r-70 需要 1 個，可用只有 0 個')
  })

  it('未到貨零件不算可用（第 15、16 節）', () => {
    const r = validate(threeDistinct, [
      lot('b-atk'),
      lot('b-sta'),
      lot('b-def', 1, 'ordered'),
      lot('r-60'),
      lot('r-80', 2),
      lot('bit-f'),
      lot('bit-b'),
      lot('bit-p'),
    ])
    expect(r.ok).toBe(false)
    expect(r.errorsZhTW.some((e) => e.includes('中文-b-def'))).toBe(true)
  })

  it('其中一套無法安裝時不通過（第 18 節）', () => {
    const r = validate([
      { bladeId: 'b-atk', ratchetId: 'r-60' },
      { bladeId: 'b-sta', ratchetId: 'r-80', bitId: 'bit-b' },
      { bladeId: 'b-def', ratchetId: 'r-80', bitId: 'bit-p' },
    ])
    expect(r.ok).toBe(false)
    expect(r.errorsZhTW.some((e) => e.includes('第 1 套'))).toBe(true)
  })

  it('空隊伍不通過', () => {
    expect(validate([]).ok).toBe(false)
  })
})

describe('3on3 角色分工（第 33 節）', () => {
  it('攻擊分數最高的擔任主攻、持久最高的擔任持久', () => {
    const r = validate(threeDistinct)
    const roles = r.members.map((m) => m.roleZhTW)
    expect(roles).toContain('主攻')
    expect(roles).toContain('持久')
    expect(roles).toContain('穩定／抗攻')
  })

  it('每位成員都有解釋為什麼被放進隊伍', () => {
    const r = validate(threeDistinct)
    expect(r.members.every((m) => m.reasonZhTW.length > 0)).toBe(true)
  })

  it('列出被占用的零件（第 33 節）', () => {
    const r = validate(threeDistinct)
    expect(r.occupiedPartIds).toEqual(
      expect.arrayContaining(['b-atk', 'b-sta', 'b-def', 'r-60', 'r-80', 'bit-f', 'bit-b', 'bit-p']),
    )
  })

  it('驗證失敗時不硬給角色', () => {
    expect(validate([]).members).toEqual([])
  })
})

describe('3on3 推薦（第 32 節推薦模式）', () => {
  const candidates = generateBuildableCombos({
    parts,
    rules: [],
    lots: fullStock,
    combos: [],
    mode: 'owned',
  })

  it('可用零件足夠時能產生至少一組建議', () => {
    const r = suggestDecks({ candidates, parts, lots: fullStock, combos: [], ruleSet: DEFAULT_DECK_RULES, strategy: 'balanced' })
    expect(r.length).toBeGreaterThan(0)
  })

  it('每組建議都通過驗證', () => {
    const r = suggestDecks({ candidates, parts, lots: fullStock, combos: [], ruleSet: DEFAULT_DECK_RULES, strategy: 'balanced' })
    expect(r.every((deck) => deck.validation.ok)).toBe(true)
  })

  it('最暴力策略不會選到比最穩定策略更低的平均攻擊分數', () => {
    const args = { candidates, parts, lots: fullStock, combos: [], ruleSet: DEFAULT_DECK_RULES }
    const aggressive = suggestDecks({ ...args, strategy: 'aggressive' })[0]!
    const stable = suggestDecks({ ...args, strategy: 'stable' })[0]!
    const avgAttack = (deck: typeof aggressive) =>
      deck.validation.members.reduce((s, m) => s + (m.analysis.scores?.attack ?? 0), 0) / 3
    expect(avgAttack(aggressive)).toBeGreaterThanOrEqual(avgAttack(stable))
  })

  it('最適合新手策略不會比最暴力策略更難操作', () => {
    const args = { candidates, parts, lots: fullStock, combos: [], ruleSet: DEFAULT_DECK_RULES }
    const beginner = suggestDecks({ ...args, strategy: 'beginner' })[0]!
    const aggressive = suggestDecks({ ...args, strategy: 'aggressive' })[0]!
    const avgDifficulty = (deck: typeof beginner) =>
      deck.validation.members.reduce((s, m) => s + m.analysis.operationDifficulty!, 0) / 3
    expect(avgDifficulty(beginner)).toBeLessThanOrEqual(avgDifficulty(aggressive))
  })

  it('候選不足 3 套時回空陣列', () => {
    const r = suggestDecks({
      candidates: candidates.slice(0, 2),
      parts,
      lots: fullStock,
      combos: [],
      ruleSet: DEFAULT_DECK_RULES,
      strategy: 'balanced',
    })
    expect(r).toEqual([])
  })

  it('每組建議都附上替代方案說明欄位', () => {
    const r = suggestDecks({ candidates, parts, lots: fullStock, combos: [], ruleSet: DEFAULT_DECK_RULES, strategy: 'balanced' })
    expect(Array.isArray(r[0]!.alternativesZhTW)).toBe(true)
  })

  it('上限參數生效', () => {
    const r = suggestDecks({ candidates, parts, lots: fullStock, combos: [], ruleSet: DEFAULT_DECK_RULES, strategy: 'balanced', limit: 2 })
    expect(r.length).toBeLessThanOrEqual(2)
  })
})

describe('候選很多時仍要找得到合法隊伍（回歸測試）', () => {
  /**
   * 官方規則要求三套之間零件完全不重複。
   * 之前 suggestDecks 只看排序後的前 24 個候選，當候選共用同一批固鎖／軸心時
   * 會誤判成「排不出合法隊伍」。這裡用 4×4×4 的庫存確認不會再發生。
   */
  const manyParts: Part[] = [
    part({ id: 'B1', family: 'blade', type: 'attack', spinDirection: 'right', officialWeightG: 34 }),
    part({ id: 'B2', family: 'blade', type: 'stamina', spinDirection: 'right', officialWeightG: 34 }),
    part({ id: 'B3', family: 'blade', type: 'defense', spinDirection: 'right', officialWeightG: 35 }),
    part({ id: 'B4', family: 'blade', type: 'balance', spinDirection: 'right', officialWeightG: 36 }),
    part({ id: 'R1', family: 'ratchet', code: '1-60', spinDirection: 'dual', heightCode: 60, officialWeightG: 6 }),
    part({ id: 'R2', family: 'ratchet', code: '2-70', spinDirection: 'dual', heightCode: 70, officialWeightG: 6 }),
    part({ id: 'R3', family: 'ratchet', code: '3-80', spinDirection: 'dual', heightCode: 80, officialWeightG: 7 }),
    part({ id: 'R4', family: 'ratchet', code: '4-60', spinDirection: 'dual', heightCode: 60, officialWeightG: 7 }),
    part({ id: 'T1', family: 'bit', code: 'F', type: 'attack', spinDirection: 'dual', officialWeightG: 3, bitContact: 'flat' }),
    part({ id: 'T2', family: 'bit', code: 'B', type: 'stamina', spinDirection: 'dual', officialWeightG: 3, bitContact: 'ball' }),
    part({ id: 'T3', family: 'bit', code: 'P', type: 'defense', spinDirection: 'dual', officialWeightG: 3, bitContact: 'point' }),
    part({ id: 'T4', family: 'bit', code: 'R', type: 'attack', spinDirection: 'dual', officialWeightG: 3, bitContact: 'rubber' }),
  ]

  const manyLots = manyParts.map((row) => lot(row.id, 1))

  const candidates = generateBuildableCombos({
    parts: manyParts,
    rules: [],
    lots: manyLots,
    combos: [],
    mode: 'owned',
    sortBy: 'beginner',
    limit: 60,
  })

  it('候選數量確實超過舊的 24 筆上限', () => {
    expect(candidates.length).toBeGreaterThan(24)
  })

  it('仍然找得到通過驗證的隊伍', () => {
    const r = suggestDecks({
      candidates,
      parts: manyParts,
      lots: manyLots,
      combos: [],
      ruleSet: DEFAULT_DECK_RULES,
      strategy: 'balanced',
    })
    expect(r.length).toBeGreaterThan(0)
    expect(r.every((deck) => deck.validation.ok)).toBe(true)
  })

  it('建議的三套之間不會重複使用同一零件', () => {
    const r = suggestDecks({
      candidates,
      parts: manyParts,
      lots: manyLots,
      combos: [],
      ruleSet: DEFAULT_DECK_RULES,
      strategy: 'aggressive',
    })
    for (const deck of r) {
      const used = deck.slotsList.flatMap((slots) => Object.values(slots).filter(Boolean))
      expect(new Set(used).size).toBe(used.length)
    }
  })
})

describe('scoreDeck 強度定義（社群證據百分位 + 高手評級）', () => {
  function memberFor(slots: ComboSlots, evidence?: EvidenceInput): DeckMember {
    const analysis = analyzeCombo({ slots, parts, rules: [], lots: fullStock, combos: [], ...(evidence ? { evidence } : {}) })
    return { slots, analysis, roleZhTW: '', reasonZhTW: '' }
  }

  const highPercentile: EvidenceInput = {
    appearances: 1,
    top4: 0,
    championships: 0,
    totalDecks: 10,
    sourceTier: 'community',
    percentileScore: 90,
  }
  const lowPercentileHighRawCount: EvidenceInput = {
    appearances: 5000,
    top4: 0,
    championships: 0,
    totalDecks: 6000,
    sourceTier: 'community',
    percentileScore: 10,
  }

  it('balanced 策略比較用百分位，不用原始出場筆數蓋過小樣本', () => {
    const high = threeDistinct.map((slots) => memberFor(slots, highPercentile))
    const low = threeDistinct.map((slots) => memberFor(slots, lowPercentileHighRawCount))
    expect(scoreDeck('balanced', high)).toBeGreaterThan(scoreDeck('balanced', low))
  })

  it('evidence 策略比較用百分位，不用原始出場筆數蓋過小樣本', () => {
    const high = threeDistinct.map((slots) => memberFor(slots, highPercentile))
    const low = threeDistinct.map((slots) => memberFor(slots, lowPercentileHighRawCount))
    expect(scoreDeck('evidence', high)).toBeGreaterThan(scoreDeck('evidence', low))
  })

  it('balanced 策略吃高手評級加分（BBXHub X/SS/S）', () => {
    const members = threeDistinct.map((slots) => memberFor(slots))
    const expertIndex = new Map<string, ExpertPartRatingRank>([
      ['b-atk', { tierLabel: 'X', rank: 3, agreeCount: 5, expertCount: 5 }],
    ])
    expect(scoreDeck('balanced', members, expertIndex)).toBeGreaterThan(scoreDeck('balanced', members))
  })

  it('evidence 策略不吃高手評級，避免主觀意見混進賽事證據排序', () => {
    const members = threeDistinct.map((slots) => memberFor(slots, highPercentile))
    const expertIndex = new Map<string, ExpertPartRatingRank>([
      ['b-atk', { tierLabel: 'X', rank: 3, agreeCount: 5, expertCount: 5 }],
    ])
    expect(scoreDeck('evidence', members, expertIndex)).toBe(scoreDeck('evidence', members))
  })

  it('balanced 策略：沒有真實 evidence 時，用零件強度 fallback 補分（權重低於真實證據）', () => {
    const membersNoEvidence = threeDistinct.map((slots) => memberFor(slots))
    const partStrengthIndex = new Map([
      ['b-atk', { podiumAppearances: 50, percentileScore: 100 }],
      ['r-60', { podiumAppearances: 50, percentileScore: 100 }],
      ['bit-f', { podiumAppearances: 50, percentileScore: 100 }],
    ])
    const withFallback = scoreDeck('balanced', membersNoEvidence, undefined, partStrengthIndex)
    const withoutFallback = scoreDeck('balanced', membersNoEvidence)
    expect(withFallback).toBeGreaterThan(withoutFallback)
  })

  it('balanced 策略：fallback 權重低於真實證據，滿分零件推估也贏不過真實證據', () => {
    const maxFallback = threeDistinct.map((slots) => memberFor(slots))
    const partStrengthIndex = new Map(
      ['b-atk', 'b-sta', 'b-def', 'r-60', 'r-80', 'r-70', 'bit-f', 'bit-b', 'bit-p'].map((id) => [
        id,
        { podiumAppearances: 999, percentileScore: 100 },
      ]),
    )
    const withMaxFallback = scoreDeck('balanced', maxFallback, undefined, partStrengthIndex)

    const realEvidence: EvidenceInput = {
      appearances: 1,
      top4: 0,
      championships: 0,
      totalDecks: 10,
      sourceTier: 'community',
      percentileScore: 100,
    }
    const withRealEvidence = threeDistinct.map((slots) => memberFor(slots, realEvidence))
    const withRealEvidenceScore = scoreDeck('balanced', withRealEvidence)

    expect(withMaxFallback).toBeLessThan(withRealEvidenceScore)
  })

  it('evidence 策略不吃零件強度 fallback，維持「最高賽事證據」策略名稱的承諾', () => {
    const members = threeDistinct.map((slots) => memberFor(slots))
    const partStrengthIndex = new Map([['b-atk', { podiumAppearances: 50, percentileScore: 100 }]])
    expect(scoreDeck('evidence', members, undefined, partStrengthIndex)).toBe(scoreDeck('evidence', members))
  })
})

describe('estimateComboPartStrength（零件層級強度 fallback，第 50 節）', () => {
  it('三個零件都有資料時回傳平均百分位', () => {
    const index = new Map([
      ['b-atk', { podiumAppearances: 10, percentileScore: 80 }],
      ['r-60', { podiumAppearances: 5, percentileScore: 40 }],
      ['bit-f', { podiumAppearances: 20, percentileScore: 60 }],
    ])
    const result = estimateComboPartStrength(threeDistinct[0]!, index)
    expect(result).toBe(60) // (80 + 40 + 60) / 3
  })

  it('完全沒有任何零件的資料時回傳 undefined，不能當 0 分', () => {
    const result = estimateComboPartStrength(threeDistinct[0]!, new Map())
    expect(result).toBeUndefined()
  })

  it('部分零件有資料時只平均查得到的那幾個', () => {
    const index = new Map([['b-atk', { podiumAppearances: 10, percentileScore: 90 }]])
    const result = estimateComboPartStrength(threeDistinct[0]!, index)
    expect(result).toBe(90)
  })

  it('CX 系統用到的 lockChipId/mainBladeId/overBladeId/assistBladeId 時也正確平均', () => {
    const cxSlots: ComboSlots = {
      lockChipId: 'chip-cx',
      mainBladeId: 'main-cx',
      overBladeId: 'over-cx',
      assistBladeId: 'assist-cx',
    }
    const index = new Map([
      ['chip-cx', { podiumAppearances: 8, percentileScore: 50 }],
      ['main-cx', { podiumAppearances: 12, percentileScore: 70 }],
      ['over-cx', { podiumAppearances: 10, percentileScore: 60 }],
      ['assist-cx', { podiumAppearances: 6, percentileScore: 40 }],
    ])
    const result = estimateComboPartStrength(cxSlots, index)
    expect(result).toBe(55) // (50 + 70 + 60 + 40) / 4
  })
})

describe('規則說明必須全中文（第 1.4 節）', () => {
  it('前台摘要不含日文假名', () => {
    expect(DEFAULT_DECK_RULES.summaryZhTW).not.toMatch(/[぀-ヿ]/)
  })

  it('不可重複的特殊零件都有中文暫譯', () => {
    for (const row of DEFAULT_DECK_RULES.noDuplicatePartCodes ?? []) {
      expect(row.nameZhTW).not.toMatch(/[぀-ヿ]/)
      expect(row.nameZhTW.length).toBeGreaterThan(0)
    }
  })
})

describe('沒有官方資料時不得假裝比較過（第 1.5、49.4 節）', () => {
  const plain: Part[] = [
    part({ id: 'p-b1', family: 'blade', spinDirection: 'right' }),
    part({ id: 'p-b2', family: 'blade', spinDirection: 'right' }),
    part({ id: 'p-b3', family: 'blade', spinDirection: 'right' }),
    part({ id: 'p-r1', family: 'ratchet', code: '1-60', spinDirection: 'dual', heightCode: 60 }),
    part({ id: 'p-r2', family: 'ratchet', code: '2-70', spinDirection: 'dual', heightCode: 70 }),
    part({ id: 'p-r3', family: 'ratchet', code: '3-80', spinDirection: 'dual', heightCode: 80 }),
    part({ id: 'p-t1', family: 'bit', code: 'A', spinDirection: 'dual' }),
    part({ id: 'p-t2', family: 'bit', code: 'C', spinDirection: 'dual' }),
    part({ id: 'p-t3', family: 'bit', code: 'D', spinDirection: 'dual' }),
  ]
  const plainLots = plain.map((row) => lot(row.id, 1))
  const slotsList: ComboSlots[] = [
    { bladeId: 'p-b1', ratchetId: 'p-r1', bitId: 'p-t1' },
    { bladeId: 'p-b2', ratchetId: 'p-r2', bitId: 'p-t2' },
    { bladeId: 'p-b3', ratchetId: 'p-r3', bitId: 'p-t3' },
  ]

  const result = validateDeck({
    slotsList,
    parts: plain,
    rules: [],
    lots: plainLots,
    combos: [],
    ruleSet: DEFAULT_DECK_RULES,
  })

  it('隊伍本身仍然合法', () => {
    expect(result.ok).toBe(true)
  })

  it('角色說明不會出現「0 分」這種假比較', () => {
    for (const member of result.members) {
      expect(member.reasonZhTW).not.toContain('0 分')
      expect(member.reasonZhTW).toContain('無法評分')
    }
  })

  it('會提醒角色分配只依可組性', () => {
    expect(result.warningsZhTW.some((w) => w.includes('不代表強弱'))).toBe(true)
  })

  it('有官方類型資料時仍照常顯示分數', () => {
    const scored = validateDeck({
      slotsList: threeDistinct,
      parts,
      rules: [],
      lots: fullStock,
      combos: [],
      ruleSet: DEFAULT_DECK_RULES,
    })
    expect(scored.members.some((member) => /\d+ 分/.test(member.reasonZhTW))).toBe(true)
  })
})
