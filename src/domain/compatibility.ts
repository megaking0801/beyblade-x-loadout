/**
 * 相容性檢查（純函式）。
 *
 * 規格對照：第 17 節（配裝器槽位）、第 18 節（相容性）、第 1.5 節（不得編造相容性）。
 *
 * 原則：只把「機構上必然」的規則寫在程式裡（槽位與零件種類、旋向一致、必填槽位）。
 * 其他已知特殊限制一律由 CompatibilityRule 資料提供，並附來源。
 * 沒有資料支持的限制不得自行推測。
 */
import {
  SPIN_DIRECTION_ZH,
  PART_FAMILY_ZH,
  type AssemblySystem,
  type CompatibilityRule,
  type ComboSlots,
  type Part,
  type PartFamily,
  type SpinDirection,
} from './types.ts'

/** 第 18 節指定的錯誤標題。 */
export const ASSEMBLY_ERROR_HEADLINE = '此組合無法實際安裝。'

export type SlotKey =
  | 'bladeId'
  | 'lockChipId'
  | 'mainBladeId'
  | 'assistBladeId'
  | 'ratchetId'
  | 'bitId'

export interface SlotDef {
  key: SlotKey
  labelZhTW: string
  /** 此槽位可接受的零件種類。 */
  families: PartFamily[]
  required: boolean
}

const STANDARD_SCHEMA: SlotDef[] = [
  { key: 'bladeId', labelZhTW: '上蓋', families: ['blade', 'integrated_blade'], required: true },
  { key: 'ratchetId', labelZhTW: '固鎖', families: ['ratchet'], required: true },
  { key: 'bitId', labelZhTW: '軸心', families: ['bit'], required: true },
]

const CX_SCHEMA: SlotDef[] = [
  { key: 'lockChipId', labelZhTW: '鎖定紋章', families: ['lock_chip'], required: true },
  { key: 'mainBladeId', labelZhTW: '主刃', families: ['main_blade'], required: true },
  { key: 'assistBladeId', labelZhTW: '輔助戰刃', families: ['assist_blade'], required: true },
  { key: 'ratchetId', labelZhTW: '固鎖', families: ['ratchet'], required: true },
  { key: 'bitId', labelZhTW: '軸心', families: ['bit'], required: true },
]

/** 第 17 節：CX 或特殊結構要顯示正確欄位。 */
export function getSlotSchema(system: AssemblySystem): SlotDef[] {
  return system === 'CX' ? CX_SCHEMA : STANDARD_SCHEMA
}

/** CX 上蓋為未拆分狀態時，鎖定紋章已含在主刃內，不再是獨立槽位。 */
const CX_FUSED_SCHEMA: SlotDef[] = CX_SCHEMA.filter((slot) => slot.key !== 'lockChipId')

/**
 * 依實際選中的零件決定槽位表。
 * 選到 cxFused 的主刃時，鎖定紋章槽位會消失（第 17 節：依實際規則顯示正確欄位）。
 */
export function getSlotSchemaForSlots(slots: ComboSlots, parts: Part[]): SlotDef[] {
  const system = deriveSystem(slots, parts)
  if (system !== 'CX') return STANDARD_SCHEMA
  const mainBlade = parts.find((part) => part.id === slots.mainBladeId)
  return mainBlade?.cxFused ? CX_FUSED_SCHEMA : CX_SCHEMA
}

const ALL_SLOT_KEYS: SlotKey[] = [
  'bladeId',
  'lockChipId',
  'mainBladeId',
  'assistBladeId',
  'ratchetId',
  'bitId',
]

const SLOT_LABEL: Record<SlotKey, string> = {
  bladeId: '上蓋',
  lockChipId: '鎖定紋章',
  mainBladeId: '主刃',
  assistBladeId: '輔助戰刃',
  ratchetId: '固鎖',
  bitId: '軸心',
}

const CX_ONLY_SLOTS: SlotKey[] = ['lockChipId', 'mainBladeId', 'assistBladeId']

/**
 * 由槽位內容推導組裝系統。
 *
 * - 使用 CX 專用槽位且沒有單件上蓋時視為 CX。
 * - 否則只要有任一 UX 零件就視為 UX（UX 與 BX 為同一三件式介面）。
 * - 其餘為 BX。
 */
export function deriveSystem(slots: ComboSlots, parts: Part[]): AssemblySystem {
  const usesCxSlots = CX_ONLY_SLOTS.some((key) => slots[key])
  if (usesCxSlots && !slots.bladeId) return 'CX'

  const selected = ALL_SLOT_KEYS.map((key) => slots[key])
    .filter((id): id is string => Boolean(id))
    .map((id) => parts.find((part) => part.id === id))
    .filter((part): part is Part => Boolean(part))

  if (selected.some((part) => part.system === 'UX')) return 'UX'
  return 'BX'
}

export interface CompatibilityIssue {
  messageZhTW: string
  ruleId?: string
  sourceUrls?: string[]
}

export interface CompatibilityResult {
  ok: boolean
  system: AssemblySystem
  /** 不可組裝時為第 18 節指定句，可組裝時為 undefined。 */
  headlineZhTW?: string
  errors: CompatibilityIssue[]
  /** 不阻擋但需提醒使用者的事項，例如缺少旋向資料。 */
  warnings: CompatibilityIssue[]
}


export interface CheckArgs {
  slots: ComboSlots
  parts: Part[]
  rules: CompatibilityRule[]
}

export function checkCompatibility(args: CheckArgs): CompatibilityResult {
  const { slots, parts, rules } = args
  const system = deriveSystem(slots, parts)
  const schema = getSlotSchemaForSlots(slots, parts)
  const schemaKeys = new Set(schema.map((s) => s.key))

  const errors: CompatibilityIssue[] = []
  const warnings: CompatibilityIssue[] = []

  const byId = new Map(parts.map((part) => [part.id, part]))
  /** 實際通過種類檢查、進入旋向與規則判斷的零件。 */
  const resolved: Part[] = []

  // 1. 不屬於此結構的槽位
  for (const key of ALL_SLOT_KEYS) {
    if (slots[key] && !schemaKeys.has(key)) {
      errors.push({ messageZhTW: `此配裝不使用${SLOT_LABEL[key]}` })
    }
  }

  // 2. 必填槽位與種類相符
  for (const slot of schema) {
    const partId = slots[slot.key]
    if (!partId) {
      if (slot.required) errors.push({ messageZhTW: `尚未選擇${slot.labelZhTW}` })
      continue
    }
    const part = byId.get(partId)
    if (!part) {
      errors.push({ messageZhTW: `找不到零件資料：${partId}` })
      continue
    }
    if (!slot.families.includes(part.family)) {
      errors.push({
        messageZhTW: `${slot.labelZhTW}槽不能放入${PART_FAMILY_ZH[part.family]}`,
      })
      continue
    }
    resolved.push(part)
  }

  // 3. 旋向一致（機構上必然：左旋與右旋介面不相容）
  //
  // 旋向由上蓋決定，固鎖本身左右通用，軸心只有標 L 的左旋專用款才有旋向。
  // 因此沒有旋向的零件視為左右通用，不逐件警告；只有整組都查不到旋向時才提醒。
  const directions = new Set<SpinDirection>()
  for (const part of resolved) {
    if (!part.spinDirection) continue
    if (part.spinDirection !== 'dual') directions.add(part.spinDirection)
  }
  if (resolved.length > 0 && resolved.every((part) => !part.spinDirection)) {
    warnings.push({ messageZhTW: '這套配裝的零件都查不到旋向，無法檢查左右旋相容性' })
  }
  if (directions.has('right') && directions.has('left')) {
    errors.push({
      messageZhTW: `旋向衝突：${SPIN_DIRECTION_ZH.right}零件與${SPIN_DIRECTION_ZH.left}零件不能組在一起`,
    })
  }

  // 4. 資料驅動的特殊限制（第 18 節）
  const resolvedIds = new Set(resolved.map((part) => part.id))
  const resolvedFamilies = new Set(resolved.map((part) => part.family))
  for (const rule of rules) {
    if (!resolvedIds.has(rule.partId)) continue
    const hitsPart = (rule.targetPartIds ?? []).some((id) => resolvedIds.has(id))
    const hitsFamily = (rule.targetFamilies ?? []).some((family) => resolvedFamilies.has(family))
    const hit = hitsPart || hitsFamily
    const violated = rule.kind === 'forbids' ? hit : !hit
    if (violated) {
      errors.push({
        messageZhTW: rule.reasonZhTW,
        ruleId: rule.id,
        sourceUrls: rule.provenance.sourceUrls,
      })
    }
  }

  const ok = errors.length === 0
  return {
    ok,
    system,
    ...(ok ? {} : { headlineZhTW: ASSEMBLY_ERROR_HEADLINE }),
    errors,
    warnings,
  }
}
