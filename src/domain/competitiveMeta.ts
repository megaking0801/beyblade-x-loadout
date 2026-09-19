/**
 * 競技 Meta 快照。
 *
 * 這不是即時爬蟲：PWA 需要可離線、可追溯地工作，所以每次更新都把來源、日期與
 * 樣本一起固定在版本庫。台灣資料優先；全球 Top Cut 只在台灣缺少同一完整配置時補樣本。
 */
import type { EvidenceInput } from './analysis.ts'
import type { SourceTier, TournamentDeck, TournamentEvent } from './types.ts'

export interface CompetitiveMetaEntry {
  /** comboFullCode 的標準三件式格式，例如「ウィザードロッド 1-60H」。 */
  comboCode: string
  region: 'taiwan' | 'global'
  observedFrom: string
  observedTo: string
  appearances: number
  top4: number
  championships: number
  totalDecks: number
  sourceUrl: string
}

/**
 * 2026-09-20 快照。全球資料來自 BEYWATCH 完整配置榜（更新至 9/18）；
 * 台灣完整牌組則由 Catalog 內的 BeybladeHub 賽果動態彙整，避免重複抄兩份資料。
 */
export const competitiveMetaSnapshot = {
  version: 'competitive-meta-2026-09-20-r1',
  taiwanSourceUrl: 'https://beybladehub.app/combos',
  globalSourceUrl: 'https://beywatch.gg/combos',
  updatedAt: '2026-09-20',
  entries: [
    { comboCode: 'シャークスケイル 7-60R', region: 'global', observedFrom: '2026-01-01', observedTo: '2026-09-18', appearances: 73, top4: 0, championships: 0, totalDecks: 0, sourceUrl: 'https://beywatch.gg/combos' },
    { comboCode: 'シャークスケイル 1-70LR', region: 'global', observedFrom: '2026-01-01', observedTo: '2026-09-18', appearances: 810, top4: 0, championships: 0, totalDecks: 0, sourceUrl: 'https://beywatch.gg/combos' },
    { comboCode: 'ウィザードロッド 1-60FB', region: 'global', observedFrom: '2026-01-01', observedTo: '2026-09-18', appearances: 342, top4: 0, championships: 0, totalDecks: 0, sourceUrl: 'https://beywatch.gg/combos' },
    { comboCode: 'ウィザードロッド 1-60H', region: 'global', observedFrom: '2026-01-01', observedTo: '2026-09-18', appearances: 2532, top4: 0, championships: 0, totalDecks: 0, sourceUrl: 'https://beywatch.gg/combos' },
    { comboCode: 'エアロペガサス 1-60R', region: 'global', observedFrom: '2026-01-01', observedTo: '2026-09-18', appearances: 322, top4: 0, championships: 0, totalDecks: 0, sourceUrl: 'https://beywatch.gg/combos' },
    { comboCode: 'エアロペガサス 3-60R', region: 'global', observedFrom: '2026-01-01', observedTo: '2026-09-18', appearances: 113, top4: 0, championships: 0, totalDecks: 0, sourceUrl: 'https://beywatch.gg/combos' },
    { comboCode: 'メテオドラグーン 9-60E', region: 'global', observedFrom: '2026-01-01', observedTo: '2026-09-18', appearances: 76, top4: 0, championships: 0, totalDecks: 0, sourceUrl: 'https://beywatch.gg/combos' },
    { comboCode: 'コバルトドラグーン 5-60E', region: 'global', observedFrom: '2026-01-01', observedTo: '2026-09-18', appearances: 1034, top4: 0, championships: 0, totalDecks: 0, sourceUrl: 'https://beywatch.gg/combos' },
    { comboCode: 'ワイバーンホバー 9-60K', region: 'global', observedFrom: '2026-01-01', observedTo: '2026-09-18', appearances: 539, top4: 0, championships: 0, totalDecks: 0, sourceUrl: 'https://beywatch.gg/combos' },
  ] satisfies CompetitiveMetaEntry[],
} as const

export interface CompetitiveEvidence extends EvidenceInput {
  region: 'taiwan' | 'global' | 'mixed'
  updatedAt: string
  sourceUrls: string[]
}

function sourceTier(events: TournamentEvent[], eventId: string): SourceTier {
  return events.find((event) => event.id === eventId)?.sourceTier ?? 'community'
}

/** 將 Catalog 的台灣完整 3on3 賽果與版本化全球快照合併為「完整配置」證據。 */
export function createCompetitiveEvidenceByCode(args: {
  events: TournamentEvent[]
  decks: TournamentDeck[]
}): Record<string, CompetitiveEvidence> {
  const { events, decks } = args
  const localDecks = decks.filter((deck) => deck.comboKeys.length === 3 && events.some((event) => event.id === deck.eventId))
  const localTotal = localDecks.length
  const localByCode = new Map<string, { appearances: number; top4: number; championships: number; tiers: SourceTier[]; urls: Set<string> }>()
  for (const deck of localDecks) {
    for (const code of deck.comboKeys) {
      const row = localByCode.get(code) ?? { appearances: 0, top4: 0, championships: 0, tiers: [], urls: new Set<string>() }
      row.appearances += 1
      if ((deck.placement ?? Infinity) <= 4) row.top4 += 1
      if (deck.placement === 1) row.championships += 1
      row.tiers.push(sourceTier(events, deck.eventId))
      if (deck.sourceUrl) row.urls.add(deck.sourceUrl)
      localByCode.set(code, row)
    }
  }

  const result: Record<string, CompetitiveEvidence> = {}
  for (const [code, row] of localByCode) {
    result[code] = {
      appearances: row.appearances,
      top4: row.top4,
      championships: row.championships,
      totalDecks: localTotal,
      sourceTier: row.tiers.sort()[0] ?? 'community',
      region: 'taiwan',
      updatedAt: competitiveMetaSnapshot.updatedAt,
      sourceUrls: [...row.urls],
    }
  }

  for (const entry of competitiveMetaSnapshot.entries) {
    const local = result[entry.comboCode]
    // 台灣有相同完整配置時，只用台灣結果排序；全球資料仍由 UI 作為補充來源揭露。
    if (local) {
      local.sourceUrls.push(entry.sourceUrl)
      continue
    }
    result[entry.comboCode] = {
      appearances: entry.appearances,
      top4: entry.top4,
      championships: entry.championships,
      // BEYWATCH 此快照公開的是該完整配置的 Top Cut 出現次數，沒有可安全
      // 對應到本 App「完整牌組數」的分母。用配置樣本數作為最小安全分母，
      // 讓分析層不會將未知值當成 0 而觸發統計錯誤；前台不顯示 meta share。
      totalDecks: Math.max(entry.totalDecks, entry.appearances),
      sourceTier: 'verified_community',
      region: 'global',
      updatedAt: competitiveMetaSnapshot.updatedAt,
      sourceUrls: [entry.sourceUrl],
    }
  }
  return result
}

/**
 * 完整配置的競技排序值。台灣結果給優先係數，接著才比較 Top4／冠軍；
 * 沒有完整證據時回 0，讓呼叫端用結構推估當次順位而非假裝它是實戰強勢。
 */
export function competitiveEvidenceScore(evidence: CompetitiveEvidence | undefined): number {
  if (!evidence) return 0
  const regionWeight = evidence.region === 'taiwan' ? 1.6 : 1
  const rate = evidence.totalDecks > 0 ? evidence.appearances / evidence.totalDecks : 0
  return regionWeight * (evidence.appearances * 2 + evidence.top4 * 4 + evidence.championships * 6 + rate * 100)
}
