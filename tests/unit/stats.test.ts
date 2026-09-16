import { describe, expect, it } from 'vitest'
import {
  bayesianShrunkRate,
  canComputeWinRate,
  computeConfidence,
  computeMetaShare,
  computePlacementScore,
  computeWinRate,
  wilsonInterval,
} from '../../src/domain/stats.ts'

/**
 * 第 21 節：小樣本不可直接比較百分比，必須用 Wilson interval 或 Bayesian shrinkage。
 * 第 49.2 節：統計一律使用已知答案的測試向量，不得只靠目測合理。
 */

describe('Wilson interval（95%，已知答案向量）', () => {
  it('5/10 → [0.2366, 0.7634]', () => {
    const r = wilsonInterval(5, 10)
    expect(r.lower).toBeCloseTo(0.2366, 4)
    expect(r.upper).toBeCloseTo(0.7634, 4)
    expect(r.center).toBeCloseTo(0.5, 6)
  })

  it('50/100 → [0.403832, 0.596168]，樣本變大區間變窄', () => {
    const small = wilsonInterval(5, 10)
    const big = wilsonInterval(50, 100)
    expect(big.lower).toBeCloseTo(0.403832, 6)
    expect(big.upper).toBeCloseTo(0.596168, 6)
    expect(big.upper - big.lower).toBeLessThan(small.upper - small.lower)
  })

  it('0/10 → [0, 0.2775]，下界不為負', () => {
    const r = wilsonInterval(0, 10)
    expect(r.lower).toBe(0)
    expect(r.upper).toBeCloseTo(0.2775, 4)
  })

  it('10/10 → [0.722467, 1]，上界剛好為 1', () => {
    const r = wilsonInterval(10, 10)
    expect(r.lower).toBeCloseTo(0.722467, 6)
    expect(r.upper).toBe(1)
  })

  it('樣本數 0 時回傳整個 [0, 1] 並標記無樣本', () => {
    const r = wilsonInterval(0, 0)
    expect(r).toEqual({ lower: 0, upper: 1, center: 0, hasSample: false })
  })

  it('成功數大於樣本數時視為無效輸入並丟出錯誤', () => {
    expect(() => wilsonInterval(11, 10)).toThrow('成功次數不可大於樣本數')
  })

  it('負數輸入丟出錯誤', () => {
    expect(() => wilsonInterval(-1, 10)).toThrow('次數不可為負數')
    expect(() => wilsonInterval(1, -10)).toThrow('次數不可為負數')
  })
})

describe('Bayesian shrinkage', () => {
  it('5/10 在先驗 0.2、強度 10 下收縮為 0.35', () => {
    expect(bayesianShrunkRate({ successes: 5, total: 10, priorMean: 0.2, priorStrength: 10 }))
      .toBeCloseTo(0.35, 10)
  })

  it('樣本為 0 時等於先驗值', () => {
    expect(bayesianShrunkRate({ successes: 0, total: 0, priorMean: 0.2, priorStrength: 10 }))
      .toBeCloseTo(0.2, 10)
  })

  it('樣本很大時趨近實際比例', () => {
    const r = bayesianShrunkRate({ successes: 900, total: 1000, priorMean: 0.2, priorStrength: 10 })
    expect(r).toBeGreaterThan(0.88)
    expect(r).toBeLessThan(0.9)
  })

  it('先驗強度 0 時等於原始比例', () => {
    expect(bayesianShrunkRate({ successes: 3, total: 4, priorMean: 0.2, priorStrength: 0 }))
      .toBeCloseTo(0.75, 10)
  })

  it('先驗強度為負數時丟出錯誤', () => {
    expect(() =>
      bayesianShrunkRate({ successes: 1, total: 2, priorMean: 0.2, priorStrength: -1 }),
    ).toThrow('先驗強度不可為負數')
  })
})

describe('Placement score（模型推估，公式須固定且可驗算）', () => {
  it('第 1 名為 1', () => {
    expect(computePlacementScore(1)).toBeCloseTo(1, 10)
  })

  it('第 2 名為 0.5、第 4 名為 1/3、第 8 名為 0.25', () => {
    expect(computePlacementScore(2)).toBeCloseTo(0.5, 10)
    expect(computePlacementScore(4)).toBeCloseTo(1 / 3, 10)
    expect(computePlacementScore(8)).toBeCloseTo(0.25, 10)
  })

  it('名次越後分數越低', () => {
    expect(computePlacementScore(16)).toBeLessThan(computePlacementScore(8))
  })

  it('名次小於 1 時丟出錯誤', () => {
    expect(() => computePlacementScore(0)).toThrow('名次必須大於或等於 1')
  })
})

describe('Meta share（第 21 節）', () => {
  it('出場 3 次、總名單 12 份時比例為 0.25，並附 Wilson 區間', () => {
    const r = computeMetaShare({ appearances: 3, totalDecks: 12 })
    expect(r.share).toBeCloseTo(0.25, 10)
    expect(r.interval.lower).toBeGreaterThan(0)
    expect(r.interval.upper).toBeLessThan(1)
    expect(r.interval.lower).toBeLessThan(0.25)
  })

  it('總名單 0 份時比例為 0 並標記無樣本', () => {
    const r = computeMetaShare({ appearances: 0, totalDecks: 0 })
    expect(r.share).toBe(0)
    expect(r.interval.hasSample).toBe(false)
  })
})

describe('勝率只有在有逐場對戰資料時才能算（第 21 節）', () => {
  it('只有 Top Cut 名單時不可計算勝率', () => {
    expect(canComputeWinRate({ hasMatchRecords: false, matches: 0 })).toBe(false)
  })

  it('有逐場對戰資料時可以計算', () => {
    expect(canComputeWinRate({ hasMatchRecords: true, matches: 20 })).toBe(true)
  })

  it('聲稱有逐場資料但場次為 0 時仍不可計算', () => {
    expect(canComputeWinRate({ hasMatchRecords: true, matches: 0 })).toBe(false)
  })

  it('沒有逐場資料卻呼叫 computeWinRate 時丟出錯誤，不得回傳猜測值', () => {
    expect(() => computeWinRate({ wins: 3, matches: 0, hasMatchRecords: false })).toThrow(
      '沒有逐場對戰資料，不可計算勝率',
    )
  })

  it('有逐場資料時回傳收縮後勝率與 Wilson 區間', () => {
    const r = computeWinRate({ wins: 12, matches: 20, hasMatchRecords: true })
    expect(r.rawRate).toBeCloseTo(0.6, 10)
    expect(r.interval.lower).toBeLessThan(0.6)
    expect(r.interval.upper).toBeGreaterThan(0.6)
    expect(r.shrunkRate).toBeLessThan(0.6)
    expect(r.shrunkRate).toBeGreaterThan(0.5)
  })
})

describe('可信度判定（第 20 節 D）', () => {
  it('樣本足夠且來源為官方時為高', () => {
    expect(computeConfidence({ sampleSize: 40, sourceTier: 'official' })).toBe('high')
  })

  it('樣本足夠但來源為社群時不得為高', () => {
    expect(computeConfidence({ sampleSize: 40, sourceTier: 'community' })).toBe('medium')
  })

  it('樣本不足時為低', () => {
    expect(computeConfidence({ sampleSize: 3, sourceTier: 'official' })).toBe('low')
  })

  it('完全沒有樣本時為低', () => {
    expect(computeConfidence({ sampleSize: 0, sourceTier: 'official' })).toBe('low')
  })

  it('使用者自行提交的資料最高只能到低', () => {
    expect(computeConfidence({ sampleSize: 500, sourceTier: 'user_submitted' })).toBe('low')
  })
})
