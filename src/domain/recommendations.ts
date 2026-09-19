import { generateBuildableCombos, type BuildableCombo } from './builder.ts'
import { DEFAULT_DECK_RULES, suggestDecks } from './deck.ts'
import { resolveDisplayName } from './naming.ts'
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
  /** 買後可組出的最佳平衡 3on3，其完整配置合計有多少筆賽事出現。 */
  competitiveEvidenceGain: number
  overallStrengthGain: number
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
  overall: number
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

function score(row: BuildableCombo): number {
  const value = row.analysis.scores
  if (!value) return 0
  return Math.round(value.attack * 0.2 + value.defense * 0.15 + value.stamina * 0.2 + value.burst * 0.15 + value.burstResistance * 0.15 + value.stability * 0.15)
}

function profile(args: { parts: Part[]; rules: CompatibilityRule[]; lots: InventoryLot[]; combos: SavedCombo[]; evidenceByCode?: Record<string, EvidenceInput> }): StrengthProfile {
  const cacheKey = profileCacheKey(args)
  const cached = profileCache.get(cacheKey)
  if (cached) return cached
  const base = { ...args, mode: 'owned' as const, limit: CANDIDATE_LIMIT }
  // 競技優先：完整配置的證據候選先進池，再以強度候選補足尚未被賽事收錄的新組合。
  const candidates = [
    ...generateBuildableCombos({ ...base, sortBy: 'evidence' }),
    ...generateBuildableCombos({ ...base, sortBy: 'strength' }),
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
  })[0]
  const result = {
    candidates,
    codes: new Set(candidates.map((row) => row.analysis.fullCode)),
    attack: maximum('attack'),
    stamina: maximum('stamina'),
    stability: maximum('stability'),
    overall: Math.max(0, ...candidates.map(score)),
    deckScore: deck?.score ?? 0,
    competitiveEvidence: deck?.validation.members.reduce((sum, member) => sum + (member.analysis.evidence?.appearances ?? 0), 0) ?? 0,
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
  limit?: number
}): PurchaseRecommendationResult {
  const { products, variants, ownedProducts, parts, rules, lots, combos, evidenceByCode, limit = 5 } = args
  const baseline = profile({ parts, rules, lots, combos, evidenceByCode })
  const partById = new Map(parts.map((part) => [part.id, part]))
  const ownedIds = new Set(ownedProducts.filter((row) => row.status !== 'sold').map((row) => row.productId))
  const recommendations: PurchaseRecommendation[] = []

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
    const overallStrengthGain = Math.max(0, after.overall - baseline.overall)
    const deckScoreGain = Math.max(0, after.deckScore - baseline.deckScore)
    const competitiveEvidenceGain = Math.max(0, after.competitiveEvidence - baseline.competitiveEvidence)
    const unlocked = after.candidates.filter((row) => !baseline.codes.has(row.analysis.fullCode))
    // Additional copies are useful only when they measurably improve a usable
    // profile (for example a valid 3on3 deck), not merely because the SKU exists.
    // 「下一包」必須形成更好的競技隊伍或新增完整配置候選；單純多一個
    // 六軸峰值但沒有隊伍改善，不該被稱為比賽向購買推薦。
    if (deckScoreGain === 0 && competitiveEvidenceGain === 0) continue
    const addedPartNamesZhTW = [...new Set(addedLots.map((lot) => partById.get(lot.partId)).filter((part): part is Part => Boolean(part)).map((part) => resolveDisplayName(part.naming).titleZhTW))]
    const reasonsZhTW: string[] = []
    if (deckScoreGain > 0) reasonsZhTW.push(`平衡 3on3 組合分數可提升 ${deckScoreGain}。`)
    if (competitiveEvidenceGain > 0) reasonsZhTW.push(`新隊伍的完整配置賽事出現數 +${competitiveEvidenceGain}。`)
    const roleGains = [
      axisGains.attack > 0 ? `攻擊峰值 +${axisGains.attack}` : '',
      axisGains.stamina > 0 ? `持久峰值 +${axisGains.stamina}` : '',
      axisGains.stability > 0 ? `穩定峰值 +${axisGains.stability}` : '',
    ].filter(Boolean)
    if (roleGains.length > 0) reasonsZhTW.push(`補強角色：${roleGains.join('、')}。`)
    if (overallStrengthGain > 0) reasonsZhTW.push(`可用配裝的整體強度峰值 +${overallStrengthGain}。`)
    if (unlocked.length > 0) reasonsZhTW.push(`新增主力候選：${unlocked.slice(0, 2).map((row) => row.analysis.fullNameZhTW).join('、')}。`)
    if (ownedIds.has(product.id)) reasonsZhTW.push('你已擁有此商品；本次建議只因模擬後可提升可用配置或 3on3。')
    recommendations.push({
      product,
      rank: 0,
      addedPartNamesZhTW,
      unlockedExamplesZhTW: unlocked.slice(0, 3).map((row) => row.analysis.fullNameZhTW),
      reasonsZhTW,
      deckScoreGain,
      competitiveEvidenceGain,
      overallStrengthGain,
      axisGains,
      isAdditionalCopy: ownedIds.has(product.id),
    })
  }

  recommendations.sort((a, b) =>
    b.competitiveEvidenceGain - a.competitiveEvidenceGain
    || b.deckScoreGain - a.deckScoreGain
    || b.overallStrengthGain - a.overallStrengthGain
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
