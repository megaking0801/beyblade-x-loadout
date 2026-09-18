/**
 * 「我能組什麼」每一列要顯示什麼（純函式）。
 *
 * 規格對照：第 29 節（排序）、第 19 節（結果欄位）、第 20 節 B（模型推估要標示）。
 *
 * 放在 domain 而不是頁面裡，是為了能單獨測——這兩個判斷都有容易出錯的邊界
 * （沒有分數、沒有難度資料、缺件數為 0 卻判定不可組）。
 */
import type { ComboAnalysis } from './analysis.ts'
import type { BuildableSortKey } from './builder.ts'

export interface SortMetricView {
  labelZhTW: string
  valueZhTW: string
  /** 0–100 的長條比例。undefined 表示這一軸不畫條（資料不足，或本來就不是 0–100 的分數）。 */
  percent?: number
  /** 長條顏色的 CSS 變數。只有 percent 有值時才會被用到。 */
  color?: string
}

/**
 * 每一列畫哪一軸。
 *
 * 排序是使用者剛剛選的意圖，所以列上就顯示那一軸，而不是隨便挑三個數字。
 *
 * 只有「越高越好」的六軸分數才畫條。操作難度與賽事場次刻意不畫：
 * 難度是越低越好，畫出來會變成「數字 20 卻有一條 80% 長的條」，數字與視覺互相矛盾；
 * 場次是次數不是 0–100 的分數，畫條沒有分母。
 */
export function describeSortMetric(
  analysis: ComboAnalysis,
  sortBy: BuildableSortKey,
): SortMetricView {
  const axis = (labelZhTW: string, value: number | undefined, color: string): SortMetricView => ({
    labelZhTW,
    valueZhTW: value === undefined ? '資料不足' : String(value),
    ...(value === undefined ? {} : { percent: value, color }),
  })

  switch (sortBy) {
    case 'strength': {
      const scores = analysis.scores
      const value = scores
        ? Math.round(scores.attack * 0.2 + scores.defense * 0.15 + scores.stamina * 0.2 + scores.burst * 0.15 + scores.burstResistance * 0.15 + scores.stability * 0.15)
        : undefined
      return axis('整體強度', value, 'var(--signal)')
    }
    case 'attack':
      return axis('攻', analysis.scores?.attack, 'var(--type-attack)')
    case 'stamina':
      return axis('久', analysis.scores?.stamina, 'var(--type-stamina)')
    case 'stability':
      return axis('穩', analysis.scores?.stability, 'var(--type-defense)')
    case 'beginner':
    case 'simplest': {
      const difficulty = analysis.operationDifficulty
      return {
        labelZhTW: '操作難度',
        valueZhTW: difficulty === undefined ? '資料不足' : String(difficulty),
      }
    }
    case 'evidence': {
      const appearances = analysis.evidence?.appearances ?? 0
      return { labelZhTW: '賽事', valueZhTW: `${appearances} 場` }
    }
  }
}

export interface StockBadgeView {
  toneOk: boolean
  textZhTW: string
}

/**
 * 庫存狀態徽章。
 *
 * 差 1 件跟差 5 件對使用者的意義完全不同，不要混成同一個「庫存不足」。
 *
 * `computeStock` 在「一個槽位都沒解析到零件」時會回 `sufficient: false` 但缺件清單是空的
 * （`analysis.ts` 的 `order.length > 0` 條件）。那種狀態不能寫成「差 0 件」——
 * 那是自相矛盾的句子。改寫成「資料不足」，誠實講我們算不出來。
 */
export function describeStockBadge(analysis: ComboAnalysis): StockBadgeView {
  if (analysis.stock.sufficient) return { toneOk: true, textZhTW: '可組' }
  const missing = analysis.stock.missingPartIds.length
  if (missing === 0) return { toneOk: false, textZhTW: '資料不足' }
  return { toneOk: false, textZhTW: `差 ${missing} 件` }
}
