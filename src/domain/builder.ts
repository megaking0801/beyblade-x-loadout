/**
 * 「我現在能組什麼」配置產生器（純函式）。
 *
 * 規格對照：第 17 節（配裝器三種模式）、第 18 節（相容性）、第 29 節（排序方式）、
 * 第 31 節（實體鎖定占用）。
 */
import { analyzeCombo, comboFullCode, type ComboAnalysis, type EvidenceInput } from './analysis.ts'
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
  const assistBlades = parts.filter((p) => p.family === 'assist_blade')

  const result: ComboSlots[] = []
  for (const blade of blades) {
    for (const ratchet of ratchets) {
      for (const bit of bits) {
        result.push({ bladeId: blade.id, ratchetId: ratchet.id, bitId: bit.id })
      }
    }
  }
  for (const chip of lockChips) {
    for (const main of mainBlades) {
      for (const assist of assistBlades) {
        for (const ratchet of ratchets) {
          for (const bit of bits) {
            result.push({
              lockChipId: chip.id,
              mainBladeId: main.id,
              assistBladeId: assist.id,
              ratchetId: ratchet.id,
              bitId: bit.id,
            })
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
export function generateBuildableCombos(args: GenerateArgs): BuildableCombo[] {
  const { parts, rules, lots, combos, sortBy = 'beginner', limit, evidenceByCode } = args
  if (limit !== undefined && limit <= 0) return []

  const usable = usablePartIds(args)
  const pool = usable ? parts.filter((part) => usable.has(part.id)) : parts

  const rows: BuildableCombo[] = []
  for (const slots of enumerateSlots(pool)) {
    const code = comboFullCode(slots, parts)
    const evidence = evidenceByCode?.[code]
    const analysis = analyzeCombo({
      slots,
      parts,
      rules,
      lots,
      combos,
      ...(evidence ? { evidence } : {}),
    })
    if (!analysis.compatibility.ok) continue
    rows.push({ slots, analysis })
  }

  rows.sort((a, b) => {
    const diff = sortValue(a, sortBy) - sortValue(b, sortBy)
    if (diff !== 0) return diff
    return a.analysis.fullCode.localeCompare(b.analysis.fullCode)
  })

  return limit === undefined ? rows : rows.slice(0, limit)
}
