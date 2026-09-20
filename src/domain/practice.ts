/**
 * 實戰資料層。
 *
 * 不把 T 表、賽事名次或單支開箱影片偽裝成 head-to-head 戰績。這個模組的
 * 工作是把每一個 Catalog 零件都帶進同一套可回查的實戰檔案，並在沒有足夠
 * 完整對局時，清楚地回報「待驗證」。
 */
import { getExpertPartRatings, getExpertTierMatches } from '../catalog/tierLists.ts'
import { getSlotSchemaForSlots } from './compatibility.ts'
import { resolveDisplayName } from './naming.ts'
import type { ComboSlots, Part, TournamentEvent, TournamentObservation } from './types.ts'

export type PracticeVerdictStatus = 'observed' | 'pending' | 'insufficient'

/**
 * 人工逐局紀錄的最小欄位。來源必須能回看雙方完整配置與結果；沒有這些欄位的
 * 開箱、T 表、賽事名次都不允許寫進來。
 */
export interface MatchupObservation {
  id: string
  a: ComboSlots
  b: ComboSlots
  winner: 'a' | 'b'
  finish: 'xtreme' | 'over' | 'burst' | 'spin'
  sourceId: string
  sourceUrl: string
  timestampSeconds: number
  recordedAt: string
  format: string
  stadium: string
}

/**
 * 目前研究到的影片多為配裝／實測介紹，尚不能可靠辨識每一局雙方完整配置，
 * 所以刻意留空。寧可顯示 0 筆，也不把賽事名次或影片標題偽造成交手紀錄。
 */
export const matchupObservations: readonly MatchupObservation[] = []

export interface PracticeSource {
  id: string
  nameZhTW: string
  kindZhTW: string
  sourceUrl: string
  updatedAt: string
  independence: 'primary' | 'curated'
  noteZhTW: string
}

export interface PartPracticeProfile {
  partId: string
  partNameZhTW: string
  familyZhTW: string
  status: 'covered' | 'limited'
  summaryZhTW: string
  cautionsZhTW: string[]
  sourceUrls: string[]
  expertRating?: { tierLabel: string; agreeCount: number; expertCount: number }
  expertSources: ReturnType<typeof getExpertTierMatches>
}

/**
 * 賽事「配置觀測」：這是選手在前四名牌組裡實際使用的配置，不是逐局勝率。
 * exact 只會在三件式／整合式的完整槽位都相同時出現；同上蓋替代則明確標示為
 * alternative，避免把換了固鎖或軸心的成績偷套回目前配置。
 */
export interface TournamentPracticeRecord {
  id: string
  relation: 'exact' | 'same_blade'
  reportedCombo: string
  placement?: number
  eventNameZhTW: string
  eventDate: string
  participantCount?: number
  sourceUrl: string
}

export interface TournamentPracticeEvidence {
  exact: TournamentPracticeRecord[]
  sameBladeAlternatives: TournamentPracticeRecord[]
}

export interface PracticalComparison {
  status: PracticeVerdictStatus
  titleZhTW: string
  noticeZhTW: string
  heightTimelineZhTW: { opening: string; midgame: string; endgame: string }
  profilesA: PartPracticeProfile[]
  profilesB: PartPracticeProfile[]
  tournamentA: TournamentPracticeEvidence
  tournamentB: TournamentPracticeEvidence
  expertEvidence: ReturnType<typeof getExpertTierMatches>
  sources: PracticeSource[]
  observedRounds: number
  observedSourceCount: number
  observedAWins: number
  observedBWins: number
}

/** 可直接回查的台灣優先來源；彙整站只作索引，不能增加獨立樣本數。 */
export const practiceSources: PracticeSource[] = [
  {
    id: 'atu-2026-guide',
    nameZhTW: 'Namaste 阿土',
    kindZhTW: '配置／實測影片',
    sourceUrl: 'https://www.youtube.com/watch?v=s_hTcLMUstA',
    updatedAt: '2026-01-02',
    independence: 'primary',
    noteZhTW: '用於人工摘錄配置與實測觀察；沒有辨識雙方完整配置與結果時不計入對戰勝負。',
  },
  {
    id: 'weichen-battle',
    nameZhTW: '維辰孔丘',
    kindZhTW: '實戰影片',
    sourceUrl: 'https://www.youtube.com/watch?v=1Rl0dEh3Xkg',
    updatedAt: '2024-12-07',
    independence: 'primary',
    noteZhTW: '用於人工摘錄可辨識的對局；舊環境內容會保留日期，不套用到新零件。',
  },
  {
    id: 'tw-tier',
    nameZhTW: '台灣天梯情報站',
    kindZhTW: '社群彙整',
    sourceUrl: 'https://stan-yao.github.io/beyblade_x_tier/',
    updatedAt: '2026-09-15',
    independence: 'curated',
    noteZhTW: '彙整阿土、RENLIgames 等評估，只作來源索引與共識提示。',
  },
  {
    id: 'hub-tournaments',
    nameZhTW: 'BeybladeHub 台灣賽事資料',
    kindZhTW: '賽果／配置彙整',
    sourceUrl: 'https://beybladehub.app/tournaments',
    updatedAt: '2026-09-20',
    independence: 'curated',
    noteZhTW: '名次與配置只代表賽場出現；沒有逐局對手資料時不能推論剋制。',
  },
]

const FAMILY_ZH: Record<Part['family'], string> = {
  blade: '上蓋', ratchet: '固鎖', bit: '軸心', lock_chip: '鎖定紋章',
  main_blade: '主刃', over_blade: 'Over Blade', assist_blade: '輔助刃',
  integrated_blade: '一體式上蓋', other: '其他零件',
}

function selectedParts(slots: ComboSlots, parts: Part[]): Part[] {
  const ids = new Set(
    getSlotSchemaForSlots(slots, parts)
      .map((slot) => slots[slot.key])
      .filter((id): id is string => Boolean(id)),
  )
  return parts.filter((part) => ids.has(part.id))
}

function profileFor(
  part: Part,
  ratingsByPartId: ReadonlyMap<string, { tierLabel: string; agreeCount: number; expertCount: number }>,
  tierSourcesByPartId: ReadonlyMap<string, ReturnType<typeof getExpertTierMatches>>,
): PartPracticeProfile {
  const name = resolveDisplayName(part.naming).titleZhTW
  const sourceUrls = [...new Set(part.provenance.sourceUrls)]
  const rating = ratingsByPartId.get(part.id)
  const covered = rating !== undefined
  const height = typeof part.heightCode === 'number' ? `高度碼 ${part.heightCode}` : undefined
  const summaryByFamily: Partial<Record<Part['family'], string>> = {
    ratchet: `${height ?? '高度資料不足'}；固鎖的判讀必須同時看凸點暴露、鎖定、配重與搭配的上蓋／軸心。`,
    bit: `軸心會改變開局移動與後期姿態；不可只用官方類型替代實戰對局。`,
    blade: `上蓋的接觸面、旋向、重量與版本都會改變配裝效果；不以單一 T 表決定剋制。`,
    main_blade: `CX 主刃僅能連同鎖定紋章、Over Blade／輔助刃與其他零件判讀。`,
    lock_chip: `CX 鎖定紋章的結論需以完整結構與實際相容組合為準。`,
    over_blade: `CX Over Blade 的效果依主刃與輔助刃而變，沒有完整結構不得外推。`,
    assist_blade: `CX 輔助刃的效果依主刃與 Over Blade 而變，沒有完整結構不得外推。`,
    integrated_blade: `一體式結構以完整組合判讀，不能套用標準三件式固鎖規則。`,
  }
  return {
    partId: part.id,
    partNameZhTW: name,
    familyZhTW: FAMILY_ZH[part.family],
    status: covered ? 'covered' : 'limited',
    summaryZhTW: summaryByFamily[part.family] ?? '此零件已納入實戰檔案；目前沒有足夠的可核對對局可單獨歸因。',
    cautionsZhTW: [
      ...(covered ? ['已有台灣／日本高手評級來源；評級是觀察，不是對戰勝率。'] : ['尚缺可歸因的社群實測；不會借用熱門零件的結論。']),
      ...(sourceUrls.length === 0 ? ['Catalog 來源不足，不能產生實戰結論。'] : []),
    ],
    sourceUrls,
    ...(rating ? { expertRating: rating } : {}),
    expertSources: tierSourcesByPartId.get(part.id) ?? [],
  }
}

function resolveRatchet(slots: ComboSlots, parts: Part[]): Part | undefined {
  return parts.find((part) => part.id === slots.ratchetId)
}

function resolveBlade(slots: ComboSlots, parts: Part[]): Part | undefined {
  return parts.find((part) => part.id === (slots.bladeId ?? slots.mainBladeId))
}

function resolveBit(slots: ComboSlots, parts: Part[]): Part | undefined {
  return parts.find((part) => part.id === slots.bitId)
}

function hasIntegratedRatchet(slots: ComboSlots, parts: Part[]): boolean {
  return Boolean(resolveBlade(slots, parts)?.integratedRatchet || resolveBit(slots, parts)?.integratedRatchet)
}

function heightTimeline(a: ComboSlots, b: ComboSlots, parts: Part[]): PracticalComparison['heightTimelineZhTW'] {
  const ar = resolveRatchet(a, parts)
  const br = resolveRatchet(b, parts)
  const ab = resolveBlade(a, parts)
  const bb = resolveBlade(b, parts)
  const abit = resolveBit(a, parts)
  const bbit = resolveBit(b, parts)
  const aIntegrated = hasIntegratedRatchet(a, parts)
  const bIntegrated = hasIntegratedRatchet(b, parts)
  if (aIntegrated || bIntegrated) {
    const integratedSide = aIntegrated && bIntegrated ? 'A、B' : aIntegrated ? 'A' : 'B'
    return {
      opening: `${integratedSide} 是固鎖一體式結構，沒有獨立固鎖高度碼；不能把它當成「資料缺漏」，也不能直接和另一方的 60／70／80 高度碼對比。`,
      midgame: '改看一體式上蓋的接觸面、分離機構與雙方軸心的移動；只有同盤型逐局影片才能判定實際對位。',
      endgame: '一體式結構不以「沒有高度碼」補償成持久或穩定；後期仍以實測姿態與軸心狀態為準。',
    }
  }
  const ah = ar?.heightCode
  const bh = br?.heightCode
  if (typeof ah !== 'number' || typeof bh !== 'number') {
    return {
      opening: '固鎖高度資料不足；不對開局接觸作推論。',
      midgame: '需補齊完整零件資料與實戰來源後才可判讀。',
      endgame: '沒有高度資料時，不以持久或穩定作補償性假設。',
    }
  }
  const difference = Math.abs(ah - bh)
  const lower = ah < bh ? 'A' : ah > bh ? 'B' : '雙方'
  const higher = ah < bh ? 'B' : ah > bh ? 'A' : '雙方'
  const bladeContext = `${ab?.type ?? '未知'} 上蓋／${bb?.type ?? '未知'} 上蓋`
  const bitContext = `${abit?.bitContact ?? '未知'} 軸心／${bbit?.bitContact ?? '未知'} 軸心`
  if (difference === 0) return {
    opening: `同高度（${ah}）：不因高度偏向任一方，改看 ${bladeContext} 的接觸面與發射。`,
    midgame: `中段主要看 ${bitContext} 的移動、反作用與固鎖暴露。`,
    endgame: '後期以實際姿態、軸心與旋向為準；高度相同不代表續航相同。',
  }
  if (difference <= 10) return {
    opening: `${lower} 較低，但差距僅 ${difference}；屬相近高度，不宣稱低打高必然有效。`,
    midgame: `接觸能否成立取決於 ${bladeContext}、固鎖外形與 ${bitContext}。`,
    endgame: `${higher} 較高不自動等於後期較強；需有對局或實測證據才可下結論。`,
  }
  return {
    opening: `${lower} 較低、差距 ${difference}，可能較容易從下方建立接觸；這只是待驗證的開局假設。`,
    midgame: `中段需同時檢查 ${bladeContext} 與 ${bitContext}，避免把高度差誤當成固定剋制。`,
    endgame: `${higher} 的接觸位置與姿態可能改變低轉速互動，但不以高度直接給持久加分。`,
  }
}

function sameSlots(a: ComboSlots, b: ComboSlots): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  return [...keys].every((key) => a[key as keyof ComboSlots] === b[key as keyof ComboSlots])
}

function observedFor(a: ComboSlots, b: ComboSlots, observations: readonly MatchupObservation[]): MatchupObservation[] {
  return observations.filter((row) =>
    (sameSlots(row.a, a) && sameSlots(row.b, b)) || (sameSlots(row.a, b) && sameSlots(row.b, a)),
  )
}

function definedEntries(slots: ComboSlots): [string, string][] {
  return Object.entries(slots).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0)
}

function observationMatchesSlots(observation: TournamentObservation, slots: ComboSlots): boolean {
  const selected = definedEntries(slots)
  if (observation.slots) {
    const recorded = definedEntries(observation.slots)
    return recorded.length === selected.length && selected.every(([key, partId]) => observation.slots?.[key as keyof ComboSlots] === partId)
  }
  const standard = [slots.bladeId, slots.ratchetId, slots.bitId]
  return standard.every((partId): partId is string => Boolean(partId))
    && observation.comboPartIds?.length === standard.length
    && observation.comboPartIds.every((partId, index) => partId === standard[index]) === true
}

function bladeIdFor(slots: ComboSlots): string | undefined {
  return slots.bladeId ?? slots.mainBladeId
}

function observationUsesBlade(observation: TournamentObservation, bladeId: string): boolean {
  return observation.slots?.bladeId === bladeId || observation.slots?.mainBladeId === bladeId || observation.comboPartIds?.[0] === bladeId
}

function toTournamentRecord(observation: TournamentObservation, event: TournamentEvent, relation: TournamentPracticeRecord['relation']): TournamentPracticeRecord {
  return {
    id: observation.id,
    relation,
    reportedCombo: observation.reportedCombo,
    ...(observation.placement === undefined ? {} : { placement: observation.placement }),
    eventNameZhTW: event.name,
    eventDate: event.date,
    ...(event.participantCount === undefined ? {} : { participantCount: event.participantCount }),
    sourceUrl: observation.sourceUrl || event.sourceUrl,
  }
}

function newestFirst(a: TournamentPracticeRecord, b: TournamentPracticeRecord): number {
  const byDate = b.eventDate.localeCompare(a.eventDate)
  if (byDate !== 0) return byDate
  return (a.placement ?? Number.MAX_SAFE_INTEGER) - (b.placement ?? Number.MAX_SAFE_INTEGER)
}

function tournamentEvidenceFor(args: {
  slots: ComboSlots
  events: readonly TournamentEvent[]
  observations: readonly TournamentObservation[]
}): TournamentPracticeEvidence {
  const eventById = new Map(args.events.map((event) => [event.id, event]))
  const rows = args.observations.flatMap((observation) => {
    const event = eventById.get(observation.eventId)
    return event ? [{ observation, event }] : []
  })
  const exact = rows
    .filter(({ observation }) => observationMatchesSlots(observation, args.slots))
    .map(({ observation, event }) => toTournamentRecord(observation, event, 'exact'))
    .sort(newestFirst)
  const bladeId = bladeIdFor(args.slots)
  const sameBladeAlternatives = bladeId === undefined ? [] : rows
    .filter(({ observation }) => observationUsesBlade(observation, bladeId) && !observationMatchesSlots(observation, args.slots))
    .map(({ observation, event }) => toTournamentRecord(observation, event, 'same_blade'))
    .sort(newestFirst)
    .slice(0, 6)
  return { exact, sameBladeAlternatives }
}

export function buildPracticalComparison(args: {
  a: ComboSlots
  b: ComboSlots
  parts: Part[]
  observations?: readonly MatchupObservation[]
  tournamentEvents?: readonly TournamentEvent[]
  tournamentObservations?: readonly TournamentObservation[]
}): PracticalComparison {
  const ratings = [...getExpertPartRatings(args.a), ...getExpertPartRatings(args.b)]
  const ratingsByPartId = new Map(ratings.map((rating) => [rating.partId, rating]))
  const expertEvidence = [...getExpertTierMatches(args.a), ...getExpertTierMatches(args.b)]
  const tierSourcesByPartId = new Map<string, ReturnType<typeof getExpertTierMatches>>()
  for (const evidence of expertEvidence) {
    const current = tierSourcesByPartId.get(evidence.partId) ?? []
    if (!current.some((row) => row.sourceUrl === evidence.sourceUrl && row.partId === evidence.partId)) current.push(evidence)
    tierSourcesByPartId.set(evidence.partId, current)
  }
  const profilesA = selectedParts(args.a, args.parts).map((part) => profileFor(part, ratingsByPartId, tierSourcesByPartId))
  const profilesB = selectedParts(args.b, args.parts).map((part) => profileFor(part, ratingsByPartId, tierSourcesByPartId))
  const observed = observedFor(args.a, args.b, args.observations ?? matchupObservations)
  const observedSourceCount = new Set(observed.map((row) => row.sourceId)).size
  const observedAWins = observed.filter((row) => {
    const directOrder = sameSlots(row.a, args.a)
    return directOrder ? row.winner === 'a' : row.winner === 'b'
  }).length
  const observedBWins = observed.length - observedAWins
  const enoughObserved = observed.length >= 5 && observedSourceCount >= 2
  const tournamentArgs = { events: args.tournamentEvents ?? [], observations: args.tournamentObservations ?? [] }
  return {
    status: enoughObserved ? 'observed' : observed.length > 0 ? 'pending' : 'insufficient',
    titleZhTW: enoughObserved ? '已取得足夠完整對局，顯示實戰傾向' : '尚無足夠完整對局，不能宣稱實戰勝率',
    noticeZhTW: enoughObserved
      ? `已取得 ${observed.length} 局、${observedSourceCount} 個獨立原始來源；仍請展開來源確認賽制與盤型。`
      : `已列出全部已選零件的實戰檔案與社群來源。目前僅有 ${observed.length} 局、${observedSourceCount} 個獨立原始來源；現有賽事名次及 T 表不會被誤算成 A 對 B 的勝負。`,
    heightTimelineZhTW: heightTimeline(args.a, args.b, args.parts),
    profilesA,
    profilesB,
    tournamentA: tournamentEvidenceFor({ slots: args.a, ...tournamentArgs }),
    tournamentB: tournamentEvidenceFor({ slots: args.b, ...tournamentArgs }),
    expertEvidence,
    sources: practiceSources,
    observedRounds: observed.length,
    observedSourceCount,
    observedAWins,
    observedBWins,
  }
}
