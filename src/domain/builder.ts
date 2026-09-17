/**
 * 「我現在能組什麼」配置產生器（純函式）。
 *
 * 規格對照：第 17 節（配裝器三種模式）、第 18 節（相容性）、第 29 節（排序方式）、
 * 第 31 節（實體鎖定占用）。
 */
import {
  analyzeCombo,
  comboFullCode,
  estimateOperationDifficulty,
  estimateScores,
  type ComboAnalysis,
  type EvidenceInput,
} from './analysis.ts'
import { computeAvailabilityMap } from './inventory.ts'
import type {
  CompatibilityRule,
  ComboSlots,
  InventoryLot,
  Part,
  SavedCombo,
} from './types.ts'

/** 第 17 節：三種模式。 */
export type BuilderMode = 'owned' | 'catalog' | 'hypothetical'

/** 第 29 節：排序方式。 */
export type BuildableSortKey =
  | 'beginner'
  | 'attack'
  | 'stamina'
  | 'stability'
  | 'evidence'
  | 'simplest'

export interface GenerateArgs {
  parts: Part[]
  rules: CompatibilityRule[]
  lots: InventoryLot[]
  combos: SavedCombo[]
  mode: BuilderMode
  /** 假想購買模式下額外視為可用的零件。 */
  hypotheticalPartIds?: string[]
  sortBy?: BuildableSortKey
  limit?: number
  /** 以配置型號為鍵的賽事證據（第 21 節）。 */
  evidenceByCode?: Record<string, EvidenceInput>
}

export interface BuildableCombo {
  slots: ComboSlots
  analysis: ComboAnalysis
}

function usablePartIds(args: GenerateArgs): Set<string> | null {
  const { mode, lots, combos, hypotheticalPartIds } = args
  if (mode === 'catalog') return null

  const availability = computeAvailabilityMap(lots, combos)
  const usable = new Set<string>()
  for (const [partId, row] of availability) {
    if (row.free > 0) usable.add(partId)
  }
  if (mode === 'hypothetical') {
    for (const partId of hypotheticalPartIds ?? []) usable.add(partId)
  }
  return usable
}

function enumerateSlots(parts: Part[]): ComboSlots[] {
  const blades = parts.filter((p) => p.family === 'blade' || p.family === 'integrated_blade')
  const ratchets = parts.filter((p) => p.family === 'ratchet')
  const bits = parts.filter((p) => p.family === 'bit')
  const lockChips = parts.filter((p) => p.family === 'lock_chip')
  const mainBlades = parts.filter((p) => p.family === 'main_blade')
  const overBlades = parts.filter((p) => p.family === 'over_blade')
  const assistBlades = parts.filter((p) => p.family === 'assist_blade')

  const result: ComboSlots[] = []
  for (const blade of blades) {
    for (const ratchet of ratchets) {
      for (const bit of bits) {
        result.push({ bladeId: blade.id, ratchetId: ratchet.id, bitId: bit.id })
      }
    }
  }

  /*
   * CX：
   *  - cxFused 的主刃已含鎖定紋章，所以不配鎖定紋章（圖鑑目前全是這種，
   *    以前寫成一定要有 lock_chip 零件，等於 CX 永遠枚舉不出東西）。
   *  - 只有四件式（cxOverBlade）的主刃才要再配一片超越戰刃。
   */
  for (const main of mainBlades) {
    const chipOptions: (Part | undefined)[] = main.cxFused ? [undefined] : lockChips
    const overOptions: (Part | undefined)[] = main.cxOverBlade ? overBlades : [undefined]
    for (const chip of chipOptions) {
      for (const over of overOptions) {
        if (main.cxOverBlade && !over) continue
        for (const assist of assistBlades) {
          for (const ratchet of ratchets) {
            for (const bit of bits) {
              result.push({
                ...(chip ? { lockChipId: chip.id } : {}),
                mainBladeId: main.id,
                ...(over ? { overBladeId: over.id } : {}),
                assistBladeId: assist.id,
                ratchetId: ratchet.id,
                bitId: bit.id,
              })
            }
          }
        }
      }
    }
  }
  return result
}

function sortValue(row: BuildableCombo, sortBy: BuildableSortKey): number {
  const { analysis } = row
  switch (sortBy) {
    case 'attack':
      return -(analysis.scores?.attack ?? -1)
    case 'stamina':
      return -(analysis.scores?.stamina ?? -1)
    case 'stability':
      return -(analysis.scores?.stability ?? -1)
    case 'evidence':
      return -(analysis.evidence?.appearances ?? -1)
    case 'beginner':
    case 'simplest':
      // 沒有操作難度資料的配置排最後，不假裝它簡單。
      return analysis.operationDifficulty ?? Number.POSITIVE_INFINITY
  }
}

/**
 * 產生可組配置。
 *
 * - owned：只用可用且未被實體配裝占用的零件。
 * - catalog：不受庫存限制，但仍會標示庫存不足。
 * - hypothetical：庫存加上指定的假想購買零件。
 *
 * 產出的每個配置都通過第 18 節相容性檢查，無法安裝的組合不會出現。
 */
/** 拆出配裝中的零件，供便宜評分使用。 */
interface SlotParts {
  blade?: Part
  ratchet?: Part
  bit?: Part
  extras: Part[]
}

function resolveSlotParts(slots: ComboSlots, byId: Map<string, Part>): SlotParts {
  const blade = slots.bladeId
    ? byId.get(slots.bladeId)
    : slots.mainBladeId
      ? byId.get(slots.mainBladeId)
      : undefined
  const ratchet = slots.ratchetId ? byId.get(slots.ratchetId) : undefined
  const bit = slots.bitId ? byId.get(slots.bitId) : undefined
  const extras: Part[] = []
  for (const key of ['lockChipId', 'overBladeId', 'assistBladeId'] as const) {
    const id = slots[key]
    if (!id) continue
    const part = byId.get(id)
    if (part) extras.push(part)
  }
  return { ...(blade ? { blade } : {}), ...(ratchet ? { ratchet } : {}), ...(bit ? { bit } : {}), extras }
}

/** 左右旋混用是機構上不可能的，先便宜地擋掉，不必跑完整相容性檢查。 */
function hasSpinConflict(slotParts: SlotParts): boolean {
  let right = false
  let left = false
  const all = [slotParts.blade, slotParts.ratchet, slotParts.bit, ...slotParts.extras]
  for (const part of all) {
    if (!part?.spinDirection || part.spinDirection === 'dual') continue
    if (part.spinDirection === 'right') right = true
    else left = true
  }
  return right && left
}

/** 標準三件式的型號字串，用來對賽事資料。CX 的賽事資料目前沒有，所以不算。 */
function standardCode(slotParts: SlotParts): string | null {
  if (!slotParts.blade || !slotParts.ratchet || !slotParts.bit) return null
  if (slotParts.extras.length > 0) return null
  return `${slotParts.blade.code} ${slotParts.ratchet.code}${slotParts.bit.code}`
}

/**
 * 便宜的排序值，與 sortValue 使用同一組公式（estimateScores／操作難度），
 * 所以先用它挑出前幾名、再對勝出者做完整分析，排序結果不會跟著跑掉。
 */
function cheapSortValue(
  slotParts: SlotParts,
  sortBy: BuildableSortKey,
  evidenceByCode: Record<string, EvidenceInput> | undefined,
): number {
  if (sortBy === 'evidence') {
    if (!evidenceByCode) return 1
    const code = standardCode(slotParts)
    const appearances = code ? evidenceByCode[code]?.appearances : undefined
    return -(appearances ?? -1)
  }

  if (sortBy === 'beginner' || sortBy === 'simplest') {
    const difficulty = estimateOperationDifficulty(slotParts.bit, slotParts.ratchet, slotParts.blade)
    return difficulty ?? Number.POSITIVE_INFINITY
  }

  if (!slotParts.blade?.type) return 1
  const scores = estimateScores({
    ...(slotParts.blade ? { blade: slotParts.blade } : {}),
    ...(slotParts.ratchet ? { ratchet: slotParts.ratchet } : {}),
    ...(slotParts.bit ? { bit: slotParts.bit } : {}),
    extras: slotParts.extras,
  })
  switch (sortBy) {
    case 'attack':
      return -scores.attack
    case 'stamina':
      return -scores.stamina
    case 'stability':
      return -scores.stability
  }
}

/**
 * 產生可組配置。
 *
 * - owned：只用可用且未被實體配裝占用的零件。
 * - catalog：不受庫存限制，但仍會標示庫存不足。
 * - hypothetical：庫存加上指定的假想購買零件。
 *
 * 產出的每個配置都通過第 18 節相容性檢查，無法安裝的組合不會出現。
 *
 * 效能：圖鑑模式的組合數可達十幾萬，每一筆都跑完整 analyzeCombo 會讓畫面卡住
 * （實測過 28 秒）。所以先用便宜評分排序，再只對前段做完整分析，
 * 直到收集到 limit 筆為止。
 */
export function generateBuildableCombos(args: GenerateArgs): BuildableCombo[] {
  const { parts, rules, lots, combos, sortBy = 'beginner', limit, evidenceByCode } = args
  if (limit !== undefined && limit <= 0) return []

  const usable = usablePartIds(args)
  const pool = usable ? parts.filter((part) => usable.has(part.id)) : parts
  const byId = new Map(parts.map((part) => [part.id, part]))

  const candidates: { slots: ComboSlots; cheapValue: number; tieBreak: string }[] = []
  for (const slots of enumerateSlots(pool)) {
    const slotParts = resolveSlotParts(slots, byId)
    if (hasSpinConflict(slotParts)) continue
    candidates.push({
      slots,
      cheapValue: cheapSortValue(slotParts, sortBy, evidenceByCode),
      tieBreak: `${slotParts.blade?.code ?? ''} ${slotParts.ratchet?.code ?? ''}${slotParts.bit?.code ?? ''}`,
    })
  }

  candidates.sort((a, b) => {
    const diff = a.cheapValue - b.cheapValue
    if (diff !== 0) return diff
    return a.tieBreak.localeCompare(b.tieBreak)
  })

  const rows: BuildableCombo[] = []
  for (const candidate of candidates) {
    const code = comboFullCode(candidate.slots, parts)
    const evidence = evidenceByCode?.[code]
    const analysis = analyzeCombo({
      slots: candidate.slots,
      parts,
      rules,
      lots,
      combos,
      ...(evidence ? { evidence } : {}),
    })
    if (!analysis.compatibility.ok) continue
    rows.push({ slots: candidate.slots, analysis })
    if (limit !== undefined && rows.length >= limit) break
  }

  rows.sort((a, b) => {
    const diff = sortValue(a, sortBy) - sortValue(b, sortBy)
    if (diff !== 0) return diff
    return a.analysis.fullCode.localeCompare(b.analysis.fullCode)
  })

  return rows
}
