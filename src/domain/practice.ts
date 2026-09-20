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
  linkLabelZhTW: string
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
    linkLabelZhTW: '開啟阿土的 YouTube 影片',
    sourceUrl: 'https://www.youtube.com/watch?v=s_hTcLMUstA',
    updatedAt: '2026-01-02',
    independence: 'primary',
    noteZhTW: '用於人工摘錄配置與實測觀察；沒有辨識雙方完整配置與結果時不計入對戰勝負。',
  },
  {
    id: 'weichen-battle',
    nameZhTW: '維辰孔丘',
    kindZhTW: '實戰影片',
    linkLabelZhTW: '開啟維辰孔丘的 YouTube 影片',
    sourceUrl: 'https://www.youtube.com/watch?v=1Rl0dEh3Xkg',
    updatedAt: '2024-12-07',
    independence: 'primary',
    noteZhTW: '用於人工摘錄可辨識的對局；舊環境內容會保留日期，不套用到新零件。',
  },
  {
    id: 'tw-tier',
    nameZhTW: '台灣天梯情報站',
    kindZhTW: '社群彙整',
    linkLabelZhTW: '開啟台灣天梯情報站',
    sourceUrl: 'https://stan-yao.github.io/beyblade_x_tier/',
    updatedAt: '2026-09-15',
    independence: 'curated',
    noteZhTW: '彙整阿土、RENLIgames 等評估，只作來源索引與共識提示。',
  },
  {
    id: 'hub-tournaments',
    nameZhTW: 'BeybladeHub 台灣賽事資料',
    kindZhTW: '賽果／配置彙整',
    linkLabelZhTW: '開啟 BeybladeHub 賽事資料',
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
  const specs = [
    part.type ? `類型 ${part.type === 'attack' ? '攻擊' : part.type === 'defense' ? '防守' : part.type === 'stamina' ? '持久' : '平衡'}` : undefined,
    typeof part.heightCode === 'number' ? `高度碼 ${part.heightCode}` : undefined,
    part.bitContact ? `接觸形狀 ${part.bitContact}` : undefined,
    typeof part.officialWeightG === 'number' ? `官方重量 ${part.officialWeightG}g` : undefined,
    part.integratedRatchet ? '固鎖一體式結構' : undefined,
  ].filter((value): value is string => Boolean(value))
  return {
    partId: part.id,
    partNameZhTW: name,
    familyZhTW: FAMILY_ZH[part.family],
    status: covered ? 'covered' : 'limited',
    summaryZhTW: specs.length > 0
      ? `可核對規格：${specs.join('；')}。`
      : '目前只有零件身分與來源可核對，沒有可單獨歸因的實戰數據。',
    cautionsZhTW: [
      ...(covered ? ['已有高手評級來源；這是選手／社群觀察，不是此零件對任何對手的勝率。'] : ['尚缺可歸因的高手評級；不會借用同類型熱門零件的結論。']),
      ...(part.family === 'ratchet' ? ['固鎖高度碼只描述結構高度；還要看凸點暴露、上蓋接觸面與軸心路線。'] : []),
      ...(part.family === 'bit' ? ['軸心效果強烈受發射與盤型影響；沒有完整對局影片時不歸因成固定剋制。'] : []),
      ...(part.integratedRatchet ? ['一體式結構沒有獨立固鎖高度碼，不能硬換算成 60／70／80。'] : []),
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
      opening: `可確認：${integratedSide} 是固鎖一體式結構，沒有獨立固鎖高度碼。不能把它寫成「高度 0」，也不能直接和另一方的 60／70／80 對位。`,
      midgame: '不能確認：中段接觸高低仍需要同一盤型影片。一體式上蓋的接觸面、分離機構與軸心移動，不能由名稱代替。',
      endgame: '不能推論：一體式不等於後期一定更穩或更持久；沒有完整對局時不替任何一方加分。',
    }
  }
  const ah = ar?.heightCode
  const bh = br?.heightCode
  if (typeof ah !== 'number' || typeof bh !== 'number') {
    return {
      opening: '可確認：其中一方沒有可用的固鎖高度碼，因此不對開局接觸高度下結論。',
      midgame: '不能確認：需有完整配置、盤型與影片，才能判讀接觸軌跡。',
      endgame: '不能推論：不會以持久或穩定替高度資料做補償性猜測。',
    }
  }
  const difference = Math.abs(ah - bh)
  const lower = ah < bh ? 'A' : ah > bh ? 'B' : '雙方'
  const higher = ah < bh ? 'B' : ah > bh ? 'A' : '雙方'
  const bladeContext = `${ab?.type ?? '未知'} 上蓋／${bb?.type ?? '未知'} 上蓋`
  const bitContext = `${abit?.bitContact ?? '未知'} 軸心／${bbit?.bitContact ?? '未知'} 軸心`
  if (difference === 0) return {
    opening: `可確認：雙方同高度（${ah}）；不因高度偏向任何一方。接觸由 ${bladeContext} 的形狀與發射路徑決定。`,
    midgame: `不能確認：中段要看 ${bitContext} 的移動、反作用與固鎖暴露；同高度不等於同表現。`,
    endgame: '不能推論：同高度不等於持久或穩定相同，必須以實際低轉速片段驗證。',
  }
  if (difference <= 10) return {
    opening: `可確認：${lower} 較低 ${difference}（${ah} 對 ${bh}），但屬相近高度。像 70 對 80，不宣稱低打高必然有效。`,
    midgame: `不能確認：接觸線是否改變，要看 ${bladeContext}、固鎖外形與 ${bitContext}；高度碼差 10 本身不足以判勝負。`,
    endgame: `不能推論：${higher} 較高不等於後期必然更穩或更持久；沒有同盤型對局時不加續航分。`,
  }
  return {
    opening: `可確認：${lower} 較低 ${difference}（${ah} 對 ${bh}），開局接觸線可能不同；但只有打得到對方下緣才有意義，不能宣稱固定剋制。`,
    midgame: `不能確認：中段仍需以 ${bladeContext} 與 ${bitContext} 的實際接觸驗證；上蓋形狀與軸心路線可能蓋過高度差。`,
    endgame: `不能推論：${higher} 較高可能改變低轉速姿態，但沒有對局影片時不把它自動換算成持久／穩定優勢。`,
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
