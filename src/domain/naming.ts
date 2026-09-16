/**
 * 名稱顯示規則（純函式）。
 *
 * 規格對照：第 5 節（命名規則）、第 6 節（UI 用語）、第 26 節（零件卡）、第 28 節（商品頁）。
 *
 * 鐵則：前台主標一律是台灣中文主名稱；英文、日文、海外名稱只能當次要名稱或搜尋別名。
 */
import {
  PART_FAMILY_ZH,
  PRODUCT_CATEGORY_ZH,
  type Naming,
  type Part,
  type Product,
} from './types.ts'

export interface DisplayName {
  titleZhTW: string
  /** 只在詳細頁顯示的次要名稱，順序為日文、英文、孩之寶名。 */
  secondaryNames: string[]
  isProvisional: boolean
  /** 暫譯時要顯示的標籤文字。 */
  provisionalLabelZhTW?: string
}

export const PROVISIONAL_LABEL = '暫譯'

export function resolveDisplayName(naming: Naming): DisplayName {
  const title = naming.primaryZhTW?.trim() ?? ''
  if (!title) throw new Error('缺少台灣中文主名稱')

  const secondaryNames = [naming.nameJa, naming.nameEn, naming.nameHasbro]
    .map((name) => name?.trim())
    .filter((name): name is string => Boolean(name))

  const isProvisional = naming.isProvisionalZhTW === true

  return {
    titleZhTW: title,
    secondaryNames,
    isProvisional,
    ...(isProvisional ? { provisionalLabelZhTW: PROVISIONAL_LABEL } : {}),
  }
}

export interface PartLabel extends DisplayName {
  /** 第 26 節：副標為型號／代號。 */
  subtitle: string
  familyZhTW: string
  plainDescriptionZhTW?: string
}

export function formatPartLabel(part: Part): PartLabel {
  return {
    ...resolveDisplayName(part.naming),
    subtitle: part.code,
    familyZhTW: PART_FAMILY_ZH[part.family],
    ...(part.plainDescriptionZhTW ? { plainDescriptionZhTW: part.plainDescriptionZhTW } : {}),
  }
}

export interface ProductLabel extends DisplayName {
  /** 第 28 節：優先顯示型號，沒有型號時退回分類中文。 */
  subtitle: string
  categoryZhTW: string
}

export function formatProductLabel(product: Product): ProductLabel {
  const categoryZhTW = PRODUCT_CATEGORY_ZH[product.category]
  return {
    ...resolveDisplayName(product.naming),
    subtitle: product.sku ?? categoryZhTW,
    categoryZhTW,
  }
}
