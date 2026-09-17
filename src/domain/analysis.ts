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

export interface ComboScores {
  attack: number
  defense: number
  stamina: number
  burst: number
  burstResistance: number
  stability: number
}

/** 官方類型對應的基礎分數向量（模型推估的起點，非官方數據）。 */
const BASE_BY_TYPE: Record<BeyType, ComboScores> = {
  attack: { attack: 80, defense: 30, stamina: 30, burst: 75, burstResistance: 35, stability: 35 },
  defense: { attack: 35, defense: 80, stamina: 55, burst: 35, burstResistance: 75, stability: 70 },
  stamina: { attack: 30, defense: 50, stamina: 85, burst: 30, burstResistance: 60, stability: 65 },
  balance: { attack: 55, defense: 55, stamina: 55, burst: 50, burstResistance: 55, stability: 55 },
}

/** 各槽位在類型混合時的權重。 */
const TYPE_WEIGHT = { blade: 0.5, bit: 0.3, ratchet: 0.2 } as const

/** 重量與高度的基準值，用於計算相對修正量。 */
/** 高度標示的基準值，取常見的 70。 */
export const HEIGHT_BASELINE_CODE = 70

const SCORE_AXES: (keyof ComboScores)[] = [
  'attack',
  'defense',
  'stamina',
  'burst',
  'burstResistance',
  'stability',
]

const AXIS_ZH: Record<keyof ComboScores, string> = {
  attack: '攻擊',
  defense: '防守',
  stamina: '持久',
  burst: '爆發',
  burstResistance: '抗爆',
  stability: '穩定',
}

function clampScore(value: number): number {
  return Math.round(Math.min(100, Math.max(0, value)))
}

export interface EstimateArgs {
  blade?: Part
  ratchet?: Part
  bit?: Part
  /** CX 的鎖定紋章與輔助戰刃等額外零件。 */
  extras: Part[]
}

/**
 * 依官方類型、官方重量與高度推估六軸分數。
 *
 * 公式（模型推估，固定可驗算）：
 *  1. 以各零件官方類型的基礎向量按權重混合，權重只在有類型的零件之間正規化。
 *  2. 高度修正：以 70 mm 為基準，每低 1 mm 攻擊 +0.5；每高 1 mm 穩定 +0.3、持久 +0.2。
 */
export function estimateScores(args: EstimateArgs): ComboScores {
  const { blade, ratchet, bit, extras } = args
  const typed: { part: Part; weight: number }[] = []
  if (blade?.type) typed.push({ part: blade, weight: TYPE_WEIGHT.blade })
  if (bit?.type) typed.push({ part: bit, weight: TYPE_WEIGHT.bit })
  if (ratchet?.type) typed.push({ part: ratchet, weight: TYPE_WEIGHT.ratchet })
  for (const extra of extras) {
    if (extra.type) typed.push({ part: extra, weight: TYPE_WEIGHT.blade })
  }

  const scores: ComboScores = { ...BASE_BY_TYPE.balance }
  const totalWeight = typed.reduce((sum, row) => sum + row.weight, 0)
  if (totalWeight > 0) {
    for (const axis of SCORE_AXES) {
      scores[axis] = typed.reduce(
        (sum, row) => sum + BASE_BY_TYPE[row.part.type as BeyType][axis] * (row.weight / totalWeight),
        0,
      )
    }
  }

  /*
   * 重量不進模型。
   *
   * 來源只給得出「某一顆的實測值」，但同款零件的個體差異（模具批次、塗裝）
   * 常常比配裝之間的差異還大。拿單一數字去加減分數，等於把雜訊當訊號，
   * 還會讓使用者以為那是官方規格。寧可少一個修正項（第 1.5 節）。
   */

  const heightCode = ratchet?.heightCode
  if (typeof heightCode === 'number') {
    scores.attack += (HEIGHT_BASELINE_CODE - heightCode) * 0.5
    scores.stability += (heightCode - HEIGHT_BASELINE_CODE) * 0.3
    scores.stamina += (heightCode - HEIGHT_BASELINE_CODE) * 0.2
  }

  return {
    attack: clampScore(scores.attack),
    defense: clampScore(scores.defense),
    stamina: clampScore(scores.stamina),
    burst: clampScore(scores.burst),
    burstResistance: clampScore(scores.burstResistance),
    stability: clampScore(scores.stability),
  }
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

const LOW_PROFILE_MAX_CODE = 60
const HIGH_PROFILE_MIN_CODE = 75

/** 匯出給配置產生器做便宜評分用，公式與配裝結果完全相同。 */
export function estimateOperationDifficulty(
  bit: Part | undefined,
  ratchet: Part | undefined,
  blade: Part | undefined,
): number | undefined {
  if (!bit?.bitContact) return undefined
  let value = DIFFICULTY_BY_CONTACT[bit.bitContact] ?? 50
  const heightCode = ratchet?.heightCode
  if (typeof heightCode === 'number') {
    if (heightCode <= LOW_PROFILE_MAX_CODE) value += 10
    else if (heightCode >= HIGH_PROFILE_MIN_CODE) value -= 5
  }
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
   * 第 20 節 B：無法安裝、或缺少官方類型資料時都不提供分數。
   * 官方沒公布的東西不補值，寧可顯示資料不足（第 1.5、49 節）。
   */
  scores?: ComboScores
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
  const scores = canEstimate ? estimateScores({ blade, ratchet, bit, extras }) : undefined
  const operationDifficulty = estimateOperationDifficulty(bit, ratchet, blade)
  const synergyNotesZhTW = buildSynergyNotes({ blade, ratchet, bit, scores, spinDirectionZhTW })

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

  const { prosZhTW, consZhTW } = buildProsCons({ scores, synergyNotesZhTW, operationDifficulty })

  return {
    system,
    fullNameZhTW,
    fullCode,
    typeZhTW,
    compatibility,
    objective,
    ...(scores ? { scores } : {}),
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
  scores?: ComboScores
  spinDirectionZhTW?: string
}): string[] {
  const { blade, ratchet, bit, scores, spinDirectionZhTW } = args
  const notes: string[] = []
  const heightCode = ratchet?.heightCode

  if (typeof heightCode === 'number') {
    if (heightCode <= LOW_PROFILE_MAX_CODE) {
      notes.push(`低位配置（高度 ${heightCode}），重心低、比較不容易被打飛`)
    } else if (heightCode >= HIGH_PROFILE_MIN_CODE) {
      notes.push(`高位配置（高度 ${heightCode}），比較好維持軸心穩定`)
    } else {
      notes.push(`中位配置（高度 ${heightCode}）`)
    }

    if (heightCode <= LOW_PROFILE_MAX_CODE && (bit?.bitContact === 'flat' || bit?.bitContact === 'rubber')) {
      notes.push('低位加上大面積接地，刮地風險較高，發射角度要壓穩')
    }
  }

  if (blade?.type === 'attack') notes.push('攻擊角度偏斜向撞擊，適合主動找對手')
  if (blade?.type === 'stamina') notes.push('持久協同：低耗損接地配上持久上蓋，適合拖時間')
  if (blade?.type === 'defense') notes.push('防守協同：重心集中，適合承受撞擊')

  if (scores) {
    if (scores.stamina >= 70) notes.push('持久協同良好')
    if (scores.defense >= 70) notes.push('防守協同良好')
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
  scores?: ComboScores
  synergyNotesZhTW: string[]
  operationDifficulty?: number
}): { prosZhTW: string[]; consZhTW: string[] } {
  const { scores, synergyNotesZhTW, operationDifficulty } = args
  const prosZhTW: string[] = []
  const consZhTW: string[] = []
  if (!scores) return { prosZhTW, consZhTW }

  const sorted = [...SCORE_AXES].sort((a, b) => scores[b] - scores[a])
  const best = sorted[0]!
  const worst = sorted[sorted.length - 1]!
  prosZhTW.push(`${AXIS_ZH[best]}表現最突出（${scores[best]} 分，${ESTIMATE_LABEL}）`)
  consZhTW.push(`${AXIS_ZH[worst]}最弱（${scores[worst]} 分，${ESTIMATE_LABEL}）`)

  if (operationDifficulty !== undefined) {
    if (operationDifficulty >= 70) consZhTW.push('操作難度偏高，需要練發射')
    else prosZhTW.push('操作難度不高，新手也好上手')
  }

  const scrape = synergyNotesZhTW.find((note) => note.includes('刮地'))
  if (scrape) consZhTW.push(scrape)

  return { prosZhTW, consZhTW }
}
