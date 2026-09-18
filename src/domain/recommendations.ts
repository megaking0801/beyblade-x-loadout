import { generateBuildableCombos, type BuildableCombo } from './builder.ts'
import { DEFAULT_DECK_RULES, suggestDecks } from './deck.ts'
import { resolveDisplayName } from './naming.ts'
import type { CompatibilityRule, InventoryLot, OwnedProduct, Part, Product, ProductVariant, SavedCombo } from './types.ts'

const CANDIDATE_LIMIT = 42

export interface PurchaseRecommendation {
  product: Product
  rank: number
  addedPartNamesZhTW: string[]
  unlockedExamplesZhTW: string[]
  reasonsZhTW: string[]
  deckScoreGain: number
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
}

function score(row: BuildableCombo): number {
  const value = row.analysis.scores
  if (!value) return 0
  return Math.round(value.attack * 0.2 + value.defense * 0.15 + value.stamina * 0.2 + value.burst * 0.15 + value.burstResistance * 0.15 + value.stability * 0.15)
}

function profile(args: { parts: Part[]; rules: CompatibilityRule[]; lots: InventoryLot[]; combos: SavedCombo[] }): StrengthProfile {
  const candidates = generateBuildableCombos({
    ...args,
    mode: 'owned',
    sortBy: 'strength',
    limit: CANDIDATE_LIMIT,
  })
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
  return {
    candidates,
    codes: new Set(candidates.map((row) => row.analysis.fullCode)),
    attack: maximum('attack'),
    stamina: maximum('stamina'),
    stability: maximum('stability'),
    overall: Math.max(0, ...candidates.map(score)),
    deckScore: deck?.score ?? 0,
  }
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
  limit?: number
}): PurchaseRecommendationResult {
  const { products, variants, ownedProducts, parts, rules, lots, combos, limit = 5 } = args
  const baseline = profile({ parts, rules, lots, combos })
  const partById = new Map(parts.map((part) => [part.id, part]))
  const ownedIds = new Set(ownedProducts.filter((row) => row.status !== 'sold').map((row) => row.productId))
  const recommendations: PurchaseRecommendation[] = []

  for (const product of products) {
    if (product.isRandom) continue
    const addedLots = syntheticLots(product)
    if (addedLots.length === 0) continue
    const after = profile({ parts, rules, lots: [...lots, ...addedLots], combos })
    const axisGains = {
      attack: Math.max(0, after.attack - baseline.attack),
      stamina: Math.max(0, after.stamina - baseline.stamina),
      stability: Math.max(0, after.stability - baseline.stability),
    }
    const overallStrengthGain = Math.max(0, after.overall - baseline.overall)
    const deckScoreGain = Math.max(0, after.deckScore - baseline.deckScore)
    const unlocked = after.candidates.filter((row) => !baseline.codes.has(row.analysis.fullCode))
    // Additional copies are useful only when they measurably improve a usable
    // profile (for example a valid 3on3 deck), not merely because the SKU exists.
    if (unlocked.length === 0 && overallStrengthGain === 0 && deckScoreGain === 0) continue
    const addedPartNamesZhTW = [...new Set(addedLots.map((lot) => partById.get(lot.partId)).filter((part): part is Part => Boolean(part)).map((part) => resolveDisplayName(part.naming).titleZhTW))]
    const reasonsZhTW: string[] = []
    if (deckScoreGain > 0) reasonsZhTW.push(`平衡 3on3 組合分數可提升 ${deckScoreGain}。`)
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
      overallStrengthGain,
      axisGains,
      isAdditionalCopy: ownedIds.has(product.id),
    })
  }

  recommendations.sort((a, b) =>
    b.deckScoreGain - a.deckScoreGain
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
