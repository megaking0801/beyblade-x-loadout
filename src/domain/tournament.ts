/** 已匯入賽事資料的反查與統計。只處理完整、已映射到 Catalog 的牌組。 */
import { comboFullCode, type EvidenceInput } from './analysis.ts'
import type { ComboSlots, Part, SourceTier, TournamentDeck, TournamentEvent } from './types.ts'

const TIER_RANK: Record<SourceTier, number> = {
  official: 5,
  official_organizer: 4,
  verified_community: 3,
  community: 2,
  user_submitted: 1,
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

export function getPartTournamentDecks(partId: string, decks: TournamentDeck[]): TournamentDeck[] {
  return decks.filter((deck) => deck.comboPartIds?.some((combo) => combo.includes(partId)))
}
