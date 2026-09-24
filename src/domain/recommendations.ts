import { generateBuildableCombos, type BuildableCombo } from './builder.ts'
import { DEFAULT_DECK_RULES, suggestDecks } from './deck.ts'
import { computeAvailabilityMap } from './inventory.ts'
import { resolveDisplayName } from './naming.ts'
import type { ExpertPartRatingRank } from '../catalog/tierLists.ts'
import type { PartStrengthEntry } from '../catalog/partStrength.ts'
import type { EvidenceInput } from './analysis.ts'
import type { CompatibilityRule, InventoryLot, OwnedProduct, Part, Product, ProductVariant, SavedCombo } from './types.ts'

const CANDIDATE_LIMIT = 42
const PROFILE_CACHE_LIMIT = 240
const profileCache = new Map<string, StrengthProfile>()

export interface PurchaseRecommendation {
  product: Product
  rank: number
  addedPartNamesZhTW: string[]
  unlockedExamplesZhTW: string[]
  reasonsZhTW: string[]
  deckScoreGain: number
  /**
   * 買後可組出的最佳平衡 3on3，其完整配置的賽事證據百分位加總（0~100 一筆，
   * 不是原始出場筆數）——不同證據來源樣本量級差很多，用百分位才能安全比較，
   * 見 `competitiveMeta.ts` 的 `computePercentiles()`。
   */
  competitiveEvidenceGain: number
  /**
   * 這次購買新增零件的高手評級加總（X=3／SS=2／S=1，只算 BeybladeHub「高手零件
   * 評級」X/SS/S 三級，不含另一套 T 表系統）。這是社群主觀意見，不是賽事證據，
   * 排序上刻意排在 `competitiveEvidenceGain` 之後、`deckScoreGain` 之前。
   */
  expertTierGain: number
  /**
   * 這次購買「真正讓使用者新增可用」的零件（買之前 free 數量為 0，見
   * `computeAvailabilityMap`），在賽果紀錄裡的歷史戰績分數平均（零件層級
   * 百分位聚合，跟 `deck.ts` 的 `estimateComboPartStrength()` 同一套平均，
   * 不是加總——加總會讓零件數多的商品系統性贏過零件強、但只有一兩顆的商品，
   * 也會讓「使用者已經擁有這些零件」的商品錯誤算出正分，第 50 節）。是統計
   * 聚合不是賽事證據本身，排序上排在 `expertTierGain` 之後、`deckScoreGain`
   * 之前——比高手主觀評級更客觀（是計數不是意見），但比 `competitiveEvidenceGain`
   * 弱得多（那是完整配置被賽事記錄過，這只是零件拼湊推估）。
   */
  partStrengthGain: number
  axisGains: { attack: number; stamina: number; stability: number }
  isAdditionalCopy: boolean
}

export interface RandomPurchaseCandidate {
  product: Product
  possiblePartNamesZhTW: string[]
}

export interface PurchaseRecommendationResult {
  recommendations: PurchaseRecommendation[]
  randomProducts: RandomPurchaseCandidate[]
}

interface StrengthProfile {
  candidates: BuildableCombo[]
  codes: Set<string>
  attack: number
  stamina: number
  stability: number
  deckScore: number
  competitiveEvidence: number
}

function profileCacheKey(args: {
  lots: InventoryLot[]
  combos: SavedCombo[]
  evidenceByCode?: Record<string, EvidenceInput>
}): string {
  const lots = args.lots
    .map((lot) => `${lot.partId}:${lot.quantity}:${lot.status}`)
    .sort()
    .join('|')
  const combos = args.combos.map((combo) => combo.id).sort().join('|')
  const evidence = Object.keys(args.evidenceByCode ?? {}).sort().join('|')
  return `${lots}#${combos}#${evidence}`
}

function profile(args: { parts: Part[]; rules: CompatibilityRule[]; lots: InventoryLot[]; combos: SavedCombo[]; evidenceByCode?: Record<string, EvidenceInput> }): StrengthProfile {
  const cacheKey = profileCacheKey(args)
  const cached = profileCache.get(cacheKey)
  if (cached) return cached
  const base = { ...args, mode: 'owned' as const, limit: CANDIDATE_LIMIT }
  // 競技優先：完整配置的證據候選先進池，再以新手難度候選補足尚未被賽事收錄的
  // 新組合（原本用「整體強度」候選補足，已下線——第 50.5 節：整體強度加總系統性
  // 偏向防守型、不可信；新手難度候選不依賴六軸假精度）。
  const candidates = [
    ...generateBuildableCombos({ ...base, sortBy: 'evidence' }),
    ...generateBuildableCombos({ ...base, sortBy: 'beginner' }),
  ].filter((row, index, rows) => rows.findIndex((candidate) => candidate.analysis.fullCode === row.analysis.fullCode) === index)
  const maximum = (axis: 'attack' | 'stamina' | 'stability') => Math.max(0, ...candidates.map((row) => row.analysis.scores?.[axis] ?? 0))
  const deck = suggestDecks({
    candidates,
    parts: args.parts,
    lots: args.lots,
    combos: args.combos,
    ruleSet: DEFAULT_DECK_RULES,
    strategy: 'balanced',
    limit: 1,
    candidateCap: CANDIDATE_LIMIT,
    evidenceByCode: args.evidenceByCode,
  })[0]
  const result = {
    candidates,
    codes: new Set(candidates.map((row) => row.analysis.fullCode)),
    attack: maximum('attack'),
    stamina: maximum('stamina'),
    stability: maximum('stability'),
    // deck.ts 的 scoreDeck() 現在真的會把證據的 log2 加成算進去（之前這個加成
    // 一直是 0，見 evidenceByCode 傳遞的修正），分數會帶一長串小數；這裡是
    // 使用者看得到的「分數可提升 +N」文字用到的值，要整數化才不會把浮點數
    // 雜訊直接顯示出來。deck.ts 內部排序用的 `.score` 本身不動，只在這裡
    // 顯示前四捨五入。
    deckScore: Math.round(deck?.score ?? 0),
    // 用 percentileScore（配置在自己來源分布裡的百分位，0~100）加總，不是原始
    // appearances 筆數——不同證據來源（台灣本地個位數 vs 社群站台上萬筆）量級
    // 差太多，直接加總筆數會讓大站台系統性蓋過本地真實賽果，見
    // `competitiveMeta.ts` 的 `computePercentiles()` 註解。
    competitiveEvidence:
      deck?.validation.members.reduce((sum, member) => sum + (member.analysis.evidence?.percentileScore ?? 0), 0) ?? 0,
  }
  if (profileCache.size >= PROFILE_CACHE_LIMIT) profileCache.clear()
  profileCache.set(cacheKey, result)
  return result
}

/**
 * 賽事優先的購買推薦不能每次都把所有商品做昂貴的 3on3 枚舉。
 * 先保留「能補進已知完整競技配置」的固定商品；這不是依價格或零件數排序，
 * 而是用完整配置的可追溯證據縮小模擬集合。沒有證據的新品仍可在配裝器／3on3
 * 的結構候選中出現，只是不會被首頁硬推成下一包。
 */
function isCompetitionRelevantProduct(
  product: Product,
  parts: Part[],
  evidenceByCode: Record<string, EvidenceInput> | undefined,
): boolean {
  if (!evidenceByCode || Object.keys(evidenceByCode).length === 0) return false
  const relevantCodes = Object.keys(evidenceByCode)
  const byId = new Map(parts.map((part) => [part.id, part]))
  return product.contents.some((content) => {
    const code = content.partId ? byId.get(content.partId)?.code : undefined
    return Boolean(code && relevantCodes.some((comboCode) => comboCode.includes(code)))
  })
}

function syntheticLots(product: Product): InventoryLot[] {
  return product.contents.flatMap((content) => content.partId && content.quantity > 0 ? [{
    id: `recommendation:${product.id}:${content.partId}`,
    sourceType: 'manual_adjustment' as const,
    partId: content.partId,
    quantity: content.quantity,
    status: 'available' as const,
    condition: 'new' as const,
    createdAt: '',
  }] : [])
}

/**
 * Simulate one guaranteed-content product against the current usable inventory.
 * Random products deliberately stay outside the ordering because their contents
 * cannot be guaranteed by a single purchase.
 */
export function recommendNextProducts(args: {
  products: Product[]
  variants: ProductVariant[]
  ownedProducts: OwnedProduct[]
  parts: Part[]
  rules: CompatibilityRule[]
  lots: InventoryLot[]
  combos: SavedCombo[]
  /** 台灣完整牌組優先、全球完整配置補樣本的證據索引。 */
  evidenceByCode?: Record<string, EvidenceInput>
  /** BeybladeHub 高手零件評級（X/SS/S），partId 索引，見 `catalog/tierLists.ts`。 */
  expertTierByPartId?: Map<string, ExpertPartRatingRank>
  /** 零件層級賽果聲量聚合，見 `catalog/partStrength.ts` 的 `getPartStrengthIndex()`；第 50 節。 */
  partStrengthIndex?: Map<string, PartStrengthEntry>
  limit?: number
}): PurchaseRecommendationResult {
  const { products, variants, ownedProducts, parts, rules, lots, combos, evidenceByCode, expertTierByPartId, partStrengthIndex, limit = 5 } = args
  const baseline = profile({ parts, rules, lots, combos, evidenceByCode })
  const partById = new Map(parts.map((part) => [part.id, part]))
  const ownedIds = new Set(ownedProducts.filter((row) => row.status !== 'sold').map((row) => row.productId))
  const recommendations: PurchaseRecommendation[] = []
  // 買之前（不含這次要模擬購買的商品）的可用餘額，用來判斷 addedPartIds 裡
  // 哪些零件是「買了才真的從 0 變成有」，不是「反正商品裡有，不管有沒有已經
  // 擁有都算」——見 partStrengthGain 的 docstring。
  const availabilityBeforePurchase = computeAvailabilityMap(lots, combos)

  const evaluableProducts = products.filter(
    (product) => !product.isRandom && isCompetitionRelevantProduct(product, parts, evidenceByCode),
  )
  for (const product of evaluableProducts) {
    const addedLots = syntheticLots(product)
    if (addedLots.length === 0) continue
    const after = profile({ parts, rules, lots: [...lots, ...addedLots], combos, evidenceByCode })
    const axisGains = {
      attack: Math.max(0, after.attack - baseline.attack),
      stamina: Math.max(0, after.stamina - baseline.stamina),
      stability: Math.max(0, after.stability - baseline.stability),
    }
    const deckScoreGain = Math.max(0, after.deckScore - baseline.deckScore)
    const competitiveEvidenceGain = Math.max(0, after.competitiveEvidence - baseline.competitiveEvidence)
    const unlocked = after.candidates.filter((row) => !baseline.codes.has(row.analysis.fullCode))
    const addedPartIds = [...new Set(addedLots.map((lot) => lot.partId))]
    const ratedAddedParts = addedPartIds
      .map((partId) => ({ part: partById.get(partId), rating: expertTierByPartId?.get(partId) }))
      .filter((row): row is { part: Part; rating: ExpertPartRatingRank } => Boolean(row.part) && Boolean(row.rating))
    const expertTierGain = ratedAddedParts.reduce((sum, row) => sum + row.rating.rank, 0)
    // 只算買之前 free 數量為 0 的零件——已經擁有／已可用的零件不算「這次購買
    // 帶來的邊際貢獻」，否則幾乎任何商品都會有非零 partStrengthGain，把「沒有
    // 任何收穫就丟掉」的篩選整個廢掉（第 50 節，最終審查 Finding 1）。
    const newlyAvailablePartIds = addedPartIds.filter(
      (partId) => (availabilityBeforePurchase.get(partId)?.free ?? 0) === 0,
    )
    const partStrengthAddedParts = newlyAvailablePartIds
      .map((partId) => ({ part: partById.get(partId), strength: partStrengthIndex?.get(partId) }))
      .filter((row): row is { part: Part; strength: PartStrengthEntry } => Boolean(row.part) && Boolean(row.strength))
    // 用平均不用加總，跟 `deck.ts` 的 `estimateComboPartStrength()` 同一套聚合
    // 方式——零件數多的商品不該只因為零件多就自動贏過零件強但數量少的商品。
    const partStrengthGain =
      partStrengthAddedParts.length > 0
        ? partStrengthAddedParts.reduce((sum, row) => sum + row.strength.percentileScore, 0) / partStrengthAddedParts.length
        : 0
    // 「下一包」原則上要形成更好的競技隊伍、新增賽事出場數或高手評級零件；
    // 三者都沒有時，退回「廣度」：這次購買有沒有解鎖目前湊不出來的合法配置。
    // 收藏夠豐富後前三個訊號會自然枯竭（deckScoreGain 很難再被單一新商品拉動），
    // 只靠前三者當唯一判斷標準會讓工具整批沉默；四個訊號都是 0 才真的丟掉。
    const isPureBreadth = deckScoreGain === 0 && competitiveEvidenceGain === 0 && expertTierGain === 0 && partStrengthGain === 0 && unlocked.length > 0
    if (deckScoreGain === 0 && competitiveEvidenceGain === 0 && expertTierGain === 0 && partStrengthGain === 0 && unlocked.length === 0) continue
    const addedPartNamesZhTW = [...new Set(addedLots.map((lot) => partById.get(lot.partId)).filter((part): part is Part => Boolean(part)).map((part) => resolveDisplayName(part.naming).titleZhTW))]
    const reasonsZhTW: string[] = []
    if (deckScoreGain > 0) reasonsZhTW.push(`平衡 3on3 組合分數可提升 ${deckScoreGain}。`)
    if (competitiveEvidenceGain > 0) reasonsZhTW.push(`新隊伍的完整配置賽事證據排名提升（百分位 +${competitiveEvidenceGain}）。`)
    if (ratedAddedParts.length > 0) {
      const detail = ratedAddedParts
        .map((row) => `${resolveDisplayName(row.part.naming).titleZhTW}（${row.rating.tierLabel} 級，${row.rating.expertCount} 位中 ${row.rating.agreeCount} 位認同）`)
        .join('、')
      reasonsZhTW.push(`高手評級（社群意見，非賽事戰績）：${detail}。`)
    }
    if (partStrengthAddedParts.length > 0) {
      const detail = partStrengthAddedParts
        .map((row) => `${resolveDisplayName(row.part.naming).titleZhTW}（進前三 ${row.strength.podiumAppearances} 次，百分位 ${row.strength.percentileScore}）`)
        .join('、')
      reasonsZhTW.push(`零件歷史戰績推估（非完整配置實測）：${detail}。`)
    }
    const roleGains = [
      axisGains.attack > 0 ? `攻擊峰值 +${axisGains.attack}` : '',
      axisGains.stamina > 0 ? `持久峰值 +${axisGains.stamina}` : '',
      axisGains.stability > 0 ? `穩定峰值 +${axisGains.stability}` : '',
    ].filter(Boolean)
    if (roleGains.length > 0) reasonsZhTW.push(`補強角色：${roleGains.join('、')}。`)
    if (unlocked.length > 0) reasonsZhTW.push(`新增主力候選：${unlocked.slice(0, 2).map((row) => row.analysis.fullNameZhTW).join('、')}。`)
    if (isPureBreadth) {
      reasonsZhTW.push(
        `不會拉高目前最強隊伍分數，但新增 ${unlocked.length} 種目前湊不出來的合法配置，` +
          '供擴大配裝廣度參考（尚未有賽事出場或高手評級佐證）。',
      )
    }
    if (ownedIds.has(product.id)) reasonsZhTW.push('你已擁有此商品；本次建議只因模擬後可提升可用配置或 3on3。')
    recommendations.push({
      product,
      rank: 0,
      addedPartNamesZhTW,
      unlockedExamplesZhTW: unlocked.slice(0, 3).map((row) => row.analysis.fullNameZhTW),
      reasonsZhTW,
      deckScoreGain,
      competitiveEvidenceGain,
      expertTierGain,
      partStrengthGain,
      axisGains,
      isAdditionalCopy: ownedIds.has(product.id),
    })
  }

  recommendations.sort((a, b) =>
    b.competitiveEvidenceGain - a.competitiveEvidenceGain
    || b.expertTierGain - a.expertTierGain
    || b.partStrengthGain - a.partStrengthGain
    || b.deckScoreGain - a.deckScoreGain
    || (b.axisGains.attack + b.axisGains.stamina + b.axisGains.stability) - (a.axisGains.attack + a.axisGains.stamina + a.axisGains.stability)
    || b.unlockedExamplesZhTW.length - a.unlockedExamplesZhTW.length
    || (a.product.sku ?? a.product.id).localeCompare(b.product.sku ?? b.product.id),
  )
  const ranked = recommendations.slice(0, limit).map((row, index) => ({ ...row, rank: index + 1 }))

  const ownedPartIds = new Set(lots.filter((lot) => lot.status === 'available' && lot.quantity > 0).map((lot) => lot.partId))
  const randomProducts = products.filter((product) => product.isRandom).map((product) => {
    const possiblePartNamesZhTW = [...new Set(variants.filter((variant) => variant.productId === product.id).flatMap((variant) => variant.contents)
      .filter((content) => content.partId && !ownedPartIds.has(content.partId))
      .map((content) => partById.get(content.partId as string))
      .filter((part): part is Part => Boolean(part))
      .map((part) => resolveDisplayName(part.naming).titleZhTW))].slice(0, 5)
    return { product, possiblePartNamesZhTW }
  }).filter((row) => row.possiblePartNamesZhTW.length > 0)

  return { recommendations: ranked, randomProducts }
}
