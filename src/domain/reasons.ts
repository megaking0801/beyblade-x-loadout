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

export interface EvidenceReason {
  kind: EvidenceKind
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
      textZhTW: `${familyZhTW}「${rating.labelZhTW}」有 ${rating.agreeCount}/${rating.expertCount} 位高手評為 ${rating.tierLabel} 級`,
      partIds: [rating.partId],
      weight: 10 + tierWeight(rating.tierLabel),
    })
  }

  /* --- 賽事：整套命中 --- */
  const wholeComboEventIds = new Set<string>()
  for (const observation of args.observations) {
    const observed = observation.comboPartIds ?? slotPartIds(observation.slots ?? {})
    if (observed.length === 0) continue
    const sameSize = observed.length === selected.length
    if (!sameSize || !observed.every((id) => selectedSet.has(id))) continue
    const event = eventById.get(observation.eventId)
    if (!event) continue
    wholeComboEventIds.add(event.id)
    const placementZhTW = observation.placement ? PLACEMENT_ZH[observation.placement] : undefined
    reasons.push({
      kind: 'tournament',
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
      textZhTW: `${familyZhTW}「${nameZhTW}」出現在${hit.event.name}${placementZhTW ? `${placementZhTW}隊伍` : ''}（${hit.event.date}）`,
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
