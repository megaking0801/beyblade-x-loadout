/** 已匯入賽事資料的反查與統計。只處理完整、已映射到 Catalog 的牌組。 */
import { comboFullCode, type EvidenceInput } from './analysis.ts'
import { resolveDisplayName } from './naming.ts'
import type {
  BeyType,
  ComboSlots,
  Part,
  SourceTier,
  TournamentDeck,
  TournamentEvent,
  TournamentObservation,
} from './types.ts'

const TIER_RANK: Record<SourceTier, number> = {
  official: 5,
  official_organizer: 4,
  verified_community: 3,
  community: 2,
  user_submitted: 1,
}

export type PartialMatchKind = 'blade' | 'ratchet_bit'

/**
 * 部分相符只表示零件曾在賽事配置中出現，絕不是同一套配裝的成績。
 * 它不能餵給 analyzeCombo，避免把零件使用次數誤當完整配置證據。
 */
export interface PartialTournamentMatch {
  kind: PartialMatchKind
  labelZhTW: string
  appearances: number
  top4: number
  championships: number
  /** 以「配置顆數」為分母；不是完整牌組數。 */
  totalComboSlots: number
  sourceTier: SourceTier
}

export interface TournamentEvidenceReport {
  exact?: EvidenceInput
  partial: PartialTournamentMatch[]
  eventCount: number
  fullDeckCount: number
  comboSlotCount: number
}

export interface TournamentObservationMatch {
  id: string
  eventName: string
  eventDate: string
  placement?: number
  sourceUrl: string
}

/**
 * 所有樣本皆計入分母；來源等級採實際命中資料中最低者，避免混合來源時虛增可信度。
 */
export function getComboTournamentEvidence(args: {
  slots: ComboSlots
  parts: Part[]
  events: TournamentEvent[]
  decks: TournamentDeck[]
}): EvidenceInput | undefined {
  const comboKey = comboFullCode(args.slots, args.parts)
  if (!comboKey) return undefined
  const eventById = new Map(args.events.map((event) => [event.id, event]))
  const mappedDecks = args.decks.filter((deck) => eventById.has(deck.eventId) && deck.comboKeys.length === 3)
  const matched = mappedDecks.filter((deck) => deck.comboKeys.includes(comboKey))
  if (matched.length === 0) return undefined
  const tiers = matched
    .map((deck) => eventById.get(deck.eventId)!.sourceTier)
    .sort((a, b) => TIER_RANK[a] - TIER_RANK[b])
  return {
    appearances: matched.length,
    top4: matched.filter((deck) => (deck.placement ?? Infinity) <= 4).length,
    championships: matched.filter((deck) => deck.placement === 1).length,
    totalDecks: mappedDecks.length,
    sourceTier: tiers[0]!,
  }
}

/** 完全相符與部分相符分開回報，讓 UI 可以用不同標籤與分母呈現。 */
export function getTournamentEvidenceReport(args: {
  slots: ComboSlots
  parts: Part[]
  events: TournamentEvent[]
  decks: TournamentDeck[]
}): TournamentEvidenceReport {
  const eventById = new Map(args.events.map((event) => [event.id, event]))
  const decks = args.decks.filter((deck) => eventById.has(deck.eventId) && deck.comboKeys.length === 3)
  const combos = decks.flatMap((deck) =>
    (deck.comboPartIds ?? []).map((partIds) => ({ deck, partIds, event: eventById.get(deck.eventId)! })),
  )
  const selected = [args.slots.bladeId, args.slots.ratchetId, args.slots.bitId]
  const [bladeId, ratchetId, bitId] = selected
  const partial: PartialTournamentMatch[] = []

  const summarize = (kind: PartialMatchKind, labelZhTW: string, matches: typeof combos) => {
    if (matches.length === 0) return
    const tiers = matches.map((row) => row.event.sourceTier).sort((a, b) => TIER_RANK[a] - TIER_RANK[b])
    partial.push({
      kind,
      labelZhTW,
      appearances: matches.length,
      top4: matches.filter((row) => (row.deck.placement ?? Infinity) <= 4).length,
      championships: matches.filter((row) => row.deck.placement === 1).length,
      totalComboSlots: combos.length,
      sourceTier: tiers[0]!,
    })
  }

  if (bladeId) summarize('blade', '上蓋部分相符', combos.filter((row) => row.partIds[0] === bladeId))
  if (ratchetId && bitId) {
    summarize('ratchet_bit', '固鎖＋軸心部分相符', combos.filter((row) => row.partIds[1] === ratchetId && row.partIds[2] === bitId))
  }

  return {
    ...(getComboTournamentEvidence(args) ? { exact: getComboTournamentEvidence(args) } : {}),
    partial,
    eventCount: new Set(decks.map((deck) => deck.eventId)).size,
    fullDeckCount: decks.length,
    comboSlotCount: combos.length,
  }
}

export function getPartTournamentDecks(partId: string, decks: TournamentDeck[]): TournamentDeck[] {
  return decks.filter((deck) => deck.comboPartIds?.some((combo) => combo.includes(partId)))
}

/**
 * 從「不是完整三對三牌組」的來源觀測裡找出一顆已映射配置。
 * 回傳值只能做來源揭露，不能交給 analyzeCombo 當作賽事 evidence。
 */
export function getObservedComboMatches(args: {
  slots: ComboSlots
  events: TournamentEvent[]
  observations: TournamentObservation[]
}): TournamentObservationMatch[] {
  const selected = [args.slots.bladeId, args.slots.ratchetId, args.slots.bitId]
  const hasStandardSlots = selected.every((partId): partId is string => Boolean(partId))
  const eventById = new Map(args.events.map((event) => [event.id, event]))
  return args.observations.flatMap((observation) => {
    const event = eventById.get(observation.eventId)
    if (!event) return []
    const standardMatch =
      hasStandardSlots &&
      observation.comboPartIds?.length === selected.length &&
      observation.comboPartIds.every((partId, index) => partId === selected[index])
    const slottedMatch =
      observation.slots !== undefined &&
      Object.entries(observation.slots).every(([key, partId]) => args.slots[key as keyof ComboSlots] === partId)
    if (!standardMatch && !slottedMatch) return []
    return [{
      id: observation.id,
      eventName: event.name,
      eventDate: event.date,
      ...(observation.placement === undefined ? {} : { placement: observation.placement }),
      sourceUrl: observation.sourceUrl,
    }]
  })
}

/** 單一零件的來源觀測反查；同樣不構成完整牌組統計。 */
export function getPartTournamentObservations(
  partId: string,
  observations: TournamentObservation[],
): TournamentObservation[] {
  return observations.filter(
    (observation) =>
      observation.comboPartIds?.includes(partId) || Object.values(observation.slots ?? {}).includes(partId),
  )
}

/**
 * 首頁「賽場正在用什麼」要顯示的一副代表性牌組。
 *
 * 只挑已經完整映射到圖鑑的牌組——映射不完整的那幾副屬於「來源觀測」，
 * 不能拿來當成完整牌組呈現（第 23 節）。挑選順序：賽事等級 → 日期 → 名次。
 */
export interface FeaturedDeckMember {
  nameZhTW: string
  /** 官方沒公布類型時就是 undefined，前台不要硬給顏色（第 1.5 節）。 */
  type?: BeyType
}

export interface FeaturedTournamentDeck {
  eventNameZhTW: string
  date: string
  tier?: TournamentEvent['tier']
  placement?: number
  sourceUrl: string
  members: FeaturedDeckMember[]
}

/** 賽事等級的高低。官方等級制度：G1 最高，社群賽事與未標示的排最後。 */
const EVENT_TIER_RANK: Record<NonNullable<TournamentEvent['tier']>, number> = {
  G1: 6,
  G2: 5,
  G3: 4,
  S1: 3,
  community: 2,
  other: 1,
}

export function getFeaturedTournamentDeck(args: {
  events: TournamentEvent[]
  decks: TournamentDeck[]
  parts: Part[]
}): FeaturedTournamentDeck | undefined {
  const { events, decks, parts } = args
  const eventById = new Map(events.map((event) => [event.id, event]))
  const partById = new Map(parts.map((part) => [part.id, part]))

  type Candidate = { deck: TournamentDeck; event: TournamentEvent; members: FeaturedDeckMember[] }
  const candidates: Candidate[] = []

  for (const deck of decks) {
    const event = eventById.get(deck.eventId)
    if (!event) continue
    const combos = deck.comboPartIds
    if (!combos || combos.length === 0) continue

    const members: FeaturedDeckMember[] = []
    let allMapped = true
    for (const combo of combos) {
      const resolved = combo.map((partId) => partById.get(partId))
      // 一顆對不到圖鑑就整副不用——半副牌組顯示出去會讓人以為那就是完整配置。
      if (resolved.some((part) => part === undefined)) {
        allMapped = false
        break
      }
      const memberParts = resolved as Part[]
      members.push({
        nameZhTW: memberParts
          .map((part) => resolveDisplayName(part.naming).titleZhTW)
          .filter(Boolean)
          .join(' '),
        // 類型看上蓋（第一顆），那是這套配裝的打法來源。
        ...(memberParts[0]?.type ? { type: memberParts[0].type } : {}),
      })
    }
    if (!allMapped || members.length === 0) continue
    candidates.push({ deck, event, members })
  }

  if (candidates.length === 0) return undefined

  const rank = (event: TournamentEvent): number => (event.tier ? EVENT_TIER_RANK[event.tier] : 0)
  candidates.sort((a, b) => {
    const byTier = rank(b.event) - rank(a.event)
    if (byTier !== 0) return byTier
    const byDate = b.event.date.localeCompare(a.event.date)
    if (byDate !== 0) return byDate
    // 沒有名次的排在有名次的後面，不要讓它擠掉冠軍。
    const aPlace = a.deck.placement ?? Number.MAX_SAFE_INTEGER
    const bPlace = b.deck.placement ?? Number.MAX_SAFE_INTEGER
    if (aPlace !== bPlace) return aPlace - bPlace
    return a.deck.id.localeCompare(b.deck.id)
  })

  const best = candidates[0]!
  return {
    eventNameZhTW: best.event.name,
    date: best.event.date,
    ...(best.event.tier ? { tier: best.event.tier } : {}),
    ...(best.deck.placement === undefined ? {} : { placement: best.deck.placement }),
    sourceUrl: best.deck.sourceUrl || best.event.sourceUrl,
    members: best.members,
  }
}
