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
  region: 'taiwan' | 'community' | 'global' | 'mixed'
  updatedAt: string
  sourceUrls: string[]
}

function sourceTier(events: TournamentEvent[], eventId: string): SourceTier {
  return events.find((event) => event.id === eventId)?.sourceTier ?? 'community'
}

/**
 * 每個 comboCode 在自己來源的 appearances 分布裡排第幾百分位（0～100）。
 *
 * 為什麼要用百分位而不是原始筆數：不同來源樣本數量級差很多（台灣本地
 * 14 筆牌組 vs 社群站台上萬筆逐場紀錄），直接把 appearances 相加或比較，
 * 會讓「查得到大量社群出場數」的配置系統性贏過「真的在本地賽事拿過冠軍」
 * 的配置——這正是先前 `competitiveEvidenceScore()` 出過的那個 bug（見下方
 * 該函式的註解），這裡把同一個問題在源頭修掉，讓不同來源的分數變得可比。
 * 用百分位排名（而非原始次數）也不需要另外發明一組沒校準過的權重常數。
 */
function computePercentiles(appearancesByCode: Map<string, number>): Map<string, number> {
  const sorted = [...appearancesByCode.values()].sort((a, b) => a - b)
  const percentileOf = (value: number): number => {
    if (sorted.length <= 1) return sorted.length === 0 ? 0 : 100
    // 排名用「有多少筆 <= 我」而不是嚴格小於，讓同分的配置拿到相同百分位，
    // 不會因為排序穩定性而產生看起來隨機的名次差異。
    let countLessEqual = 0
    for (const other of sorted) if (other <= value) countLessEqual++
    return Math.round((100 * (countLessEqual - 1)) / (sorted.length - 1))
  }
  const result = new Map<string, number>()
  for (const [code, value] of appearancesByCode) result.set(code, percentileOf(value))
  return result
}

/**
 * 把 Catalog 的台灣完整 3on3 賽果、社群站台逐場紀錄，與版本化全球快照合併為
 * 「完整配置」證據。優先序：台灣本地 > 社群站台（`communityRecords`，見
 * `catalog/communityRecords.ts`）> 全球快照——沿用既有「台灣資料優先」原則，
 * 每個 comboCode 只採一個來源的證據，不同來源不混在同一筆裡加總。
 */
export function createCompetitiveEvidenceByCode(args: {
  events: TournamentEvent[]
  decks: TournamentDeck[]
  /** 見 `catalog/communityRecords.ts`：`getCommunityRecords()` + `communityRecordsMeta`。 */
  community?: { records: { comboCode: string; rank?: number }[]; updatedAt: string; sourceUrl: string }
}): Record<string, CompetitiveEvidence> {
  const { events, decks, community } = args
  const communityRecords = community?.records ?? []
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
  const taiwanPercentiles = computePercentiles(new Map([...localByCode].map(([code, row]) => [code, row.appearances])))

  const communityByCode = new Map<string, { appearances: number; top4: number; championships: number }>()
  for (const record of communityRecords) {
    const row = communityByCode.get(record.comboCode) ?? { appearances: 0, top4: 0, championships: 0 }
    row.appearances += 1
    // 站方資料只細分到 1st/2nd/3rd，沒有第 4 名，top4 這裡實際是 top3 的近似值，
    // 比沒有名次資訊可用好，但不假裝跟本地資料的 top4 定義完全一樣。
    if (record.rank !== undefined && record.rank <= 3) row.top4 += 1
    if (record.rank === 1) row.championships += 1
    communityByCode.set(record.comboCode, row)
  }
  const communityTotal = communityRecords.length
  const communityPercentiles = computePercentiles(new Map([...communityByCode].map(([code, row]) => [code, row.appearances])))

  const globalPercentiles = computePercentiles(
    new Map(competitiveMetaSnapshot.entries.map((entry) => [entry.comboCode, entry.appearances])),
  )

  const result: Record<string, CompetitiveEvidence> = {}
  for (const [code, row] of localByCode) {
    result[code] = {
      appearances: row.appearances,
      top4: row.top4,
      championships: row.championships,
      totalDecks: localTotal,
      sourceTier: row.tiers.sort()[0] ?? 'community',
      region: 'taiwan',
      percentileScore: taiwanPercentiles.get(code),
      updatedAt: competitiveMetaSnapshot.updatedAt,
      sourceUrls: [...row.urls],
    }
  }

  for (const [code, row] of communityByCode) {
    if (result[code]) continue
    result[code] = {
      appearances: row.appearances,
      top4: row.top4,
      championships: row.championships,
      totalDecks: communityTotal,
      sourceTier: 'verified_community',
      region: 'community',
      percentileScore: communityPercentiles.get(code),
      updatedAt: community?.updatedAt ?? competitiveMetaSnapshot.updatedAt,
      sourceUrls: community?.sourceUrl ? [community.sourceUrl] : [],
    }
  }

  for (const entry of competitiveMetaSnapshot.entries) {
    const existing = result[entry.comboCode]
    // 台灣／社群站台有相同完整配置時，只用該筆結果排序；全球資料仍由 UI
    // 作為補充來源揭露（附上 sourceUrl，不進排序）。
    if (existing) {
      existing.sourceUrls.push(entry.sourceUrl)
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
      percentileScore: globalPercentiles.get(entry.comboCode),
      updatedAt: competitiveMetaSnapshot.updatedAt,
      sourceUrls: [entry.sourceUrl],
    }
  }
  return result
}

/**
 * 完整配置的競技排序值。只採台灣賽果進分數；全球快照沒有名次欄位，
 * 且 appearances 是爬蟲累計的全域出場次數（動輒成百上千），跟台灣樣本內的
 * 實際筆數（個位數）不同量級，混進同一個分數會讓「查得到全球出場數但完全
 * 沒有名次」的配置贏過真正拿過冠軍的台灣配置。全球資料改由呼叫端直接讀
 * `CompetitiveEvidence.appearances`／`sourceUrls` 做補充揭露，不進這個分數。
 *
 * 注意：這個函式目前沒有被 `recommendations.ts` 使用（見該檔案改用
 * `percentileScore` 計算 `competitiveEvidenceGain`），只留給它自己的單元測試。
 */
export function competitiveEvidenceScore(evidence: CompetitiveEvidence | undefined): number {
  if (!evidence || evidence.region !== 'taiwan') return 0
  const rate = evidence.totalDecks > 0 ? evidence.appearances / evidence.totalDecks : 0
  return evidence.appearances * 2 + evidence.top4 * 4 + evidence.championships * 6 + rate * 100
}
