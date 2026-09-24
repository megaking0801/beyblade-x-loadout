/**
 * 3on3 組隊（純函式）。
 *
 * 規格對照：第 32 節（組隊檢查與推薦模式）、第 33 節（角色分工與說明）、
 * 第 16 節（只有可用零件能進 3on3）、第 45 節 Case 9（不得超過可用數量）。
 *
 * 正式規則下的重複零件限制以 DeckRuleSet 資料表達，並保留官方規章網址。
 */
import { analyzeCombo, comboFullCode, type ComboAnalysis, type EvidenceInput } from './analysis.ts'
import { computeAvailabilityMap } from './inventory.ts'
import { resolveDisplayName } from './naming.ts'
import type { BuildableCombo } from './builder.ts'
import type { ExpertPartRatingRank } from '../catalog/tierLists.ts'
import type { PartStrengthEntry } from '../catalog/partStrength.ts'
import type { PartWinRateEntry } from './battleRecords.ts'
import {
  PART_FAMILY_ZH,
  type CompatibilityRule,
  type ComboSlots,
  type InventoryLot,
  type Part,
  type PartFamily,
  type Provenance,
  type SavedCombo,
} from './types.ts'

export interface DeckRuleSet {
  id: string
  nameZhTW: string
  teamSize: number
  /** 同一隊伍中不可重複使用的零件種類。 */
  noDuplicateFamilies: PartFamily[]
  /**
   * 例外：不論所屬種類，這些零件在同一隊伍中也不可重複。
   * code 是官方代號（可能是日文），nameZhTW 是前台顯示用的中文暫譯（第 1.4 節）。
   */
  noDuplicatePartCodes?: { code: string; nameZhTW: string }[]
  /** 前台顯示的規則摘要，必須全中文。 */
  summaryZhTW: string
  provenance: Provenance
}

const OFFICIAL_REGULATION_URL =
  'https://beyblade.takaratomy.co.jp/beyblade-x/_image/regulation.pdf'

/**
 * 現行官方 3on3 規則：三顆陀螺不可重複使用相同零件，顏色不同仍視為相同。
 * CX 鎖定紋章只有ワルキューレ、エンペラー各限一個，其餘鎖定紋章可重複。
 */
export const DEFAULT_DECK_RULES: DeckRuleSet = {
  id: 'default-3on3',
  nameZhTW: '一般 3on3',
  teamSize: 3,
  noDuplicateFamilies: ['blade', 'ratchet', 'bit', 'main_blade', 'assist_blade', 'integrated_blade'],
  noDuplicatePartCodes: [
    { code: 'ワルキューレ', nameZhTW: '女武神' },
    { code: 'エンペラー', nameZhTW: '帝王' },
  ],
  summaryZhTW:
    '依官方 3on3 規則檢查重複零件：同一隊伍不可重複使用相同零件，顏色不同仍算同一零件。CX 鎖定紋章只有「戰神」與「帝王」不可重複，其餘可重複。（BeybladeHub 未收錄的零件名為暫譯）',
  provenance: {
    sourceUrls: [OFFICIAL_REGULATION_URL],
    verificationStatus: 'official_verified',
  },
}

export interface DeckMember {
  slots: ComboSlots
  analysis: ComboAnalysis
  roleZhTW: string
  reasonZhTW: string
}

export interface DeckValidation {
  ok: boolean
  errorsZhTW: string[]
  warningsZhTW: string[]
  members: DeckMember[]
  occupiedPartIds: string[]
}

export interface ValidateDeckArgs {
  slotsList: ComboSlots[]
  parts: Part[]
  rules: CompatibilityRule[]
  lots: InventoryLot[]
  combos: SavedCombo[]
  ruleSet: DeckRuleSet
  /**
   * 完整配置的賽事證據索引，key 是 `comboFullCode(slots, parts)`。
   * 不傳的話每個隊員的 `analysis.evidence` 會是 undefined——曾經真的漏掉過，
   * 導致 `competitiveEvidenceGain`／`scoreDeck` 的證據加分永遠是 0，見呼叫端。
   */
  evidenceByCode?: Record<string, EvidenceInput>
}

const OCCUPYING_SLOT_KEYS = [
  'bladeId',
  'lockChipId',
  'mainBladeId',
  'overBladeId',
  'assistBladeId',
  'ratchetId',
  'bitId',
] as const

/**
 * 這套配置「真正決定是誰」的那顆零件：BX/UX 是上蓋（bladeId），CX 是主刃
 * （mainBladeId，鎖定紋章 lockChipId 當備援）——跟 `analysis.ts` 的
 * `analyzeCombo()` 判斷 blade 的順位一致（`bladeId ?? mainBladeId`）。
 * stan-yao 原始賽果紀錄只收 BX/UX 的三件式（blade/ratchet/bit），完全沒有
 * CX 的 lock_chip／main_blade／assist_blade／over_blade 家族零件，所以 CX
 * 配置的 identity 零件在索引裡幾乎必然查不到——這是刻意的「沒有樣本」，
 * 不是巧合，下面靠這顆零件把整個 fallback 擋下來。
 */
const IDENTITY_SLOT_KEYS = ['bladeId', 'mainBladeId', 'lockChipId'] as const

/**
 * evidence 缺席時的低權重替代訊號：這套配置用到的零件，各自在賽果紀錄裡的
 * 「進前三次數」百分位平均——不是這套配置本身被驗證過，只是零件拼湊推估
 * （第 50 節）。任何一個零件都查不到資料時回傳 undefined，不能當 0 分處理：
 * 0 分代表「查得到、但排名最後」，undefined 代表「完全沒樣本」，語意不同。
 *
 * 光是「有幾個槽位查得到資料」還不夠：如果決定這套配置是誰的 identity 零件
 * （上蓋／主刃／鎖定紋章）本身查不到，就算固鎖、軸心都查得到，也只是在講
 * 「固鎖軸心很常見」，不是「這套配置有戰績」——這種情況必須回傳 undefined，
 * 不能讓固鎖／軸心的平均分數冒充整套配置的推估分數。
 */
export function estimateComboPartStrength(
  slots: ComboSlots,
  partStrengthIndex: Map<string, PartStrengthEntry>,
): number | undefined {
  const identityPartId = IDENTITY_SLOT_KEYS.map((key) => slots[key]).find(
    (partId): partId is string => Boolean(partId),
  )
  if (identityPartId && !partStrengthIndex.has(identityPartId)) return undefined
  const matched = OCCUPYING_SLOT_KEYS.map((key) => slots[key])
    .filter((partId): partId is string => Boolean(partId))
    .map((partId) => partStrengthIndex.get(partId))
    .filter((entry): entry is PartStrengthEntry => Boolean(entry))
  if (matched.length === 0) return undefined
  return matched.reduce((sum, entry) => sum + entry.percentileScore, 0) / matched.length
}

function partName(part: Part): string {
  return resolveDisplayName(part.naming).titleZhTW
}

export function validateDeck(args: ValidateDeckArgs): DeckValidation {
  const { slotsList, parts, rules, lots, combos, ruleSet, evidenceByCode } = args
  const byId = new Map(parts.map((part) => [part.id, part]))
  const errorsZhTW: string[] = []
  const warningsZhTW: string[] = []

  if (slotsList.length !== ruleSet.teamSize) {
    errorsZhTW.push(
      `3on3 需要 ${ruleSet.teamSize} 套配裝，目前有 ${slotsList.length} 套`,
    )
  }

  const analyses = slotsList.map((slots) => {
    const evidence = evidenceByCode?.[comboFullCode(slots, parts)]
    return analyzeCombo({ slots, parts, rules, lots, combos, ...(evidence ? { evidence } : {}) })
  })

  analyses.forEach((analysis, index) => {
    if (!analysis.compatibility.ok) {
      const reason = analysis.compatibility.errors[0]?.messageZhTW ?? '原因不明'
      errorsZhTW.push(`第 ${index + 1} 套無法實際安裝：${reason}`)
    }
  })

  // 重複零件限制（第 32 節）
  const familyPartCounts = new Map<string, number>()
  for (const slots of slotsList) {
    for (const key of OCCUPYING_SLOT_KEYS) {
      const partId = slots[key]
      if (!partId) continue
      const part = byId.get(partId)
      if (!part) continue
      const isRestricted =
        ruleSet.noDuplicateFamilies.includes(part.family) ||
        ruleSet.noDuplicatePartCodes?.some((row) => row.code === part.code)
      if (!isRestricted) continue
      familyPartCounts.set(partId, (familyPartCounts.get(partId) ?? 0) + 1)
    }
  }
  for (const [partId, count] of familyPartCounts) {
    if (count <= 1) continue
    const part = byId.get(partId)
    if (!part) continue
    errorsZhTW.push(
      `同一隊伍不可重複使用相同${PART_FAMILY_ZH[part.family]}：${partName(part)}`,
    )
  }

  // 庫存檢查（第 16、45 節 Case 9）
  const availability = computeAvailabilityMap(lots, combos)
  const needed = new Map<string, number>()
  const occupiedPartIds: string[] = []
  for (const slots of slotsList) {
    for (const key of OCCUPYING_SLOT_KEYS) {
      const partId = slots[key]
      if (!partId) continue
      if (!needed.has(partId)) occupiedPartIds.push(partId)
      needed.set(partId, (needed.get(partId) ?? 0) + 1)
    }
  }
  for (const partId of occupiedPartIds) {
    const required = needed.get(partId) ?? 0
    const free = availability.get(partId)?.free ?? 0
    if (free >= required) continue
    const part = byId.get(partId)
    const label = part ? partName(part) : partId
    errorsZhTW.push(`${label} 需要 ${required} 個，可用只有 ${free} 個`)
  }

  const structurallyValid =
    slotsList.length === ruleSet.teamSize && analyses.every((a) => a.compatibility.ok)

  const members = structurallyValid ? assignRoles(slotsList, analyses) : []
  if (members.length > 0 && members.every((member) => !member.analysis.typeWeight)) {
    warningsZhTW.push(
      '這幾套配裝都缺少官方類型與旋向資料，角色分配只依可組性，不代表強弱',
    )
  }

  return {
    ok: errorsZhTW.length === 0,
    errorsZhTW,
    warningsZhTW,
    members,
    occupiedPartIds,
  }
}

/** 第 33 節：主攻、持久、穩定／抗攻，並說明為什麼這三顆一起用。 */
function assignRoles(slotsList: ComboSlots[], analyses: ComboAnalysis[]): DeckMember[] {
  const rows = slotsList.map((slots, index) => ({ slots, analysis: analyses[index]! }))
  const remaining = [...rows]

  const pick = (compare: (a: (typeof rows)[number], b: (typeof rows)[number]) => number) => {
    remaining.sort(compare)
    return remaining.shift()
  }

  /**
   * 官方沒公布零件類型與重量時就沒有分數，這時不能印「0 分」假裝比較過，
   * 只能說明角色是依可組性分配的（第 1.5、49.4 節）。
   */
  const reasonFor = (
    score: number | undefined,
    axisZhTW: string,
    dutyZhTW: string,
  ): string =>
    score === undefined
      ? `${dutyZhTW}。目前官方未公布這些零件的類型與旋向，${axisZhTW}無法評分，角色只依可組性分配`
      : `${axisZhTW} ${score} 分為隊中最高，${dutyZhTW}（模型推估）`

  const members: DeckMember[] = []

  const attacker = pick(
    (a, b) => (b.analysis.typeWeight?.attack ?? -1) - (a.analysis.typeWeight?.attack ?? -1),
  )
  if (attacker) {
    members.push({
      ...attacker,
      roleZhTW: '主攻',
      reasonZhTW: reasonFor(attacker.analysis.typeWeight?.attack, '攻擊型佔比', '負責主動撞擊'),
    })
  }

  const stamina = pick(
    (a, b) => (b.analysis.typeWeight?.stamina ?? -1) - (a.analysis.typeWeight?.stamina ?? -1),
  )
  if (stamina) {
    members.push({
      ...stamina,
      roleZhTW: '持久',
      reasonZhTW: reasonFor(stamina.analysis.typeWeight?.stamina, '持久型佔比', '負責拖時間比轉久'),
    })
  }

  const stable = pick(
    (a, b) => (b.analysis.typeWeight?.defense ?? -1) - (a.analysis.typeWeight?.defense ?? -1),
  )
  if (stable) {
    members.push({
      ...stable,
      roleZhTW: '穩定／抗攻',
      reasonZhTW: reasonFor(stable.analysis.typeWeight?.defense, '防守型佔比', '負責接下對手的攻擊'),
    })
  }

  for (const rest of remaining) {
    members.push({
      ...rest,
      roleZhTW: '特殊對位',
      reasonZhTW: '作為特定對位的備援配置（模型推估）',
    })
  }

  return members
}

/* ------------------------------------------------------------------ 推薦 */

/** 第 32 節推薦模式。 */
export type DeckStrategy =
  | 'beginner'
  | 'stable'
  | 'aggressive'
  | 'balanced'
  | 'evidence'
  | 'vs_attack'
  | 'vs_stamina'

export const DECK_STRATEGY_ZH: Record<DeckStrategy, string> = {
  beginner: '最適合新手',
  stable: '最穩定',
  aggressive: '最暴力',
  balanced: '均衡型',
  evidence: '最高賽事證據',
  vs_attack: '對攻擊',
  vs_stamina: '對持久',
}

export interface DeckSuggestion {
  strategy: DeckStrategy
  strategyZhTW: string
  slotsList: ComboSlots[]
  validation: DeckValidation
  score: number
  /** 第 33 節：哪些替代方案可用。 */
  alternativesZhTW: string[]
}

export interface SuggestDecksArgs {
  candidates: BuildableCombo[]
  parts: Part[]
  lots: InventoryLot[]
  combos: SavedCombo[]
  ruleSet: DeckRuleSet
  strategy: DeckStrategy
  limit?: number
  /** 候選數量上限，避免組合爆炸。 */
  candidateCap?: number
  /** 見 `ValidateDeckArgs.evidenceByCode`；傳給最終驗證用的 `validateDeck()`。 */
  evidenceByCode?: Record<string, EvidenceInput>
  /** BeybladeHub 高手零件評級（X/SS/S），partId 索引，見 `catalog/tierLists.ts` 的 `getExpertPartRatingIndex()`。 */
  expertPartRatingIndex?: Map<string, ExpertPartRatingRank>
  /** 零件層級賽果聲量聚合，見 `catalog/partStrength.ts` 的 `getPartStrengthIndex()`；第 50 節。 */
  partStrengthIndex?: Map<string, PartStrengthEntry>
  /** 個人對戰紀錄的零件勝率，見 domain/battleRecords.ts 的 computePartWinRateIndex()。 */
  winRateIndex?: Map<string, PartWinRateEntry>
}

const DEFAULT_CANDIDATE_CAP = 60
/** 枚舉上限，避免候選很多時卡住 UI。 */
const MAX_TRIPLES_EXAMINED = 200_000
/** 先用便宜的分數挑出前幾名，再做完整驗證（含跨隊伍庫存檢查）。 */
const VERIFY_MULTIPLIER = 6
const DEFAULT_SUGGESTION_LIMIT = 5

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

/** X=3／SS=2／S=1 每一級的加分權重，跟 `recommendations.ts` 的 `expertTierGain` 同一套換算，見 `tierLists.ts`。 */
const EXPERT_TIER_WEIGHT = 5

/** 第 50.3 節：零件拼湊推估的權重必須明確低於完整配置證據，初始值待第 50.6 節回測校準。 */
const PART_STRENGTH_FALLBACK_WEIGHT = 0.3

/**
 * fallback 分數的理論上限（percentileScore 滿分 100 乘上權重）。真實 evidence
 * 就算原始百分位很低（台灣本地樣本數常常只有 2、3 筆，percentileScore 可能
 * 個位數），貢獻也不能被這個上限比下去——不然「有真實賽事佐證」反而輸給
 * 「純零件拼湊推估」，違反第 50 節「fallback 加權後不可能超過任何有真實
 * evidence 的配置分數」的保證。只墊高「原本會輸給 fallback 上限」的那些
 * 真實百分位，兩個都已經贏過上限的真實百分位之間仍照原始差距排序，不會被
 * 拉平成同一個值。
 */
const PART_STRENGTH_FALLBACK_FLOOR = 100 * PART_STRENGTH_FALLBACK_WEIGHT

/**
 * 個人對戰紀錄的權重。不需要像 PART_STRENGTH_FALLBACK_WEIGHT 那樣回測校準——
 * 這份資料是使用者自己的第一手經驗，沒有「準不準」的問題，只有「該佔多重」
 * 的產品判斷。刻意設得比 EXPERT_TIER_WEIGHT 小，見個人對戰紀錄規格第 4 節。
 */
const PERSONAL_WIN_RATE_WEIGHT = 2

export function scoreDeck(
  strategy: DeckStrategy,
  members: DeckMember[],
  expertPartRatingIndex?: Map<string, ExpertPartRatingRank>,
  partStrengthIndex?: Map<string, PartStrengthEntry>,
  winRateIndex?: Map<string, PartWinRateEntry>,
): number {
  const weights = members.map((m) => m.analysis.typeWeight)
  const axis = (key: 'attack' | 'defense' | 'stamina' | 'balance') =>
    weights.map((w) => w?.[key] ?? 0)
  // 完整配置在自己來源分布裡的百分位（0～100，見 evidence.percentileScore 的
  // 註解），不是原始出場筆數——不同來源量級差很多，直接加總原始筆數會讓查得到
  // 大量社群出場數的配置系統性蓋過真正在本地賽事拿過名次的配置，跟
  // `competitiveMeta.ts` 的 `computePercentiles()` 是同一套修正。
  const competitiveEvidence = members.reduce((sum, member) => sum + (member.analysis.evidence?.percentileScore ?? 0), 0)
  // evidence 缺席時的低權重 fallback（第 50 節）：`evidence` 策略刻意不吃這個，
  // 理由跟它不吃 expertTierGain 一樣——策略名稱承諾「最高賽事證據」，混進零件
  // 拼湊推估會誤導。權重是保守初始值，正式校準見規格第 50.6 節的回測腳本。
  const competitiveEvidenceWithFallback = members.reduce((sum, member) => {
    const real = member.analysis.evidence?.percentileScore
    // 只墊高會輸給 fallback 上限的真實百分位，不是無條件套用固定樓層值，
    // 這樣兩個都已經贏過上限的真實 evidence 之間仍保留相對排序。
    if (real !== undefined) return sum + Math.max(real, PART_STRENGTH_FALLBACK_FLOOR)
    const fallback = partStrengthIndex ? estimateComboPartStrength(member.slots, partStrengthIndex) : undefined
    return sum + (fallback ?? 0) * PART_STRENGTH_FALLBACK_WEIGHT
  }, 0)
  // BBXHub 高手零件評級加總（X/SS/S），跟 `recommendations.ts` 的
  // `expertTierGain` 同一份索引；這是社群主觀意見，不是賽事證據，`evidence`
  // 策略刻意不吃這項，避免跟策略名稱承諾的「最高賽事證據」互相混淆。
  const expertTierGain = expertPartRatingIndex
    ? members.reduce(
        (sum, member) =>
          sum +
          OCCUPYING_SLOT_KEYS.reduce((partSum, key) => {
            const partId = member.slots[key]
            if (!partId) return partSum
            return partSum + (expertPartRatingIndex.get(partId)?.rank ?? 0)
          }, 0),
        0,
      )
    : 0

  // 個人對戰紀錄勝率：每套配裝先把有資料的零件平均成一個 0～1 的值
  // （避免 CX 5 槽位配裝只因為零件數量多就贏過 BX/UX 3 槽位配裝），
  // 再跨隊員加總——跟 estimateComboPartStrength() 同一種「先平均再加總」
  // 的形狀，不是 expertTierGain 那種「全部零件直接加總」的形狀。
  //
  // 減掉 0.5 把訊號以「不輸不贏」為基準對齊到 -0.5～+0.5：原始 winRate
  // 永遠非負，直接加總等於「不管輸贏、有紀錄就加分」，一套配裝就算輸多贏少
  // 也會比完全沒紀錄的配裝分數高，跟直覺相反（全分支審查 Important Finding
  // 1）。對齊後贏多才加分、輸多真的扣分，沒有紀錄的配裝維持 0 分不受影響。
  const personalWinRateGain = winRateIndex
    ? members.reduce((sum, member) => {
        const rates = OCCUPYING_SLOT_KEYS.map((key) => member.slots[key])
          .filter((partId): partId is string => Boolean(partId))
          .map((partId) => winRateIndex.get(partId)?.winRate)
          .filter((rate): rate is number => rate !== undefined)
        if (rates.length === 0) return sum
        return sum + (rates.reduce((a, b) => a + b, 0) / rates.length - 0.5)
      }, 0)
    : 0

  switch (strategy) {
    case 'aggressive':
      return average(axis('attack'))
    case 'stable':
      return average(axis('defense'))
    case 'beginner':
      return -average(members.map((m) => m.analysis.operationDifficulty ?? 100))
    case 'balanced':
      // 三個面向各取隊中最高值鼓勵角色互補；完整配置的實戰證據（含零件強度
      // fallback）與高手評級則作為次要加分，不能用零件類型比重蓋過賽場已驗證
      // 的組合。
      return (
        Math.max(...axis('attack')) +
        Math.max(...axis('stamina')) +
        Math.max(...axis('defense')) +
        competitiveEvidenceWithFallback +
        expertTierGain * EXPERT_TIER_WEIGHT +
        personalWinRateGain * PERSONAL_WIN_RATE_WEIGHT
      )
    case 'evidence':
      return competitiveEvidence
    case 'vs_attack':
      // 舊版把 defense 與 burstResistance 兩個相關軸加總，兩者本來就是同一份
      // 資訊的裝飾（見規格第 1 節），現在只剩 defense 單軸，乘 2 是為了保留
      // 這一項在總分裡原本的量級，不讓拿掉裝飾軸之後這個策略的排序權重被
      // competitiveEvidenceWithFallback／expertTierGain 蓋過去。
      return (
        average(axis('defense')) * 2 +
        competitiveEvidenceWithFallback * 0.35 +
        expertTierGain * EXPERT_TIER_WEIGHT +
        personalWinRateGain * PERSONAL_WIN_RATE_WEIGHT
      )
    case 'vs_stamina':
      return (
        average(axis('attack')) * 2 +
        competitiveEvidenceWithFallback * 0.35 +
        expertTierGain * EXPERT_TIER_WEIGHT +
        personalWinRateGain * PERSONAL_WIN_RATE_WEIGHT
      )
  }
}

export function suggestDecks(args: SuggestDecksArgs): DeckSuggestion[] {
  const {
    candidates,
    parts,
    lots,
    combos,
    ruleSet,
    strategy,
    limit = DEFAULT_SUGGESTION_LIMIT,
    candidateCap = DEFAULT_CANDIDATE_CAP,
    evidenceByCode,
    expertPartRatingIndex,
    partStrengthIndex,
    winRateIndex,
  } = args

  if (candidates.length < ruleSet.teamSize) return []
  if (ruleSet.teamSize !== 3) return []

  const pool = candidates.slice(0, candidateCap)
  const byId = new Map(parts.map((part) => [part.id, part]))

  /** 每個候選配置中「同隊不可重複」的零件集合，用來便宜地先剪枝。 */
  const restrictedIds = pool.map((row) => {
    const ids = new Set<string>()
    for (const key of OCCUPYING_SLOT_KEYS) {
      const partId = row.slots[key]
      if (!partId) continue
      const part = byId.get(partId)
      if (!part) continue
      const restricted =
        ruleSet.noDuplicateFamilies.includes(part.family) ||
        ruleSet.noDuplicatePartCodes?.some((rule) => rule.code === part.code)
      if (restricted) ids.add(partId)
    }
    return ids
  })

  const disjoint = (a: Set<string>, b: Set<string>): boolean => {
    for (const id of a) {
      if (b.has(id)) return false
    }
    return true
  }

  // 先枚舉出通過重複零件限制的三套組合，並用候選本身的分析算出便宜分數。
  const rough: { indexes: [number, number, number]; score: number }[] = []
  let examined = 0
  outer: for (let i = 0; i < pool.length; i += 1) {
    for (let j = i + 1; j < pool.length; j += 1) {
      if (!disjoint(restrictedIds[i]!, restrictedIds[j]!)) continue
      for (let k = j + 1; k < pool.length; k += 1) {
        examined += 1
        if (examined > MAX_TRIPLES_EXAMINED) break outer
        if (!disjoint(restrictedIds[i]!, restrictedIds[k]!)) continue
        if (!disjoint(restrictedIds[j]!, restrictedIds[k]!)) continue
        const members = [i, j, k].map((index) => ({
          slots: pool[index]!.slots,
          analysis: pool[index]!.analysis,
          roleZhTW: '',
          reasonZhTW: '',
        }))
        rough.push({ indexes: [i, j, k], score: scoreDeck(strategy, members, expertPartRatingIndex, partStrengthIndex, winRateIndex) })
      }
    }
  }

  rough.sort((a, b) => b.score - a.score)

  // 只對分數最高的前幾名做完整驗證（會檢查跨隊伍的可用庫存，成本較高）。
  const suggestions: DeckSuggestion[] = []
  for (const row of rough.slice(0, Math.max(limit * VERIFY_MULTIPLIER, limit))) {
    const slotsList = row.indexes.map((index) => pool[index]!.slots)
    const validation = validateDeck({ slotsList, parts, rules: [], lots, combos, ruleSet, evidenceByCode })
    if (!validation.ok) continue
    suggestions.push({
      strategy,
      strategyZhTW: DECK_STRATEGY_ZH[strategy],
      slotsList,
      validation,
      score: scoreDeck(strategy, validation.members, expertPartRatingIndex, partStrengthIndex, winRateIndex),
      alternativesZhTW: buildAlternatives(pool, slotsList),
    })
    if (suggestions.length >= limit) break
  }

  suggestions.sort((a, b) => b.score - a.score)
  return suggestions
}

function buildAlternatives(pool: BuildableCombo[], used: ComboSlots[]): string[] {
  const usedCodes = new Set(
    used.map((slots) =>
      pool.find((row) => row.slots === slots)?.analysis.fullCode ?? '',
    ),
  )
  return pool
    .filter((row) => !usedCodes.has(row.analysis.fullCode))
    .slice(0, 3)
    .map((row) => `還可以改用：${row.analysis.fullNameZhTW}`)
}
