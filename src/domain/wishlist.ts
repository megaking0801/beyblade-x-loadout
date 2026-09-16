/**
 * 想買清單影響分析（純函式）。
 *
 * 規格對照：第 35 節（買這盒會新增什麼、可解鎖幾套配裝）、
 * 第 13 節（Random Booster 內容不確定）、第 1.5 節（不得把隨機內容當成必得）。
 */
import { generateBuildableCombos } from './builder.ts'
import { resolveDisplayName } from './naming.ts'
import type {
  CompatibilityRule,
  InventoryLot,
  Part,
  Product,
  ProductVariant,
  SavedCombo,
} from './types.ts'

export const RANDOM_UNCERTAINTY_NOTICE = '此商品為隨機內容，實際到手零件依開封結果而定'

export interface AddedPart {
  partId: string
  nameZhTW: string
  quantity: number
}

export interface PossibleVariant {
  variantId: string
  variantNameZhTW: string
  partNamesZhTW: string[]
}

export interface WishlistImpact {
  addedParts: AddedPart[]
  addedAccessories: { name: string; quantity: number }[]
  currentBuildableCount: number
  buildableCountAfterPurchase: number
  unlockedComboCount: number
  unlockedExamplesZhTW: string[]
  isUncertain: boolean
  uncertaintyNoticeZhTW?: string
  possibleVariants: PossibleVariant[]
}

export interface WishlistArgs {
  product: Product
  variants: ProductVariant[]
  parts: Part[]
  rules: CompatibilityRule[]
  lots: InventoryLot[]
  combos: SavedCombo[]
  quantity: number
}

export function analyzeWishlistProduct(args: WishlistArgs): WishlistImpact {
  const { product, variants, parts, rules, lots, combos, quantity } = args
  const byId = new Map(parts.map((part) => [part.id, part]))
  const nameOf = (partId: string): string => {
    const part = byId.get(partId)
    return part ? resolveDisplayName(part.naming).titleZhTW : partId
  }

  const productVariants = variants.filter((variant) => variant.productId === product.id)

  const addedParts: AddedPart[] = product.isRandom
    ? []
    : product.contents
        .filter((content) => content.partId)
        .map((content) => ({
          partId: content.partId as string,
          nameZhTW: nameOf(content.partId as string),
          quantity: content.quantity * Math.max(0, quantity),
        }))
        .filter((row) => row.quantity > 0)

  const addedAccessories = product.isRandom
    ? []
    : product.contents
        .filter((content) => content.accessoryName)
        .map((content) => ({
          name: content.accessoryName as string,
          quantity: content.quantity * Math.max(0, quantity),
        }))
        .filter((row) => row.quantity > 0)

  const before = generateBuildableCombos({ parts, rules, lots, combos, mode: 'owned' })

  const syntheticLots: InventoryLot[] = addedParts.map((row) => ({
    id: `wishlist:${product.id}:${row.partId}`,
    sourceType: 'manual_adjustment',
    partId: row.partId,
    quantity: row.quantity,
    status: 'available',
    condition: 'new',
    createdAt: '',
  }))

  const after = generateBuildableCombos({
    parts,
    rules,
    lots: [...lots, ...syntheticLots],
    combos,
    mode: 'owned',
  })

  const beforeCodes = new Set(before.map((row) => row.analysis.fullCode))
  const unlocked = after.filter((row) => !beforeCodes.has(row.analysis.fullCode))

  return {
    addedParts,
    addedAccessories,
    currentBuildableCount: before.length,
    buildableCountAfterPurchase: after.length,
    unlockedComboCount: unlocked.length,
    unlockedExamplesZhTW: unlocked.slice(0, 3).map((row) => row.analysis.fullNameZhTW),
    isUncertain: product.isRandom,
    ...(product.isRandom ? { uncertaintyNoticeZhTW: RANDOM_UNCERTAINTY_NOTICE } : {}),
    possibleVariants: productVariants.map((variant) => ({
      variantId: variant.id,
      variantNameZhTW: variant.variantNameZhTW,
      partNamesZhTW: variant.contents
        .filter((content) => content.partId)
        .map((content) => nameOf(content.partId as string)),
    })),
  }
}
