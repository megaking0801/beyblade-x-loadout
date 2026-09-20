/**
 * 配裝 A/B 比較（純函式）。
 *
 * 規格對照：第 34 節（比較項目與新手取向）、第 38 節（新手模式白話說明）。
 */
import { getSlotSchema } from './compatibility.ts'
import { resolveDisplayName } from './naming.ts'
import type { ComboAnalysis } from './analysis.ts'
import type { ComboSlots, Part } from './types.ts'

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
  /** 兩套配裝之間換掉的槽位中文名稱。 */
  changedSlotsZhTW: string[]
  /** 同上，但帶前後零件名稱。 */
  changedSlots: ChangedSlot[]
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

export function compareCombos(args: CompareArgs): ComboComparison {
  const { a, b, parts } = args

  const changedSlots = diffSlots(a, b, parts)
  const changedSlotsZhTW = changedSlots.map((slot) => slot.slotZhTW)

  return {
    changedSlots,
    changedSlotsZhTW,
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
