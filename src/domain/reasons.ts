/**
 * 配裝理由的證據層。
 *
 * 規格對照：第 20 節 C（賽事／社群證據）、第 21 節（樣本限制）、第 22 節（來源可查）。
 *
 * 為什麼要有這一層：六軸評估是本站的模型推估，它說得出「這套的結構偏持久」，
 * 說不出「賽場上真的有人這樣打」。本模組只做一件事 —— 把已經收進來的兩種外部資料
 * （高手逐件評級、台灣賽事名次觀測）翻成一句一句可回查的理由。
 *
 * 界線（重要）：
 *  - 這些理由**不進入**六軸分數，也不改變可信度。模型歸模型、證據歸證據，
 *    使用者自己對照，前台必須分開呈現（第 20 節 D）。
 *  - 每一條都要帶得出來源類型與網址，講不出來源的就不要生成。
 */
import type { ComboSlots, Part, TournamentEvent, TournamentObservation } from './types.ts'
import { PART_FAMILY_ZH } from './types.ts'
import { resolveDisplayName } from './naming.ts'

export type EvidenceKind = 'expert' | 'tournament'

/**
 * 這條理由在講整顆陀螺還是單一零件。
 *
 * 前台要先講整顆、再把單件的併成一行。逐件列出會讀成「三份零件報告」，
 * 而不是在分析這顆陀螺 —— 使用者直接反映過這一點。
 */
export type EvidenceScope = 'combo' | 'part'

export interface EvidenceReason {
  kind: EvidenceKind
  scope: EvidenceScope
  /** 給使用者看的一句話，一律台灣中文。 */
  textZhTW: string
  /** 這條理由是由哪些零件撐起來的，前台可據此highlight。 */
  partIds: string[]
  sourceUrl?: string
  /** 賽事類理由的場次 id；同一場不會既講整套命中又講單顆命中。 */
  eventId?: string
  /** 排序用：證據越強數字越小。 */
  weight: number
}

/** 逐件評級的最小輸入形狀，避免這一層依賴 catalog 模組。 */
export interface PartRatingInput {
  partId: string
  labelZhTW: string
  tierLabel: string
  agreeCount: number
  expertCount: number
}

const PLACEMENT_ZH: Record<number, string> = { 1: '冠軍', 2: '亞軍', 3: '季軍', 4: '殿軍' }

/** 高手榜的等級順序，用來決定哪一條理由先講。 */
const TIER_RANK = ['X', 'SS', 'S', 'T0', 'T0.5', 'T1', 'T2']

function tierWeight(tierLabel: string): number {
  const index = TIER_RANK.indexOf(tierLabel)
  return index < 0 ? TIER_RANK.length : index
}

function slotPartIds(slots: ComboSlots): string[] {
  return Object.values(slots).filter((id): id is string => Boolean(id))
}

/**
 * 兩套配裝是不是同一套。
 *
 * 有具名槽位時逐格比對（上蓋對上蓋、固鎖對固鎖），沒有的話比對排序後的完整清單。
 * 兩種都要求「每一件都相同、數量也相同」，不是「互相包含」。
 */
function isSameCombo(
  observation: TournamentObservation,
  slots: ComboSlots,
  observed: string[],
  selected: string[],
): boolean {
  if (observation.slots) {
    const observedEntries = Object.entries(observation.slots).filter(([, id]) => Boolean(id))
    const selectedEntries = Object.entries(slots).filter(([, id]) => Boolean(id))
    if (observedEntries.length !== selectedEntries.length) return false
    return observedEntries.every(([key, id]) => slots[key as keyof ComboSlots] === id)
  }
  if (observed.length !== selected.length) return false
  const a = [...observed].sort()
  const b = [...selected].sort()
  return a.every((id, index) => id === b[index])
}

/**
 * 產生這套配裝的證據理由。
 *
 * 賽事那一半刻意分兩級：整套命中（同一顆配置真的上過場）比單顆命中強得多，
 * 混在一起講會讓「我有一顆一樣的固鎖」聽起來像「這套打進過冠軍」。
 */
export function buildEvidenceReasons(args: {
  slots: ComboSlots
  parts: Part[]
  ratings: PartRatingInput[]
  observations: TournamentObservation[]
  events: TournamentEvent[]
}): EvidenceReason[] {
  const selected = slotPartIds(args.slots)
  if (selected.length === 0) return []

  const selectedSet = new Set(selected)
  const partById = new Map(args.parts.map((part) => [part.id, part]))
  const eventById = new Map(args.events.map((event) => [event.id, event]))
  const reasons: EvidenceReason[] = []

  /* --- 高手逐件評級 --- */
  const seenRating = new Set<string>()
  for (const rating of args.ratings) {
    if (!selectedSet.has(rating.partId)) continue
    const key = `${rating.partId}:${rating.tierLabel}`
    if (seenRating.has(key)) continue
    seenRating.add(key)
    const part = partById.get(rating.partId)
    const familyZhTW = part ? PART_FAMILY_ZH[part.family] : '零件'
    reasons.push({
      kind: 'expert',
      scope: 'part',
      // 前台會把單件的併成一行，所以這裡只留最短的講法。
      // 併行顯示時會被包進括號，所以這裡本身不要再用括號，否則變成括號套括號。
      textZhTW: `${familyZhTW}${rating.labelZhTW}　${rating.tierLabel} 級・${rating.agreeCount}/${rating.expertCount} 位高手`,
      partIds: [rating.partId],
      weight: 10 + tierWeight(rating.tierLabel),
    })
  }

  /* --- 賽事：整套命中 --- */
  const wholeComboEventIds = new Set<string>()
  for (const observation of args.observations) {
    const observed = observation.comboPartIds ?? slotPartIds(observation.slots ?? {})
    if (observed.length === 0) continue
    // 必須完全一樣才算「整套出現過」，不能只看「每一件都在選取的零件裡」——
    // 那種比法遇到重複零件會誤判（觀測 [A,B,B] 與選取 [A,A,B] 長度相同、
    // 每一件也都在集合裡，但根本不是同一套）。
    if (!isSameCombo(observation, args.slots, observed, selected)) continue
    const event = eventById.get(observation.eventId)
    if (!event) continue
    wholeComboEventIds.add(event.id)
    const placementZhTW = observation.placement ? PLACEMENT_ZH[observation.placement] : undefined
    reasons.push({
      kind: 'tournament',
      scope: 'combo',
      textZhTW: `這套配置整套出現在${event.name}${placementZhTW ? `${placementZhTW}隊伍` : ''}（${event.date}）`,
      partIds: observed,
      sourceUrl: observation.sourceUrl,
      eventId: event.id,
      weight: observation.placement ?? 5,
    })
  }

  /* --- 賽事：單顆零件命中（整套已命中的場次不重複講） --- */
  const perPart = new Map<string, { part: Part; best: TournamentObservation; event: TournamentEvent }>()
  for (const observation of args.observations) {
    if (wholeComboEventIds.has(observation.eventId)) continue
    const event = eventById.get(observation.eventId)
    if (!event) continue
    const observed = observation.comboPartIds ?? slotPartIds(observation.slots ?? {})
    for (const partId of observed) {
      if (!selectedSet.has(partId)) continue
      const part = partById.get(partId)
      if (!part) continue
      const current = perPart.get(partId)
      // 名次越前面越值得講；沒有名次的排最後。
      const rank = observation.placement ?? 99
      const currentRank = current?.best.placement ?? 99
      if (!current || rank < currentRank) perPart.set(partId, { part, best: observation, event })
    }
  }
  for (const [partId, hit] of perPart) {
    const placementZhTW = hit.best.placement ? PLACEMENT_ZH[hit.best.placement] : undefined
    const familyZhTW = PART_FAMILY_ZH[hit.part.family]
    const nameZhTW = resolveDisplayName(hit.part.naming).titleZhTW
    reasons.push({
      kind: 'tournament',
      scope: 'part',
      // 日期留給來源連結，併行顯示時只講場次與名次。
      textZhTW: `${familyZhTW}${nameZhTW}　${hit.event.name}${placementZhTW ?? ''}`,
      partIds: [partId],
      sourceUrl: hit.best.sourceUrl,
      eventId: hit.event.id,
      weight: 20 + (hit.best.placement ?? 9),
    })
  }

  return reasons.sort((a, b) => a.weight - b.weight)
}

/**
 * 沒有任何證據時要說得出「為什麼沒有」，不要只留一片空白。
 * 空手的原因幾乎都是這套用到的零件還沒進榜、也還沒在收錄的賽事出現過。
 */
export const NO_EVIDENCE_NOTE_ZH =
  '這套用到的零件還沒進高手榜，也還沒出現在已收錄的賽事紀錄裡。以下只有模型推估。'

/* ------------------------------------------------- 整顆陀螺的一句話結論 */

/** 六軸分數的最小輸入形狀，避免這一層依賴 analysis 模組。 */
export interface ComboScoreInput {
  attack: number
  defense: number
  stamina: number
  burst: number
  burstResistance: number
  stability: number
}

const AXIS_STRENGTH_ZH: Record<keyof ComboScoreInput, string> = {
  attack: '正面撞擊',
  defense: '硬吃攻擊',
  stamina: '拖到最後',
  burst: '打爆對手',
  burstResistance: '不被打爆',
  stability: '站得住',
}

const AXIS_WEAKNESS_ZH: Record<keyof ComboScoreInput, string> = {
  attack: '撞不動人',
  defense: '被撞就吃虧',
  stamina: '拖不久',
  burst: '很難打爆對手',
  burstResistance: '容易被打爆',
  stability: '姿勢容易亂',
}

/**
 * 用一句話講完這顆陀螺是什麼打法。
 *
 * 為什麼需要：六軸給的是六個數字，逐條讀完才拼得出「所以這顆是幹嘛的」；
 * 而證據理由列的是一顆顆零件，讀起來像三份零件報告而不是一顆陀螺的分析。
 * 這一句把最強與最弱的軸翻成人話，放在所有細節之前。
 *
 * 只講模型算得出來的東西；沒有分數就回 undefined，不要硬湊一句廢話。
 */
export function buildComboVerdict(args: {
  scores?: ComboScoreInput
  typeZhTW?: string
}): string | undefined {
  const { scores } = args
  if (!scores) return undefined
  const entries = (Object.keys(AXIS_STRENGTH_ZH) as (keyof ComboScoreInput)[])
    .map((axis) => ({ axis, value: scores[axis] }))
    .sort((a, b) => b.value - a.value)
  const best = entries[0]
  const worst = entries[entries.length - 1]
  if (!best || !worst) return undefined

  // 六軸差距太小時不要硬講「擅長什麼」，那只是模型的雜訊。
  if (best.value - worst.value < 12) {
    return '六個面向分數接近，是沒有明顯偏向的平均型配置。'
  }
  const typePrefix = args.typeZhTW && args.typeZhTW !== '資料不足' ? `${args.typeZhTW}型配置：` : ''
  return `${typePrefix}強在${AXIS_STRENGTH_ZH[best.axis]}，弱在${AXIS_WEAKNESS_ZH[worst.axis]}。`
}


/* ------------------------------------------------- 單件證據按零件合併 */

export interface PartEvidenceSummary {
  partId: string
  /** 「固鎖3-60」這種前綴，同一顆只出現一次。 */
  labelZhTW: string
  /** 這顆零件的各項憑據，已經去掉重複的零件名。 */
  notesZhTW: string[]
  sourceUrl?: string
}

/**
 * 把單件理由按零件併起來。
 *
 * 不併的話同一顆固鎖會出現兩次（一次高手評級、一次賽事紀錄），
 * 讀起來像在講兩顆不同的零件。
 */
export function summarizePartEvidence(reasons: EvidenceReason[]): PartEvidenceSummary[] {
  const byPart = new Map<string, PartEvidenceSummary>()
  for (const reason of reasons) {
    if (reason.scope !== 'part') continue
    const partId = reason.partIds[0]
    if (!partId) continue
    // 文字格式是「<零件名>　<內容>」，全形空白後面才是這一條真正要講的事。
    const [label, ...rest] = reason.textZhTW.split('　')
    const note = rest.join('　').trim()
    const existing = byPart.get(partId)
    if (existing) {
      if (note && !existing.notesZhTW.includes(note)) existing.notesZhTW.push(note)
      if (!existing.sourceUrl && reason.sourceUrl) existing.sourceUrl = reason.sourceUrl
      continue
    }
    byPart.set(partId, {
      partId,
      labelZhTW: (label ?? reason.textZhTW).trim(),
      notesZhTW: note ? [note] : [],
      ...(reason.sourceUrl ? { sourceUrl: reason.sourceUrl } : {}),
    })
  }
  return [...byPart.values()]
}
