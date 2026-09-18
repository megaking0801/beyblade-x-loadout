/**
 * 配裝 A/B 比較（純函式）。
 *
 * 規格對照：第 34 節（比較項目與新手取向）、第 38 節（新手模式白話說明）。
 */
import { getSlotSchema } from './compatibility.ts'
import { resolveDisplayName } from './naming.ts'
import type { ComboAnalysis } from './analysis.ts'
import { CONFIDENCE_ZH, type ComboSlots, type Confidence, type Part } from './types.ts'

export type ComparisonWinner = 'a' | 'b' | 'same'

export interface ComparisonRow {
  labelZhTW: string
  aValue: number | string
  bValue: number | string
  deltaZhTW: string
  better: ComparisonWinner
}

/**
 * 換掉的槽位，含前後零件名稱。
 *
 * 只給槽位名稱（「固鎖」）看不出換了什麼，前台要能寫成「固鎖 3-60 → 3-80」才有意義。
 * 一律用中文顯示名而不是 part.code —— 上蓋的 code 是日文假名，前台不得出現（第 1.4 節）。
 */
export interface ChangedSlot {
  slotZhTW: string
  fromZhTW: string
  toZhTW: string
}

export interface ComboComparison {
  rows: ComparisonRow[]
  /** 兩套配裝之間換掉的槽位中文名稱。 */
  changedSlotsZhTW: string[]
  /** 同上，但帶前後零件名稱。 */
  changedSlots: ChangedSlot[]
  summaryZhTW: string
}

export interface CompareSide {
  slots: ComboSlots
  analysis: ComboAnalysis
}

export interface CompareArgs {
  a: CompareSide
  b: CompareSide
  parts: Part[]
}

const CONFIDENCE_RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 }

type Direction = 'higher' | 'lower' | 'none'

function numericRow(
  labelZhTW: string,
  aValue: number,
  bValue: number,
  direction: Direction,
): ComparisonRow {
  let better: ComparisonWinner = 'same'
  if (direction !== 'none' && aValue !== bValue) {
    const aWins = direction === 'higher' ? aValue > bValue : aValue < bValue
    better = aWins ? 'a' : 'b'
  }
  return {
    labelZhTW,
    aValue,
    bValue,
    deltaZhTW: aValue === bValue ? '相同' : `差 ${Math.abs(aValue - bValue)}`,
    better,
  }
}

export function compareCombos(args: CompareArgs): ComboComparison {
  const { a, b, parts } = args

  const rows: ComparisonRow[] = [
    numericRow('攻擊', a.analysis.scores?.attack ?? 0, b.analysis.scores?.attack ?? 0, 'higher'),
    numericRow('防守', a.analysis.scores?.defense ?? 0, b.analysis.scores?.defense ?? 0, 'higher'),
    numericRow('持久', a.analysis.scores?.stamina ?? 0, b.analysis.scores?.stamina ?? 0, 'higher'),
    // 高度沒有絕對的好壞，只顯示差距，不判勝負。
    numericRow('高度', a.analysis.objective.heightCode ?? 0, b.analysis.objective.heightCode ?? 0, 'none'),
    numericRow('穩定', a.analysis.scores?.stability ?? 0, b.analysis.scores?.stability ?? 0, 'higher'),
    numericRow(
      '操作難度',
      a.analysis.operationDifficulty ?? 0,
      b.analysis.operationDifficulty ?? 0,
      'lower',
    ),
    numericRow(
      '賽事證據',
      a.analysis.evidence?.appearances ?? 0,
      b.analysis.evidence?.appearances ?? 0,
      'higher',
    ),
    confidenceRow(a.analysis.confidence, b.analysis.confidence),
  ]

  const changedSlots = diffSlots(a, b, parts)
  const changedSlotsZhTW = changedSlots.map((slot) => slot.slotZhTW)

  return {
    rows,
    changedSlots,
    changedSlotsZhTW,
    summaryZhTW: buildSummary(rows, changedSlotsZhTW),
  }
}

function confidenceRow(a: Confidence, b: Confidence): ComparisonRow {
  const rankA = CONFIDENCE_RANK[a]
  const rankB = CONFIDENCE_RANK[b]
  return {
    labelZhTW: '資料可信度',
    aValue: CONFIDENCE_ZH[a],
    bValue: CONFIDENCE_ZH[b],
    deltaZhTW: a === b ? '相同' : `A ${CONFIDENCE_ZH[a]} / B ${CONFIDENCE_ZH[b]}`,
    better: rankA === rankB ? 'same' : rankA > rankB ? 'a' : 'b',
  }
}

/** 沒選零件的槽位要寫「未選」，不能讓 undefined 漏到畫面上。 */
const UNSELECTED_ZH = '未選'

function diffSlots(a: CompareSide, b: CompareSide, parts: Part[]): ChangedSlot[] {
  const byId = new Map(parts.map((part) => [part.id, part]))
  const nameOf = (partId: string | undefined): string => {
    if (!partId) return UNSELECTED_ZH
    const part = byId.get(partId)
    // 圖鑑重建後舊配裝可能指到已消失的零件；寧可寫「未選」也不要印出內部 id。
    return part ? resolveDisplayName(part.naming).titleZhTW : UNSELECTED_ZH
  }

  const schema = getSlotSchema(a.analysis.system)
  const other = new Set(getSlotSchema(b.analysis.system).map((slot) => slot.key))
  const changed: ChangedSlot[] = []
  for (const slot of schema) {
    const from = nameOf(a.slots[slot.key])
    const to = nameOf(b.slots[slot.key])
    if (!other.has(slot.key)) {
      changed.push({ slotZhTW: slot.labelZhTW, fromZhTW: from, toZhTW: to })
      continue
    }
    if (a.slots[slot.key] !== b.slots[slot.key]) {
      changed.push({ slotZhTW: slot.labelZhTW, fromZhTW: from, toZhTW: to })
    }
  }
  // 只出現在 B 結構中的槽位也算換掉了。
  for (const slot of getSlotSchema(b.analysis.system)) {
    if (schema.some((s) => s.key === slot.key)) continue
    if (b.slots[slot.key]) {
      changed.push({
        slotZhTW: slot.labelZhTW,
        fromZhTW: UNSELECTED_ZH,
        toZhTW: nameOf(b.slots[slot.key]),
      })
    }
  }
  return changed
}

function buildSummary(rows: ComparisonRow[], changedSlotsZhTW: string[]): string {
  const aWins = rows.filter((row) => row.better === 'a').map((row) => row.labelZhTW)
  const bWins = rows.filter((row) => row.better === 'b').map((row) => row.labelZhTW)

  const changePart =
    changedSlotsZhTW.length === 0
      ? '兩套配裝完全相同'
      : `只換了${changedSlotsZhTW.join('、')}`

  if (aWins.length === 0 && bWins.length === 0) {
    return `${changePart}，各項數據沒有差別。`
  }

  const pieces: string[] = [changePart]
  if (aWins.length > 0) pieces.push(`A 在 ${aWins.join('、')} 較好`)
  if (bWins.length > 0) pieces.push(`B 在 ${bWins.join('、')} 較好`)
  return `${pieces.join('；')}。以上分數為模型推估。`
}
