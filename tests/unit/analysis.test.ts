import { describe, expect, it } from 'vitest'
import {
  ESTIMATE_LABEL,
  analyzeCombo,
  estimateScores,
  type AnalyzeArgs,
} from '../../src/domain/analysis.ts'
import type { InventoryLot, Part } from '../../src/domain/types.ts'

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

const attackBlade = part({
  id: 'blade-attack',
  family: 'blade',
  type: 'attack',
  spinDirection: 'right',
  officialWeightG: 34,
})
const staminaBlade = part({
  id: 'blade-stamina',
  family: 'blade',
  type: 'stamina',
  spinDirection: 'right',
  officialWeightG: 34,
})
const defenseBlade = part({
  id: 'blade-defense',
  family: 'blade',
  type: 'defense',
  spinDirection: 'right',
  officialWeightG: 34,
})
const heavyBlade = part({
  id: 'blade-heavy',
  family: 'blade',
  type: 'balance',
  spinDirection: 'right',
  officialWeightG: 40,
})
const lightBlade = part({
  id: 'blade-light',
  family: 'blade',
  type: 'balance',
  spinDirection: 'right',
  officialWeightG: 28,
})
const bladeNoWeight = part({
  id: 'blade-noweight',
  family: 'blade',
  type: 'attack',
  spinDirection: 'right',
})

const ratchetLow = part({
  id: 'ratchet-3-60',
  family: 'ratchet',
  code: '3-60',
  spinDirection: 'dual',
  heightCode: 60,
  officialWeightG: 6,
})
const ratchetHigh = part({
  id: 'ratchet-9-80',
  family: 'ratchet',
  code: '9-80',
  spinDirection: 'dual',
  heightCode: 80,
  officialWeightG: 7,
})

const bitFlat = part({
  id: 'bit-flat',
  family: 'bit',
  code: 'F',
  type: 'attack',
  spinDirection: 'dual',
  officialWeightG: 3,
  bitContact: 'flat',
})
const bitBall = part({
  id: 'bit-ball',
  family: 'bit',
  code: 'B',
  type: 'stamina',
  spinDirection: 'dual',
  officialWeightG: 3,
  bitContact: 'ball',
})
const bitRubber = part({
  id: 'bit-rubber',
  family: 'bit',
  code: 'R',
  type: 'attack',
  spinDirection: 'dual',
  officialWeightG: 3,
  bitContact: 'rubber',
})

const allParts: Part[] = [
  attackBlade,
  staminaBlade,
  defenseBlade,
  heavyBlade,
  lightBlade,
  bladeNoWeight,
  ratchetLow,
  ratchetHigh,
  bitFlat,
  bitBall,
  bitRubber,
]

function lot(partId: string, quantity: number, status: InventoryLot['status'] = 'available'): InventoryLot {
  return {
    id: `lot-${partId}-${status}`,
    sourceType: 'standalone_part',
    partId,
    quantity,
    status,
    condition: 'new',
    createdAt: '2026-01-01T00:00:00.000Z',
  }
}

function args(over: Partial<AnalyzeArgs> = {}): AnalyzeArgs {
  return {
    slots: { bladeId: attackBlade.id, ratchetId: ratchetLow.id, bitId: bitFlat.id },
    parts: allParts,
    rules: [],
    lots: [],
    combos: [],
    ...over,
  }
}

describe('客觀資料層（第 20 節 A）', () => {
  it('總重量為各零件官方重量相加', () => {
    const r = analyzeCombo(args())
    expect(r.objective.totalWeightG).toBe(34 + 6 + 3)
  })

  it('任一零件缺官方重量時總重量為 undefined，且列入缺漏欄位', () => {
    const r = analyzeCombo(args({ slots: { bladeId: bladeNoWeight.id, ratchetId: ratchetLow.id, bitId: bitFlat.id } }))
    expect(r.objective.totalWeightG).toBeUndefined()
    expect(r.dataCompleteness.missingFieldsZhTW).toContain('官方重量')
  })

  it('高度取自固鎖', () => {
    expect(analyzeCombo(args()).objective.heightCode).toBe(60)
  })

  it('旋向取自非雙旋零件', () => {
    expect(analyzeCombo(args()).objective.spinDirectionZhTW).toBe('右旋')
  })

  it('結構顯示為中文', () => {
    expect(analyzeCombo(args()).objective.structureZhTW).toBe('BX 三件式')
  })

  it('CX 結構顯示為五件式', () => {
    const cxParts = [
      part({ id: 'chip', family: 'lock_chip', system: 'CX' }),
      part({ id: 'main', family: 'main_blade', system: 'CX', type: 'attack', spinDirection: 'right', officialWeightG: 20 }),
      part({ id: 'assist', family: 'assist_blade', system: 'CX', officialWeightG: 8 }),
      ratchetLow,
      bitFlat,
    ]
    const r = analyzeCombo(
      args({
        slots: {
          lockChipId: 'chip',
          mainBladeId: 'main',
          assistBladeId: 'assist',
          ratchetId: ratchetLow.id,
          bitId: bitFlat.id,
        },
        parts: cxParts,
      }),
    )
    expect(r.objective.structureZhTW).toBe('CX 模組化五件式')
  })

  it('列出各零件的官方類型', () => {
    const r = analyzeCombo(args())
    expect(r.objective.officialTypesZhTW).toEqual(['攻擊', '攻擊'])
  })

  it('顯示軸心特性', () => {
    expect(analyzeCombo(args()).objective.bitContactZhTW).toBe('平面')
  })
})

describe('配裝協同性層必須標示模型推估（第 20 節 B）', () => {
  it('估算結果帶有模型推估標籤', () => {
    expect(analyzeCombo(args()).estimateLabelZhTW).toBe(ESTIMATE_LABEL)
    expect(ESTIMATE_LABEL).toBe('模型推估')
  })

  it('攻擊型配裝的攻擊分數高於持久型', () => {
    const attack = estimateScores({ blade: attackBlade, ratchet: ratchetLow, bit: bitFlat, extras: [] })
    const stamina = estimateScores({ blade: staminaBlade, ratchet: ratchetHigh, bit: bitBall, extras: [] })
    expect(attack.attack).toBeGreaterThan(stamina.attack)
    expect(stamina.stamina).toBeGreaterThan(attack.stamina)
  })

  it('防守型配裝的防守分數高於攻擊型', () => {
    const defense = estimateScores({ blade: defenseBlade, ratchet: ratchetHigh, bit: bitBall, extras: [] })
    const attack = estimateScores({ blade: attackBlade, ratchet: ratchetLow, bit: bitFlat, extras: [] })
    expect(defense.defense).toBeGreaterThan(attack.defense)
  })

  it('同樣配置下較重的上蓋提升防守與持久', () => {
    const heavy = estimateScores({ blade: heavyBlade, ratchet: ratchetLow, bit: bitBall, extras: [] })
    const light = estimateScores({ blade: lightBlade, ratchet: ratchetLow, bit: bitBall, extras: [] })
    expect(heavy.defense).toBeGreaterThan(light.defense)
    expect(heavy.stamina).toBeGreaterThan(light.stamina)
  })

  it('所有分數都落在 0 到 100 之間', () => {
    for (const scores of [
      estimateScores({ blade: heavyBlade, ratchet: ratchetLow, bit: bitRubber, extras: [] }),
      estimateScores({ blade: lightBlade, ratchet: ratchetHigh, bit: bitBall, extras: [] }),
    ]) {
      for (const value of Object.values(scores)) {
        expect(value).toBeGreaterThanOrEqual(0)
        expect(value).toBeLessThanOrEqual(100)
      }
    }
  })

  it('低位固鎖搭配平面軸心會提示刮地風險', () => {
    const r = analyzeCombo(args())
    expect(r.synergyNotesZhTW.some((n) => n.includes('刮地'))).toBe(true)
  })

  it('高位固鎖搭配球狀軸心不提示刮地風險', () => {
    const r = analyzeCombo(
      args({ slots: { bladeId: staminaBlade.id, ratchetId: ratchetHigh.id, bitId: bitBall.id } }),
    )
    expect(r.synergyNotesZhTW.some((n) => n.includes('刮地'))).toBe(false)
  })

  it('提示低位或高位', () => {
    expect(analyzeCombo(args()).synergyNotesZhTW.some((n) => n.includes('低位'))).toBe(true)
    const high = analyzeCombo(
      args({ slots: { bladeId: staminaBlade.id, ratchetId: ratchetHigh.id, bitId: bitBall.id } }),
    )
    expect(high.synergyNotesZhTW.some((n) => n.includes('高位'))).toBe(true)
  })

  it('橡膠軸心的操作難度高於球狀軸心', () => {
    const rubber = analyzeCombo(args({ slots: { bladeId: attackBlade.id, ratchetId: ratchetLow.id, bitId: bitRubber.id } }))
    const ball = analyzeCombo(args({ slots: { bladeId: staminaBlade.id, ratchetId: ratchetHigh.id, bitId: bitBall.id } }))
    expect(rubber.operationDifficulty!).toBeGreaterThan(ball.operationDifficulty!)
  })
})

describe('配裝結果必備欄位（第 19 節）', () => {
  it('包含完整配置名稱與型號組合', () => {
    const r = analyzeCombo(args())
    expect(r.fullNameZhTW).toBe('中文-blade-attack 3-60F')
    expect(r.fullCode).toBe('blade-attack 3-60F')
  })

  it('包含類型、旋向、高度、建議發射方式', () => {
    const r = analyzeCombo(args())
    expect(r.typeZhTW).toBe('攻擊')
    expect(r.objective.spinDirectionZhTW).toBe('右旋')
    expect(r.objective.heightCode).toBe(60)
    expect(r.launchSuggestionZhTW.length).toBeGreaterThan(0)
  })

  it('包含優點與缺點，且不為空', () => {
    const r = analyzeCombo(args())
    expect(r.prosZhTW.length).toBeGreaterThan(0)
    expect(r.consZhTW.length).toBeGreaterThan(0)
  })

  it('庫存不足時標記為不足，並列出缺少的零件', () => {
    const r = analyzeCombo(args({ lots: [lot(attackBlade.id, 1)] }))
    expect(r.stock.sufficient).toBe(false)
    expect(r.stock.missingPartIds).toEqual([ratchetLow.id, bitFlat.id])
  })

  it('庫存足夠時標記為足夠', () => {
    const r = analyzeCombo(
      args({ lots: [lot(attackBlade.id, 1), lot(ratchetLow.id, 1), lot(bitFlat.id, 1)] }),
    )
    expect(r.stock.sufficient).toBe(true)
    expect(r.stock.missingPartIds).toEqual([])
  })

  it('未到貨的零件不算庫存足夠（第 15、16 節）', () => {
    const r = analyzeCombo(
      args({
        lots: [lot(attackBlade.id, 1), lot(ratchetLow.id, 1, 'ordered'), lot(bitFlat.id, 1)],
      }),
    )
    expect(r.stock.sufficient).toBe(false)
    expect(r.stock.missingPartIds).toEqual([ratchetLow.id])
  })

  it('已被實體配裝占用的零件不算可用（第 31 節）', () => {
    const r = analyzeCombo(
      args({
        lots: [lot(attackBlade.id, 1), lot(ratchetLow.id, 1), lot(bitFlat.id, 1)],
        combos: [
          {
            id: 'built',
            nameZhTW: '已組裝',
            system: 'BX',
            slots: { bladeId: attackBlade.id, ratchetId: ratchetLow.id, bitId: bitFlat.id },
            favorite: false,
            physicallyBuilt: true,
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      }),
    )
    expect(r.stock.sufficient).toBe(false)
  })

  it('包含資料可信度', () => {
    expect(['high', 'medium', 'low']).toContain(analyzeCombo(args()).confidence)
  })
})

describe('無法安裝的配置', () => {
  it('相容性失敗時 ok 為 false 並帶出錯誤標題', () => {
    const r = analyzeCombo(args({ slots: { bladeId: attackBlade.id, ratchetId: ratchetLow.id } }))
    expect(r.compatibility.ok).toBe(false)
    expect(r.compatibility.headlineZhTW).toBe('此組合無法實際安裝。')
  })

  it('無法安裝時不提供估算分數，避免誤導', () => {
    const r = analyzeCombo(args({ slots: { bladeId: attackBlade.id } }))
    expect(r.scores).toBeUndefined()
  })
})

describe('資料不足時不得硬給分數（第 1.5 節）', () => {
  it('缺少官方類型時可信度降為低並記錄缺漏', () => {
    const noType = part({ id: 'blade-notype', family: 'blade', spinDirection: 'right', officialWeightG: 34 })
    const r = analyzeCombo(
      args({
        slots: { bladeId: noType.id, ratchetId: ratchetLow.id, bitId: bitFlat.id },
        parts: [...allParts, noType],
      }),
    )
    expect(r.dataCompleteness.missingFieldsZhTW).toContain('官方類型')
    expect(r.confidence).toBe('low')
  })

  it('資料齊全但沒有賽事證據時可信度不得為高（第 20 節 C、D）', () => {
    const r = analyzeCombo(args())
    expect(r.confidence).not.toBe('high')
  })

  it('有足夠賽事樣本且來源為官方時可信度為高', () => {
    const r = analyzeCombo(
      args({
        evidence: { appearances: 12, top4: 5, championships: 2, totalDecks: 40, sourceTier: 'official' },
      }),
    )
    expect(r.confidence).toBe('high')
  })

  it('有賽事證據時附上 meta share 與 Wilson 區間', () => {
    const r = analyzeCombo(
      args({
        evidence: { appearances: 3, top4: 1, championships: 0, totalDecks: 12, sourceTier: 'community' },
      }),
    )
    expect(r.evidence?.metaShare.share).toBeCloseTo(0.25, 10)
    expect(r.evidence?.metaShare.interval.hasSample).toBe(true)
  })

  it('沒有賽事資料時顯示建置中訊息（第 24 節）', () => {
    const r = analyzeCombo(args())
    expect(r.evidence).toBeUndefined()
    expect(r.evidenceNoticeZhTW).toBe('賽事資料仍在建置中')
  })
})

describe('缺少官方資料時不得給出估算分數（第 1.5、49 節）', () => {
  const bladeNoType = part({ id: 'blade-plain', family: 'blade', spinDirection: 'right', officialWeightG: 34 })
  const bitNoContact = part({ id: 'bit-plain', family: 'bit', code: 'X', spinDirection: 'dual', officialWeightG: 3 })

  it('上蓋缺官方類型時不提供六軸分數', () => {
    const r = analyzeCombo(
      args({
        slots: { bladeId: bladeNoType.id, ratchetId: ratchetLow.id, bitId: bitFlat.id },
        parts: [...allParts, bladeNoType],
      }),
    )
    expect(r.compatibility.ok).toBe(true)
    expect(r.scores).toBeUndefined()
    expect(r.typeZhTW).toBe('資料不足')
  })

  it('軸心缺特性資料時不提供操作難度', () => {
    const r = analyzeCombo(
      args({
        slots: { bladeId: attackBlade.id, ratchetId: ratchetLow.id, bitId: bitNoContact.id },
        parts: [...allParts, bitNoContact],
      }),
    )
    expect(r.operationDifficulty).toBeUndefined()
  })

  it('資料齊全時仍正常提供分數與操作難度', () => {
    const r = analyzeCombo(args())
    expect(r.scores).toBeDefined()
    expect(typeof r.operationDifficulty).toBe('number')
  })
})
