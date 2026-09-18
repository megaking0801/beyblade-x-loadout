import { describe, expect, it } from 'vitest'
import { analyzeCombo } from '../../src/domain/analysis.ts'
import { compareCombos } from '../../src/domain/compare.ts'
import type { Part } from '../../src/domain/types.ts'

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
const r60 = part({ id: 'r-60', family: 'ratchet', code: '3-60', spinDirection: 'dual', heightCode: 60, officialWeightG: 6 })
const r80 = part({ id: 'r-80', family: 'ratchet', code: '9-80', spinDirection: 'dual', heightCode: 80, officialWeightG: 7 })
const bitF = part({ id: 'bit-f', family: 'bit', code: 'F', type: 'attack', spinDirection: 'dual', officialWeightG: 3, bitContact: 'flat' })
const bitB = part({ id: 'bit-b', family: 'bit', code: 'B', type: 'stamina', spinDirection: 'dual', officialWeightG: 3, bitContact: 'ball' })

const parts = [blade, r60, r80, bitF, bitB]

function analyze(ratchetId: string, bitId: string) {
  const slots = { bladeId: blade.id, ratchetId, bitId }
  return { slots, analysis: analyzeCombo({ slots, parts, rules: [], lots: [], combos: [] }) }
}

describe('配裝 A/B 比較（第 34 節）', () => {
  const a = analyze(r60.id, bitF.id)
  const b = analyze(r80.id, bitB.id)

  it('列出第 34 節要求的所有比較項目', () => {
    const r = compareCombos({ a, b, parts })
    expect(r.rows.map((row) => row.labelZhTW)).toEqual([
      '攻擊',
      '防守',
      '持久',
      '高度',
      '穩定',
      '操作難度',
      '賽事證據',
      '資料可信度',
    ])
  })

  it('換掉的槽位要帶前後零件名稱，讓前台能寫成「固鎖 A → B」', () => {
    const r = compareCombos({ a, b, parts })
    // 用中文顯示名，不是 part.code —— 上蓋的 code 是日文假名，前台不得出現（第 1.4 節）。
    expect(r.changedSlots).toEqual([
      { slotZhTW: '固鎖', fromZhTW: '中文-r-60', toZhTW: '中文-r-80' },
      { slotZhTW: '軸心', fromZhTW: '中文-bit-f', toZhTW: '中文-bit-b' },
    ])
  })

  it('沒選零件的槽位要寫「未選」，不能顯示 undefined', () => {
    const empty = {
      slots: { bladeId: blade.id, ratchetId: r60.id },
      analysis: analyzeCombo({
        slots: { bladeId: blade.id, ratchetId: r60.id },
        parts,
        rules: [],
        lots: [],
        combos: [],
      }),
    }
    const r = compareCombos({ a, b: empty, parts })
    const bit = r.changedSlots.find((row) => row.slotZhTW === '軸心')
    expect(bit).toEqual({ slotZhTW: '軸心', fromZhTW: '中文-bit-f', toZhTW: '未選' })
  })

  it('標出只換了哪些零件，方便新手理解差異', () => {
    const r = compareCombos({ a, b, parts })
    expect(r.changedSlotsZhTW).toEqual(['固鎖', '軸心'])
  })

  it('只換軸心時只標出軸心', () => {
    const r = compareCombos({ a, b: analyze(r60.id, bitB.id), parts })
    expect(r.changedSlotsZhTW).toEqual(['軸心'])
  })

  it('完全相同時沒有變更的零件', () => {
    const r = compareCombos({ a, b: analyze(r60.id, bitF.id), parts })
    expect(r.changedSlotsZhTW).toEqual([])
  })

  it('攻擊項目由分數較高者勝出', () => {
    const r = compareCombos({ a, b, parts })
    const row = r.rows.find((x) => x.labelZhTW === '攻擊')!
    expect(row.aValue).toBeGreaterThan(row.bValue as number)
    expect(row.better).toBe('a')
  })

  it('持久項目由分數較高者勝出', () => {
    const r = compareCombos({ a, b, parts })
    const row = r.rows.find((x) => x.labelZhTW === '持久')!
    expect(row.better).toBe('b')
  })

  it('操作難度較低者勝出', () => {
    const r = compareCombos({ a, b, parts })
    const row = r.rows.find((x) => x.labelZhTW === '操作難度')!
    expect(row.better).toBe('b')
  })

  it('數值相同時判為平手', () => {
    const r = compareCombos({ a, b: analyze(r60.id, bitF.id), parts })
    expect(r.rows.every((row) => row.better === 'same')).toBe(true)
  })

  it('高度項目顯示毫米差距', () => {
    const r = compareCombos({ a, b, parts })
    const row = r.rows.find((x) => x.labelZhTW === '高度')!
    expect(row.aValue).toBe(60)
    expect(row.bValue).toBe(80)
    expect(row.deltaZhTW).toBe('差 20')
  })

  it('沒有賽事資料時兩邊都顯示為 0 場並判平手', () => {
    const r = compareCombos({ a, b, parts })
    const row = r.rows.find((x) => x.labelZhTW === '賽事證據')!
    expect(row.aValue).toBe(0)
    expect(row.bValue).toBe(0)
    expect(row.better).toBe('same')
  })

  it('比較結果附帶白話總結，供新手模式顯示（第 38 節）', () => {
    const r = compareCombos({ a, b, parts })
    expect(r.summaryZhTW.length).toBeGreaterThan(0)
  })
})
