/**
 * 配裝強度分析（純函式）。
 *
 * 規格對照：第 19 節（配裝結果欄位）、第 20 節（四層強度分析架構）、
 * 第 21 節（賽事統計限制）、第 24 節（資料不足時的訊息）、第 31 節（實體鎖定）。
 *
 * 分層原則：
 *  A 客觀資料：只來自 Catalog 的官方欄位，缺就是缺，不補值。
 *  B 配裝協同性：本專案自訂的估算，一律標示「模型推估」。
 *  C 賽事證據：只做第 21 節允許的統計，勝率不在此層計算。
 *  D 可信度：資料缺漏或無賽事樣本時不得判為高。
 */
import { checkCompatibility, deriveSystem, getSlotSchemaForSlots } from './compatibility.ts'
import { computeAvailabilityMap } from './inventory.ts'
import { resolveDisplayName } from './naming.ts'
import { summarizeStatSources } from './provenance.ts'
import { computeConfidence, computeMetaShare, computePlacementScore, type MetaShareResult } from './stats.ts'
import {
  BEY_TYPE_ZH,
  BIT_CONTACT_ZH,
  SPIN_DIRECTION_ZH,
  type AssemblySystem,
  type BeyType,
  type CompatibilityRule,
  type Confidence,
  type ComboSlots,
  type InventoryLot,
  type Part,
  type SavedCombo,
  type SourceTier,
  type SpinDirection,
} from './types.ts'
import type { CompatibilityResult } from './compatibility.ts'

/** 第 20 節 B：這層的所有輸出都必須掛上此標籤。 */
export const ESTIMATE_LABEL = '模型推估'

/** 第 24 節：賽事資料不足時的固定訊息。 */
export const EVIDENCE_NOTICE = '賽事資料仍在建置中'

export interface TypeWeight {
  attack: number
  defense: number
  stamina: number
  balance: number
}

/** 各槽位在類型混合時的權重。 */
const TYPE_WEIGHT = { blade: 0.5, bit: 0.3, ratchet: 0.2 } as const

const TYPE_WEIGHT_CATEGORIES: BeyType[] = ['attack', 'defense', 'stamina', 'balance']

const TYPE_WEIGHT_ZH: Record<BeyType, string> = {
  attack: '攻擊',
  defense: '防守',
  stamina: '持久',
  balance: '均衡',
}

function clampScore(value: number): number {
  return Math.round(Math.min(100, Math.max(0, value)))
}

/**
 * 把四個不一定剛好加總為 100 的原始百分比，用最大餘數法分配成整數且保證
 * 加總剛好是 100（不會因為各自四捨五入變成 99 或 101，也不會有負值）。
 */
function distributeToHundred(raw: Record<BeyType, number>): TypeWeight {
  const floors = TYPE_WEIGHT_CATEGORIES.map((type) => Math.floor(raw[type]))
  const remainders = TYPE_WEIGHT_CATEGORIES.map((type, index) => raw[type] - floors[index]!)
  const leftover = 100 - floors.reduce((sum, value) => sum + value, 0)
  const order = TYPE_WEIGHT_CATEGORIES.map((_, index) => index).sort(
    (a, b) => remainders[b]! - remainders[a]!,
  )
  const result = [...floors]
  for (let i = 0; i < leftover; i++) result[order[i]!] += 1
  return {
    attack: result[0]!,
    defense: result[1]!,
    stamina: result[2]!,
    balance: result[3]!,
  }
}

export interface EstimateArgs {
  blade?: Part
  ratchet?: Part
  bit?: Part
  /** CX 的鎖定紋章與輔助戰刃等額外零件。 */
  extras: Part[]
}

/**
 * 依零件官方類型估算「零件類型比重」（不是強度分數）。
 *
 * 直接把零件本身的 `type` 標籤按槽位權重（上蓋 0.5／軸心 0.3／固鎖 0.2）加權
 * 混合，是零件真實組成的比例，不是編出來的分數——舊版 `BASE_BY_TYPE` 對四種
 * 類型各手填一組六個數字，被驗算出攻擊型系統性排最後（見規格第 50.5 節），
 * 已經整個拔除。
 *
 * 高度、重量、CX 槽位權重都不進這個估算，理由跟舊版相同：重量的個體差異比
 * 配裝差異還大（見下方 `buildSynergyNotes` 的說明），高度要配合對手配置與
 * 盤型才有意義，不能被偷偷塞進單一數字。
 */
export function estimateTypeWeight(args: EstimateArgs): TypeWeight | undefined {
  const { blade, ratchet, bit, extras } = args
  const typed: { type: BeyType; weight: number }[] = []
  if (blade?.type) typed.push({ type: blade.type, weight: TYPE_WEIGHT.blade })
  if (bit?.type) typed.push({ type: bit.type, weight: TYPE_WEIGHT.bit })
  if (ratchet?.type) typed.push({ type: ratchet.type, weight: TYPE_WEIGHT.ratchet })
  for (const extra of extras) {
    if (extra.type) typed.push({ type: extra.type, weight: TYPE_WEIGHT.blade })
  }

  const totalWeight = typed.reduce((sum, row) => sum + row.weight, 0)
  if (totalWeight === 0) return undefined

  const raw: Record<BeyType, number> = { attack: 0, defense: 0, stamina: 0, balance: 0 }
  for (const row of typed) raw[row.type] += (100 * row.weight) / totalWeight

  return distributeToHundred(raw)
}

/* ------------------------------------------------------------- 操作難度 */

const DIFFICULTY_BY_CONTACT: Record<string, number> = {
  rubber: 85,
  flat: 70,
  needle: 45,
  point: 40,
  ball: 25,
  other: 50,
}

/** 匯出給配置產生器做便宜評分用，公式與配裝結果完全相同。 */
export function estimateOperationDifficulty(
  bit: Part | undefined,
  _ratchet: Part | undefined,
  blade: Part | undefined,
): number | undefined {
  if (!bit?.bitContact) return undefined
  let value = DIFFICULTY_BY_CONTACT[bit.bitContact] ?? 50
  if (blade?.type === 'attack') value += 5
  return clampScore(value)
}

/* -------------------------------------------------------------- 分析主體 */

export interface EvidenceInput {
  appearances: number
  top4: number
  championships: number
  totalDecks: number
  sourceTier: SourceTier
  /**
   * 這個配置的 `appearances` 在其資料來源自己的分布裡排第幾百分位（0～100，
   * 100 為該來源最高）。不同來源的樣本數量級差很多（台灣本地個位數 vs
   * 社群站台上萬筆），排序／比較用這個而不是原始筆數，見
   * `competitiveMeta.ts` 的 `competitiveEvidenceGain` 註解。沒有值代表
   * 這筆證據還沒算過百分位（例如舊測試資料），呼叫端要視同 0。
   */
  percentileScore?: number
}

export interface EvidenceOutput extends EvidenceInput {
  metaShare: MetaShareResult
  top4Share: MetaShareResult
  /** 模型推估的名次加權分數。 */
  bestPlacementScore?: number
}

export interface ObjectiveData {
  /** 第 22、41 節：數值來源不是官方時要講清楚。 */
  statsNoticeZhTW?: string
  statsSourceUrls?: string[]
  heightCode?: number
  spinDirectionZhTW?: string
  structureZhTW: string
  officialTypesZhTW: string[]
  bitContactZhTW?: string
}

export interface StockResult {
  sufficient: boolean
  missingPartIds: string[]
}

export interface AnalyzeArgs {
  slots: ComboSlots
  parts: Part[]
  rules: CompatibilityRule[]
  lots: InventoryLot[]
  combos: SavedCombo[]
  evidence?: EvidenceInput
}

export interface ComboAnalysis {
  system: AssemblySystem
  fullNameZhTW: string
  fullCode: string
  typeZhTW: string
  compatibility: CompatibilityResult
  objective: ObjectiveData
  /**
   * 第 20 節 B：無法安裝、或缺少官方類型資料時都不提供類型比重。
   * 官方沒公布的東西不補值，寧可顯示資料不足（第 1.5、49 節）。
   */
  typeWeight?: TypeWeight
  estimateLabelZhTW: string
  synergyNotesZhTW: string[]
  /** 缺少軸心特性資料時為 undefined，前台顯示資料不足。 */
  operationDifficulty?: number
  launchSuggestionZhTW: string
  prosZhTW: string[]
  consZhTW: string[]
  stock: StockResult
  dataCompleteness: { sufficient: boolean; missingFieldsZhTW: string[] }
  confidence: Confidence
  evidence?: EvidenceOutput
  evidenceNoticeZhTW?: string
}

const STRUCTURE_ZH: Record<AssemblySystem, string> = {
  BX: 'BX 三件式',
  UX: 'UX 三件式',
  CX: 'CX 模組化',
}


const LAUNCH_BY_TYPE: Record<BeyType, string> = {
  attack: '用較強力道發射，瞄準對手側面製造撞擊',
  defense: '用中等力道發射，盡量停在場地中央',
  stamina: '用穩定中等力道直線發射，避免過度傾斜',
  balance: '用中等偏強力道發射，視對手類型調整角度',
}

const LAUNCH_UNKNOWN = '官方類型資料不足，建議先用中等力道測試手感'

export function analyzeCombo(args: AnalyzeArgs): ComboAnalysis {
  const { slots, parts, rules, lots, combos, evidence } = args
  const byId = new Map(parts.map((part) => [part.id, part]))
  const system = deriveSystem(slots, parts)
  const schema = getSlotSchemaForSlots(slots, parts)
  const compatibility = checkCompatibility({ slots, parts, rules })

  const slotParts = schema.map((slot) => ({
    slot,
    part: slots[slot.key] ? byId.get(slots[slot.key] as string) : undefined,
  }))
  const resolvedParts = slotParts
    .map((row) => row.part)
    .filter((part): part is Part => Boolean(part))

  const blade =
    slotParts.find((row) => row.slot.key === 'bladeId')?.part ??
    slotParts.find((row) => row.slot.key === 'mainBladeId')?.part
  const ratchet = slotParts.find((row) => row.slot.key === 'ratchetId')?.part
  const bit = slotParts.find((row) => row.slot.key === 'bitId')?.part
  const extras = resolvedParts.filter(
    (part) => part !== blade && part !== ratchet && part !== bit,
  )

  /* --- A 客觀資料 --- */
  const missingFieldsZhTW: string[] = []
  if (!blade?.type) missingFieldsZhTW.push('官方類型')
  if (ratchet && typeof ratchet.heightCode !== 'number') missingFieldsZhTW.push('高度')

  const knownSpins = resolvedParts
    .map((part) => part.spinDirection)
    .filter((spin): spin is SpinDirection => Boolean(spin))
  // 旋向由上蓋決定，固鎖左右通用；只要有一件標了旋向，這套的旋向就是已知。
  if (knownSpins.length === 0) missingFieldsZhTW.push('旋向')
  const decisiveSpin = knownSpins.find((spin) => spin !== 'dual')
  const spinDirectionZhTW = decisiveSpin
    ? SPIN_DIRECTION_ZH[decisiveSpin]
    : knownSpins.length > 0
      ? SPIN_DIRECTION_ZH.dual
      : undefined

  const statsSummary = summarizeStatSources(resolvedParts)
  const objective: ObjectiveData = {
    ...(statsSummary.hasCommunityStats
      ? {
          statsNoticeZhTW: statsSummary.noticeZhTW as string,
          statsSourceUrls: statsSummary.sourceUrls,
        }
      : {}),
    ...(typeof ratchet?.heightCode === 'number' ? { heightCode: ratchet.heightCode } : {}),
    ...(spinDirectionZhTW ? { spinDirectionZhTW } : {}),
    structureZhTW:
      system === 'CX'
        ? `${STRUCTURE_ZH.CX}（上蓋${blade?.cxOverBlade ? '四' : '三'}件式）`
        : STRUCTURE_ZH[system],
    officialTypesZhTW: resolvedParts
      .map((part) => part.type)
      .filter((type): type is BeyType => Boolean(type))
      .map((type) => BEY_TYPE_ZH[type]),
    ...(bit?.bitContact ? { bitContactZhTW: BIT_CONTACT_ZH[bit.bitContact] } : {}),
  }

  /* --- B 配裝協同性（模型推估）--- */
  // 沒有官方類型就無法推估，否則會退化成一組毫無依據的平均值。
  const canEstimate = compatibility.ok && Boolean(blade?.type)
  const typeWeight = canEstimate ? estimateTypeWeight({ blade, ratchet, bit, extras }) : undefined
  const operationDifficulty = estimateOperationDifficulty(bit, ratchet, blade)
  const synergyNotesZhTW = buildSynergyNotes({ blade, ratchet, bit, typeWeight, spinDirectionZhTW })

  /* --- 名稱與發射建議（第 19 節）--- */
  const fullCode = buildFullCode(slotParts.map((row) => row.part))
  const primaryName = blade ? resolveDisplayName(blade.naming).titleZhTW : ''
  const tailCode = [ratchet?.code, bit?.code].filter(Boolean).join('')
  const fullNameZhTW = [primaryName, tailCode].filter(Boolean).join(' ')
  const typeZhTW = blade?.type ? BEY_TYPE_ZH[blade.type] : '資料不足'
  const launchSuggestionZhTW = blade?.type ? LAUNCH_BY_TYPE[blade.type] : LAUNCH_UNKNOWN

  /* --- 庫存（第 15、16、31 節）--- */
  const stock = computeStock({ slotParts, lots, combos })

  /* --- C 賽事證據（第 21 節）--- */
  const evidenceOutput = evidence ? buildEvidence(evidence) : undefined

  /* --- D 可信度（第 20 節 D）--- */
  //
  // 重量已經不列入缺漏（見 estimateScores 的說明），所以缺漏只剩類型、高度、旋向
  // 這些真的會影響判斷的欄位；全都有就以賽事樣本決定，沒有賽事樣本時給中等。
  const confidence: Confidence =
    missingFieldsZhTW.length === 0
      ? evidence
        ? computeConfidence({ sampleSize: evidence.totalDecks, sourceTier: evidence.sourceTier })
        : 'medium'
      : 'low'

  const { prosZhTW, consZhTW } = buildProsCons({ typeWeight, synergyNotesZhTW, operationDifficulty })

  return {
    system,
    fullNameZhTW,
    fullCode,
    typeZhTW,
    compatibility,
    objective,
    ...(typeWeight ? { typeWeight } : {}),
    estimateLabelZhTW: ESTIMATE_LABEL,
    synergyNotesZhTW,
    ...(operationDifficulty === undefined ? {} : { operationDifficulty }),
    launchSuggestionZhTW,
    prosZhTW,
    consZhTW,
    stock,
    dataCompleteness: { sufficient: missingFieldsZhTW.length === 0, missingFieldsZhTW },
    confidence,
    ...(evidenceOutput ? { evidence: evidenceOutput } : { evidenceNoticeZhTW: EVIDENCE_NOTICE }),
  }
}

/** 依槽位順序組出型號字串，供賽事資料比對用（第 21、29 節）。 */
export function comboFullCode(slots: ComboSlots, parts: Part[]): string {
  const byId = new Map(parts.map((part) => [part.id, part]))
  const system = deriveSystem(slots, parts)
  void system
  return buildFullCode(
    getSlotSchemaForSlots(slots, parts).map((slot) =>
      slots[slot.key] ? byId.get(slots[slot.key] as string) : undefined,
    ),
  )
}

function buildFullCode(parts: (Part | undefined)[]): string {
  const [head, ...rest] = parts
  if (!head) return ''
  const tail = rest.filter((part): part is Part => Boolean(part)).map((part) => part.code)
  // 三件式慣例：上蓋與「固鎖+軸心」之間留一個空白。
  if (tail.length <= 1) return [head.code, ...tail].join(' ')
  return `${head.code} ${tail.join('')}`
}

function buildSynergyNotes(args: {
  blade?: Part
  ratchet?: Part
  bit?: Part
  typeWeight?: TypeWeight
  spinDirectionZhTW?: string
}): string[] {
  const { blade, ratchet, typeWeight, spinDirectionZhTW } = args
  const notes: string[] = []
  const heightCode = ratchet?.heightCode

  if (typeof heightCode === 'number') {
    notes.push(`高度碼 ${heightCode}：需在對手完整配置與盤型中判讀，不單獨換算成強度。`)
  }

  if (blade?.type === 'attack') notes.push('攻擊角度偏斜向撞擊，適合主動找對手')
  if (blade?.type === 'stamina') notes.push('持久協同：低耗損接地配上持久上蓋，適合拖時間')
  if (blade?.type === 'defense') notes.push('防守協同：重心集中，適合承受撞擊')

  if (typeWeight) {
    if (typeWeight.stamina >= 70) notes.push('持久協同良好')
    if (typeWeight.defense >= 70) notes.push('防守協同良好')
  }

  if (spinDirectionZhTW && spinDirectionZhTW !== '雙旋') {
    notes.push(`左右旋對位：本配置為${spinDirectionZhTW}，對上反向旋轉時吸力表現會不同`)
  }

  return notes
}

function computeStock(args: {
  slotParts: { slot: { key: string }; part?: Part }[]
  lots: InventoryLot[]
  combos: SavedCombo[]
}): StockResult {
  const { slotParts, lots, combos } = args
  const availability = computeAvailabilityMap(lots, combos)
  const needed = new Map<string, number>()
  const order: string[] = []
  for (const { part } of slotParts) {
    if (!part) continue
    if (!needed.has(part.id)) order.push(part.id)
    needed.set(part.id, (needed.get(part.id) ?? 0) + 1)
  }
  const missingPartIds = order.filter(
    (partId) => (availability.get(partId)?.free ?? 0) < (needed.get(partId) ?? 0),
  )
  return { sufficient: missingPartIds.length === 0 && order.length > 0, missingPartIds }
}

function buildEvidence(evidence: EvidenceInput): EvidenceOutput {
  return {
    ...evidence,
    metaShare: computeMetaShare({
      appearances: evidence.appearances,
      totalDecks: evidence.totalDecks,
    }),
    top4Share: computeMetaShare({ appearances: evidence.top4, totalDecks: evidence.totalDecks }),
    ...(evidence.championships > 0 ? { bestPlacementScore: computePlacementScore(1) } : {}),
  }
}

function buildProsCons(args: {
  typeWeight?: TypeWeight
  synergyNotesZhTW: string[]
  operationDifficulty?: number
}): { prosZhTW: string[]; consZhTW: string[] } {
  const { typeWeight, synergyNotesZhTW, operationDifficulty } = args
  const prosZhTW: string[] = []
  const consZhTW: string[] = []
  if (!typeWeight) return { prosZhTW, consZhTW }

  const sorted = [...TYPE_WEIGHT_CATEGORIES].sort((a, b) => typeWeight[b] - typeWeight[a])
  const best = sorted[0]!
  const worst = sorted[sorted.length - 1]!
  prosZhTW.push(`${TYPE_WEIGHT_ZH[best]}型佔比最高（${typeWeight[best]}%，${ESTIMATE_LABEL}）`)
  consZhTW.push(`${TYPE_WEIGHT_ZH[worst]}型佔比最低（${typeWeight[worst]}%，${ESTIMATE_LABEL}）`)

  if (operationDifficulty !== undefined) {
    if (operationDifficulty >= 70) consZhTW.push('操作難度偏高，需要練發射')
    else prosZhTW.push('操作難度不高，新手也好上手')
  }

  const scrape = synergyNotesZhTW.find((note) => note.includes('刮地'))
  if (scrape) consZhTW.push(scrape)

  return { prosZhTW, consZhTW }
}
