/**
 * 配裝 A/B 比較（純函式）。
 *
 * 規格對照：第 34 節（比較項目與新手取向）、第 38 節（新手模式白話說明）。
 */
import { getSlotSchema } from './compatibility.ts'
import { resolveDisplayName } from './naming.ts'
import type { ComboAnalysis } from './analysis.ts'
import type { ComboSlots, Part } from './types.ts'

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

export type MatchupOutcome = 'a_advantage' | 'b_advantage' | 'even' | 'unavailable'

/**
 * 對打傾向只是一個可重現的模型結果，不是逐場賽果推得的真實勝率。
 * 機率刻意限制在 25–75%，因為發射、場地、零件個體差異都能改變勝負。
 */
export interface MatchupPrediction {
  outcome: MatchupOutcome
  aModelProbability?: number
  bModelProbability?: number
  reasonsZhTW: string[]
  noticeZhTW: string
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
    numericRow('爆發', a.analysis.scores?.burst ?? 0, b.analysis.scores?.burst ?? 0, 'higher'),
    numericRow('抗爆', a.analysis.scores?.burstResistance ?? 0, b.analysis.scores?.burstResistance ?? 0, 'higher'),
    numericRow('穩定', a.analysis.scores?.stability ?? 0, b.analysis.scores?.stability ?? 0, 'higher'),
    numericRow(
      '操作難度',
      a.analysis.operationDifficulty ?? 0,
      b.analysis.operationDifficulty ?? 0,
      'lower',
    ),
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

export function predictMatchup(a: ComboAnalysis, b: ComboAnalysis): MatchupPrediction {
  if (!a.compatibility.ok || !b.compatibility.ok || !a.scores || !b.scores) {
    return {
      outcome: 'unavailable',
      reasonsZhTW: [],
      noticeZhTW: '其中一套尚未完成、無法實際安裝或缺少類型資料，不能產生模型預測。',
    }
  }

  /*
   * 不直接平均六軸。那會讓「A 有很強的擊出壓力、B 有很強的持久」互相抵銷，
   * 最後只剩沒有用的 50/50。改用兩條能說明贏法的對戰路線：
   *
   * - 擊出路線：攻擊、爆發，對上對手的防守、抗爆與穩定。
   * - 拖時間路線：持久為主，搭配穩定、防守與抗爆；同時扣掉對手的擊出壓力。
   *
   * 全部仍是模型推估，不能當真實賽果或官方剋制表。
   */
  const koPressureA = a.scores.attack * 0.6 + a.scores.burst * 0.4
  const koPressureB = b.scores.attack * 0.6 + b.scores.burst * 0.4
  const koResistanceA = a.scores.defense * 0.35 + a.scores.burstResistance * 0.4 + a.scores.stability * 0.25
  const koResistanceB = b.scores.defense * 0.35 + b.scores.burstResistance * 0.4 + b.scores.stability * 0.25
  const koDifference = (koPressureA - koResistanceB) - (koPressureB - koResistanceA)

  const survivalA = a.scores.stamina * 0.65 + a.scores.stability * 0.2 + a.scores.defense * 0.1 + a.scores.burstResistance * 0.05
  const survivalB = b.scores.stamina * 0.65 + b.scores.stability * 0.2 + b.scores.defense * 0.1 + b.scores.burstResistance * 0.05
  const survivalDifference = (survivalA - koPressureB * 0.2) - (survivalB - koPressureA * 0.2)

  // 標準 X 對戰盤先以擊出路線 65%、拖時間 35% 合成：X Dash 與爆發是
  // 對局提早結束的主要變數，不能再與拖時間路線等權抵銷成沒有判別力的 50/50。
  const matchupDifference = koDifference * 0.65 + survivalDifference * 0.35
  // 機率是未校正模型，只能表示相對傾向；仍限制在 20–80%，避免過度自信。
  const aModelProbability = Math.round(Math.max(20, Math.min(80, 50 + matchupDifference * 1.25)))
  const bModelProbability = 100 - aModelProbability
  const outcome: MatchupOutcome =
    Math.abs(matchupDifference) < 3 ? 'even' : matchupDifference > 0 ? 'a_advantage' : 'b_advantage'
  const winner = matchupDifference >= 0 ? 'A' : 'B'
  const reasonsZhTW = [
    `${koDifference >= 0 ? 'A' : 'B'} 的擊出路線較有利（攻擊／爆發對防守／抗爆／穩定）`,
    `${survivalDifference >= 0 ? 'A' : 'B'} 的拖時間路線較有利（持久／穩定對對手的擊出壓力）`,
  ]

  return {
    outcome,
    aModelProbability,
    bModelProbability,
    reasonsZhTW,
    noticeZhTW:
      outcome === 'even'
        ? '兩條對戰路線互有優勢，模型判為勝負難分。這不是實戰勝率。'
        : `${winner} 的整體對戰路線較佔優；此為標準 X 對戰盤、同等熟練度與正常發射下的模型推估，不是真實勝率。`,
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
