import { describe, expect, it } from 'vitest'
import { describeSortMetric, describeStockBadge } from '../../src/domain/buildableRows.ts'
import type { ComboAnalysis } from '../../src/domain/analysis.ts'

/** 只填這兩個判斷真正會讀到的欄位，其餘用最小骨架帶過。 */
function analysis(over: Partial<ComboAnalysis>): ComboAnalysis {
  return {
    system: 'BX',
    fullNameZhTW: '測試配裝',
    fullCode: 'test',
    typeZhTW: '攻擊',
    compatibility: { ok: true, errorsZhTW: [], warningsZhTW: [] },
    objective: { structureZhTW: 'BX 三件式', officialTypesZhTW: [] },
    estimateLabelZhTW: '模型推估',
    synergyNotesZhTW: [],
    launchSuggestionZhTW: '',
    prosZhTW: [],
    consZhTW: [],
    stock: { sufficient: true, missingPartIds: [] },
    dataCompleteness: { sufficient: true, missingFieldsZhTW: [] },
    confidence: 'medium',
    ...over,
  } as ComboAnalysis
}

const scores = {
  attack: 82,
  defense: 30,
  stamina: 28,
  burst: 75,
  burstResistance: 35,
  stability: 41,
}

describe('我能組什麼的每列顯示（第 29 節）', () => {
  it('依排序顯示對應的那一軸並畫條', () => {
    const r = describeSortMetric(analysis({ scores }), 'attack')
    expect(r).toEqual({
      labelZhTW: '攻',
      valueZhTW: '82',
      percent: 82,
      color: 'var(--type-attack)',
    })
  })

  it('沒有六軸分數時寫「資料不足」，而且不畫條', () => {
    const r = describeSortMetric(analysis({}), 'attack')
    expect(r.valueZhTW).toBe('資料不足')
    expect(r.percent).toBeUndefined()
    // 沒有比例就不該有顏色，否則畫面上會出現一條長度未定的色條。
    expect(r.color).toBeUndefined()
  })

  it('操作難度不畫條：越低越好，畫出來會跟數字互相矛盾', () => {
    const r = describeSortMetric(analysis({ operationDifficulty: 20, scores }), 'simplest')
    expect(r.labelZhTW).toBe('操作難度')
    expect(r.valueZhTW).toBe('20')
    expect(r.percent).toBeUndefined()
  })

  it('新手排序也是顯示操作難度', () => {
    expect(describeSortMetric(analysis({ operationDifficulty: 55 }), 'beginner').valueZhTW).toBe('55')
  })

  it('賽事排序顯示場次，不畫條（次數沒有 0–100 的分母）', () => {
    const r = describeSortMetric(analysis({}), 'evidence')
    expect(r).toEqual({ labelZhTW: '賽事', valueZhTW: '0 場' })
  })
})

describe('庫存徽章', () => {
  it('庫存夠就是可組', () => {
    expect(describeStockBadge(analysis({}))).toEqual({ toneOk: true, textZhTW: '可組' })
  })

  it('差 1 件與差多件要分開講，不要混成「庫存不足」', () => {
    expect(
      describeStockBadge(analysis({ stock: { sufficient: false, missingPartIds: ['p1'] } })),
    ).toEqual({ toneOk: false, textZhTW: '差 1 件' })
    expect(
      describeStockBadge(analysis({ stock: { sufficient: false, missingPartIds: ['p1', 'p2'] } })),
    ).toEqual({ toneOk: false, textZhTW: '差 2 件' })
  })

  it('判定不可組但缺件清單是空的時候，不能寫成「差 0 件」', () => {
    // computeStock 在一個槽位都沒解析到零件時會回這種狀態（analysis.ts 的 order.length > 0）。
    const r = describeStockBadge(analysis({ stock: { sufficient: false, missingPartIds: [] } }))
    expect(r.textZhTW).toBe('資料不足')
    expect(r.textZhTW).not.toContain('差 0')
  })
})
