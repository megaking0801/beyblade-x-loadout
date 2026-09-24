import { describe, expect, it } from 'vitest'
import { generateBuildableCombos } from '../../src/domain/builder.ts'
import type { InventoryLot, Part, SavedCombo } from '../../src/domain/types.ts'

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

const bladeAttack = part({ id: 'b-atk', family: 'blade', type: 'attack', spinDirection: 'right', officialWeightG: 34 })
const bladeStamina = part({ id: 'b-sta', family: 'blade', type: 'stamina', spinDirection: 'right', officialWeightG: 34 })
const bladeDefense = part({ id: 'b-def', family: 'blade', type: 'defense', spinDirection: 'right', officialWeightG: 34 })
const bladeLeft = part({ id: 'b-left', family: 'blade', type: 'attack', spinDirection: 'left', officialWeightG: 34 })
const ratchet60 = part({ id: 'r-60', family: 'ratchet', code: '3-60', spinDirection: 'dual', heightCode: 60, officialWeightG: 6 })
const ratchet80 = part({ id: 'r-80', family: 'ratchet', code: '9-80', spinDirection: 'dual', heightCode: 80, officialWeightG: 7 })
const bitFlat = part({ id: 'bit-f', family: 'bit', code: 'F', type: 'attack', spinDirection: 'dual', officialWeightG: 3, bitContact: 'flat' })
const bitBall = part({ id: 'bit-b', family: 'bit', code: 'B', type: 'stamina', spinDirection: 'dual', officialWeightG: 3, bitContact: 'ball' })
const bitRightOnly = part({ id: 'bit-right', family: 'bit', code: 'RO', type: 'attack', spinDirection: 'right', officialWeightG: 3, bitContact: 'point' })
const integratedBlade = part({ id: 'b-integrated', family: 'integrated_blade', code: 'IG', spinDirection: 'right', integratedRatchet: true })
const integratedBit = part({ id: 'bit-integrated', family: 'bit', code: 'IT', spinDirection: 'dual', integratedRatchet: true })

const parts: Part[] = [bladeAttack, bladeStamina, bladeDefense, bladeLeft, ratchet60, ratchet80, bitFlat, bitBall, bitRightOnly]

function lot(partId: string, quantity = 1, status: InventoryLot['status'] = 'available'): InventoryLot {
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

const baseArgs = { parts, rules: [], combos: [] as SavedCombo[] }

describe('只用我有的零件產生配置（第 29 節、第 17 節模式一）', () => {
  it('庫存為空時產生不出任何配置', () => {
    expect(generateBuildableCombos({ ...baseArgs, lots: [], mode: 'owned' })).toEqual([])
  })

  it('剛好一組零件時產生一個配置', () => {
    const r = generateBuildableCombos({
      ...baseArgs,
      lots: [lot(bladeAttack.id), lot(ratchet60.id), lot(bitFlat.id)],
      mode: 'owned',
    })
    expect(r).toHaveLength(1)
    expect(r[0]!.slots).toEqual({ bladeId: 'b-atk', ratchetId: 'r-60', bitId: 'bit-f' })
  })

  it('兩個上蓋時產生兩個配置', () => {
    const r = generateBuildableCombos({
      ...baseArgs,
      lots: [lot(bladeAttack.id), lot(bladeStamina.id), lot(ratchet60.id), lot(bitFlat.id)],
      mode: 'owned',
    })
    expect(r).toHaveLength(2)
  })

  it('未到貨的零件不能用來產生配置（第 15、16 節）', () => {
    const r = generateBuildableCombos({
      ...baseArgs,
      lots: [lot(bladeAttack.id), lot(ratchet60.id, 1, 'ordered'), lot(bitFlat.id)],
      mode: 'owned',
    })
    expect(r).toEqual([])
  })

  it('已被實體配裝占用的零件不能再用（第 31 節）', () => {
    const built: SavedCombo = {
      id: 'built',
      nameZhTW: '已組裝',
      system: 'BX',
      slots: { bladeId: bladeAttack.id, ratchetId: ratchet60.id, bitId: bitFlat.id },
      favorite: false,
      physicallyBuilt: true,
      createdAt: '2026-01-01T00:00:00.000Z',
    }
    const r = generateBuildableCombos({
      ...baseArgs,
      combos: [built],
      lots: [lot(bladeAttack.id), lot(ratchet60.id), lot(bitFlat.id)],
      mode: 'owned',
    })
    expect(r).toEqual([])
  })

  it('同一零件有兩個時仍可產生使用它的多個配置', () => {
    const r = generateBuildableCombos({
      ...baseArgs,
      lots: [lot(bladeAttack.id), lot(bladeStamina.id), lot(ratchet60.id, 2), lot(bitFlat.id, 2)],
      mode: 'owned',
    })
    expect(r).toHaveLength(2)
  })

  it('旋向衝突的組合不會出現在結果中（第 18 節）', () => {
    const r = generateBuildableCombos({
      ...baseArgs,
      lots: [lot(bladeLeft.id), lot(ratchet60.id), lot(bitRightOnly.id)],
      mode: 'owned',
    })
    expect(r).toEqual([])
  })
})

describe('顯示全部圖鑑與假想購買模式（第 17 節模式二、三）', () => {
  it('圖鑑模式不受庫存限制', () => {
    const r = generateBuildableCombos({ ...baseArgs, lots: [], mode: 'catalog' })
    expect(r.length).toBeGreaterThan(0)
  })

  it('圖鑑模式會標示庫存是否足夠', () => {
    const r = generateBuildableCombos({ ...baseArgs, lots: [], mode: 'catalog' })
    expect(r.every((row) => row.analysis.stock.sufficient === false)).toBe(true)
  })

  it('假想購買模式可加入尚未擁有的指定零件', () => {
    const r = generateBuildableCombos({
      ...baseArgs,
      lots: [lot(bladeAttack.id), lot(ratchet60.id)],
      mode: 'hypothetical',
      hypotheticalPartIds: [bitFlat.id],
    })
    expect(r).toHaveLength(1)
    expect(r[0]!.slots.bitId).toBe(bitFlat.id)
  })

  it('假想購買模式沒有指定零件時等同只用庫存', () => {
    const r = generateBuildableCombos({
      ...baseArgs,
      lots: [lot(bladeAttack.id), lot(ratchet60.id)],
      mode: 'hypothetical',
    })
    expect(r).toEqual([])
  })
})

describe('固鎖一體型零件的可達性', () => {
  it('一體式上蓋不用任何固鎖也能產生可安裝配置', () => {
    const r = generateBuildableCombos({
      parts: [integratedBlade, bitBall], rules: [], lots: [lot(integratedBlade.id), lot(bitBall.id)], combos: [], mode: 'owned',
    })
    expect(r).toHaveLength(1)
    expect(r[0]!.slots).toEqual({ bladeId: integratedBlade.id, bitId: bitBall.id })
    expect(r[0]!.analysis.compatibility.ok).toBe(true)
  })

  it('一體式軸心不用任何固鎖也能產生可安裝配置', () => {
    const r = generateBuildableCombos({
      parts: [bladeAttack, integratedBit], rules: [], lots: [lot(bladeAttack.id), lot(integratedBit.id)], combos: [], mode: 'owned',
    })
    expect(r).toHaveLength(1)
    expect(r[0]!.slots).toEqual({ bladeId: bladeAttack.id, bitId: integratedBit.id })
  })

  it('一般三件式仍一定配有固鎖', () => {
    const r = generateBuildableCombos({ ...baseArgs, lots: [lot(bladeAttack.id), lot(ratchet60.id), lot(bitFlat.id)], mode: 'owned' })
    expect(r[0]!.slots.ratchetId).toBe(ratchet60.id)
  })
})

describe('排序方式（第 29 節）', () => {
  const lots = [
    lot(bladeAttack.id),
    lot(bladeStamina.id),
    lot(bladeDefense.id),
    lot(ratchet60.id),
    lot(ratchet80.id),
    lot(bitFlat.id),
    lot(bitBall.id),
  ]

  it('攻擊最高排序時第一名的攻擊比重最高', () => {
    const r = generateBuildableCombos({ ...baseArgs, lots, mode: 'owned', sortBy: 'attack' })
    const weights = r.map((row) => row.analysis.typeWeight?.attack ?? 0)
    expect(weights[0]).toBe(Math.max(...weights))
  })

  it('持久最高排序時第一名的持久比重最高', () => {
    const r = generateBuildableCombos({ ...baseArgs, lots, mode: 'owned', sortBy: 'stamina' })
    const weights = r.map((row) => row.analysis.typeWeight?.stamina ?? 0)
    expect(weights[0]).toBe(Math.max(...weights))
  })

  it('最穩排序時第一名的防守比重最高', () => {
    // bladeDefense 是這批 fixture 裡唯一的防守型零件，用它確認「最穩」真的是
    // 依防守比重排序，不是巧合排第一（原本的 fixture 沒有防守型零件，會讓
    // 這條測試不管邏輯對不對都過）。
    const r = generateBuildableCombos({ ...baseArgs, lots, mode: 'owned', sortBy: 'stability' })
    const weights = r.map((row) => row.analysis.typeWeight?.defense ?? 0)
    expect(weights[0]).toBe(Math.max(...weights))
    expect(weights[0]).toBeGreaterThan(0)
  })

  it('最適合新手與操作最簡單排序時第一名的操作難度最低', () => {
    for (const sortBy of ['beginner', 'simplest'] as const) {
      const r = generateBuildableCombos({ ...baseArgs, lots, mode: 'owned', sortBy })
      const difficulties = r.map((row) => row.analysis.operationDifficulty!)
      expect(difficulties[0]).toBe(Math.min(...difficulties))
    }
  })

  it('賽事證據最多排序時有證據的排在沒有證據的前面', () => {
    const r = generateBuildableCombos({
      ...baseArgs,
      lots,
      mode: 'owned',
      sortBy: 'evidence',
      evidenceByCode: {
        'b-sta 9-80B': { appearances: 5, top4: 2, championships: 1, totalDecks: 20, sourceTier: 'official' },
      },
    })
    expect(r[0]!.analysis.fullCode).toBe('b-sta 9-80B')
    expect(r[0]!.analysis.evidence?.appearances).toBe(5)
  })

  it('上限參數會限制回傳數量', () => {
    const r = generateBuildableCombos({ ...baseArgs, lots, mode: 'owned', limit: 3 })
    expect(r).toHaveLength(3)
  })

  it('上限為 0 時回空陣列', () => {
    expect(generateBuildableCombos({ ...baseArgs, lots, mode: 'owned', limit: 0 })).toEqual([])
  })

  it('產生的每個配置都是可實際安裝的', () => {
    const r = generateBuildableCombos({ ...baseArgs, lots, mode: 'owned' })
    expect(r.every((row) => row.analysis.compatibility.ok)).toBe(true)
    // 3 顆上蓋（攻擊／持久／防守）× 2 顆固鎖 × 2 顆軸心 = 12。
    expect(r.length).toBe(12)
  })
})
