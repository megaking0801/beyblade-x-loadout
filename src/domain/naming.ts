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

/**
 * 日文假名。第 1.4 節：前台不得以日文作為主要或副標名稱。
 *
 * 刻意排除 U+30FB「・」與 U+30A0，因為中文排版也會用全形中點當分隔符，
 * 把它當成日文會產生假警報。長音記號 U+30FC「ー」仍算日文。
 */
export const JAPANESE_KANA = /[\u3040-\u309f\u30a1-\u30fa\u30fc-\u30ff]/

/** 字串裡是否含日文假名（不含全形中點）。 */
export function hasJapaneseKana(text: string): boolean {
  return JAPANESE_KANA.test(text)
}

const KANA = JAPANESE_KANA

export interface PartLabel extends DisplayName {
  /**
   * 第 26 節：副標為型號／代號。
   *
   * 上蓋類零件的官方「代號」就是日文名稱本身，直接當副標會讓前台出現日文，
   * 違反第 1.4 節；主標已含型號時再顯示一次也只是重複。這兩種情況都回空字串，
   * 日文名稱只在詳細頁的次要名稱出現（第 5 節）。
   */
  subtitle: string
  familyZhTW: string
  plainDescriptionZhTW?: string
}

export function formatPartLabel(part: Part): PartLabel {
  const display = resolveDisplayName(part.naming)
  const code = part.code.trim()
  const showCode = code.length > 0 && !KANA.test(code) && !display.titleZhTW.includes(code)
  return {
    ...display,
    subtitle: showCode ? code : '',
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
