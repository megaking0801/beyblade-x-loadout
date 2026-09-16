/**
 * 搜尋（純函式）。
 *
 * 規格對照：第 40 節（搜尋支援所有別名）、第 45 節 Case 10（結果仍顯示台灣中文主名稱）。
 */
import { resolveDisplayName } from './naming.ts'
import type { Naming, Part, Product } from './types.ts'

export type SearchField =
  | 'primaryZhTW'
  | 'aliasesZhTW'
  | 'code'
  | 'nameJa'
  | 'nameEn'
  | 'nameHasbro'
  | 'nickname'

interface IndexEntry {
  field: SearchField
  value: string
}

/** 拉丁字母轉小寫；CJK 原樣保留。 */
function normalize(value: string): string {
  return value.trim().toLowerCase()
}

/** 去掉連字號、空白等符號，讓「9-60」也能用「960」搜到。 */
function compact(value: string): string {
  return normalize(value).replace(/[\s\-_./]/g, '')
}

function buildIndex(naming: Naming, code: string): IndexEntry[] {
  const raw: IndexEntry[] = [
    { field: 'primaryZhTW', value: naming.primaryZhTW ?? '' },
    ...(naming.aliasesZhTW ?? []).map((value) => ({ field: 'aliasesZhTW' as const, value })),
    { field: 'code', value: code },
    { field: 'nameJa', value: naming.nameJa ?? '' },
    { field: 'nameEn', value: naming.nameEn ?? '' },
    { field: 'nameHasbro', value: naming.nameHasbro ?? '' },
    ...(naming.nickname ?? []).map((value) => ({ field: 'nickname' as const, value })),
  ]

  const entries: IndexEntry[] = []
  const seen = new Set<string>()
  for (const entry of raw) {
    for (const value of [normalize(entry.value), compact(entry.value)]) {
      if (!value) continue
      const key = `${entry.field}:${value}`
      if (seen.has(key)) continue
      seen.add(key)
      entries.push({ field: entry.field, value })
    }
  }
  return entries
}

/** 回傳可供索引的所有字串，供測試與除錯使用。 */
export function buildSearchTokens(naming: Naming, code: string): string[] {
  const tokens: string[] = []
  for (const entry of buildIndex(naming, code)) {
    if (!tokens.includes(entry.value)) tokens.push(entry.value)
  }
  return tokens
}

const FIELD_PRIORITY: Record<SearchField, number> = {
  primaryZhTW: 0,
  aliasesZhTW: 1,
  code: 2,
  nameJa: 3,
  nameEn: 4,
  nameHasbro: 5,
  nickname: 6,
}

interface Scored {
  matchedOn: SearchField
  score: number
}

/** 分數越小越前面。完全相符 0、開頭相符 10、包含 20，再加上欄位優先序。 */
function scoreEntity(naming: Naming, code: string, query: string): Scored | null {
  const normalizedQuery = normalize(query)
  const compactQuery = compact(query)
  let best: Scored | null = null

  for (const entry of buildIndex(naming, code)) {
    for (const q of new Set([normalizedQuery, compactQuery])) {
      if (!q) continue
      let base: number | null = null
      if (entry.value === q) base = 0
      else if (entry.value.startsWith(q)) base = 10
      else if (entry.value.includes(q)) base = 20
      if (base === null) continue
      const score = base + FIELD_PRIORITY[entry.field]
      if (!best || score < best.score) best = { matchedOn: entry.field, score }
    }
  }
  return best
}

export interface PartSearchResult {
  part: Part
  displayTitleZhTW: string
  matchedOn: SearchField
}

export function searchParts(parts: Part[], query: string): PartSearchResult[] {
  if (!query.trim()) {
    return parts.map((part) => ({
      part,
      displayTitleZhTW: resolveDisplayName(part.naming).titleZhTW,
      matchedOn: 'primaryZhTW' as const,
    }))
  }

  return parts
    .map((part) => ({ part, scored: scoreEntity(part.naming, part.code, query) }))
    .filter((row): row is { part: Part; scored: Scored } => row.scored !== null)
    .sort((a, b) => a.scored.score - b.scored.score)
    .map(({ part, scored }) => ({
      part,
      displayTitleZhTW: resolveDisplayName(part.naming).titleZhTW,
      matchedOn: scored.matchedOn,
    }))
}

export interface ProductSearchResult {
  product: Product
  displayTitleZhTW: string
  matchedOn: SearchField
}

export function searchProducts(products: Product[], query: string): ProductSearchResult[] {
  if (!query.trim()) {
    return products.map((product) => ({
      product,
      displayTitleZhTW: resolveDisplayName(product.naming).titleZhTW,
      matchedOn: 'primaryZhTW' as const,
    }))
  }

  return products
    .map((product) => ({
      product,
      scored: scoreEntity(product.naming, product.sku ?? '', query),
    }))
    .filter((row): row is { product: Product; scored: Scored } => row.scored !== null)
    .sort((a, b) => a.scored.score - b.scored.score)
    .map(({ product, scored }) => ({
      product,
      displayTitleZhTW: resolveDisplayName(product.naming).titleZhTW,
      matchedOn: scored.matchedOn,
    }))
}
