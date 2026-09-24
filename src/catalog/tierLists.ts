import raw from './sources/beybladehub-tier-lists.json'
import type { ComboSlots, Part } from '../domain/types.ts'

export interface ExpertTierMatch {
  partId: string
  listTitleZhTW: string
  authorZhTW: string
  updatedAt: string
  sourceUrl: string
  noteZhTW: string
  tierLabel: string
}

export interface ExpertTierListIssue {
  listId: string
  messageZhTW: string
}

export const expertTierListMeta = {
  source: raw.source,
  fetchedAt: raw.fetchedAt,
  listCount: raw.lists.length,
} as const

/**
 * T 表是手動策展資料，必須在測試中確認每個條目都能對到圖鑑零件，
 * 避免來源更新後前台安靜地失去評級。
 */
export function auditExpertTierLists(parts: readonly Pick<Part, 'id'>[]): ExpertTierListIssue[] {
  const partIds = new Set(parts.map((part) => part.id))
  const issues: ExpertTierListIssue[] = []

  for (const list of raw.lists) {
    if (!/^https:\/\/beybladehub\.app\/t\/[a-z0-9]+$/i.test(list.sourceUrl)) {
      issues.push({ listId: list.id, messageZhTW: '來源網址不是可追溯的 BeybladeHub T 表頁面' })
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(list.updatedAt)) {
      issues.push({ listId: list.id, messageZhTW: '更新日期格式不正確' })
    }
    for (const entry of list.entries) {
      if (!/^T\d+(?:\.\d+)?$/.test(entry.tierLabel)) {
        issues.push({ listId: list.id, messageZhTW: `評級格式不正確：${entry.tierLabel}` })
      }
      if (!partIds.has(entry.partId)) {
        issues.push({ listId: list.id, messageZhTW: `找不到對應零件：${entry.partId}` })
      }
    }
  }

  return issues
}

/** T 表只是一層獨立的專家意見，絕不餵進模型或賽事 evidence。 */
export function getExpertTierMatches(slots: ComboSlots): ExpertTierMatch[] {
  const selectedPartIds = new Set(Object.values(slots).filter((partId): partId is string => Boolean(partId)))
  if (selectedPartIds.size === 0) return []
  return raw.lists.flatMap((list) =>
    list.entries.filter((entry) => selectedPartIds.has(entry.partId)).map((entry) => ({
      partId: entry.partId,
      listTitleZhTW: list.titleZhTW,
      authorZhTW: list.authorZhTW,
      updatedAt: list.updatedAt,
      sourceUrl: list.sourceUrl,
      noteZhTW: list.noteZhTW,
      tierLabel: entry.tierLabel,
    })),
  )
}

/* ------------------------------------------------- 高手聚合評級（逐件） */

import ratingsRaw from './sources/beybladehub-tier-ratings.json'

export interface ExpertPartRating {
  partId: string
  labelZhTW: string
  tierLabel: string
  /** 幾位高手把這顆評在這一級。自帶樣本數，避免把一人意見說成共識。 */
  agreeCount: number
  expertCount: number
}

export const expertPartRatingMeta = {
  source: ratingsRaw.source,
  sourceUrl: ratingsRaw.sourceUrl,
  fetchedAt: ratingsRaw.fetchedAt,
  expertCount: ratingsRaw.expertCount,
  expertsZhTW: ratingsRaw.expertsZhTW,
  noteZhTW: ratingsRaw.note,
  ratingCount: ratingsRaw.ratings.length,
} as const

/**
 * 逐件評級也是策展資料，來源改版後可能對不到零件，
 * 必須由測試守住，不能讓前台安靜地少掉評級。
 */
export function auditExpertPartRatings(parts: readonly Pick<Part, 'id'>[]): ExpertTierListIssue[] {
  const partIds = new Set(parts.map((part) => part.id))
  const issues: ExpertTierListIssue[] = []
  for (const rating of ratingsRaw.ratings) {
    if (!partIds.has(rating.partId)) {
      issues.push({ listId: rating.partId, messageZhTW: `找不到對應零件：${rating.partId}` })
    }
    if (rating.agreeCount < 1 || rating.agreeCount > rating.expertCount) {
      issues.push({ listId: rating.partId, messageZhTW: `共識人數不合理：${rating.agreeCount}/${rating.expertCount}` })
    }
  }
  return issues
}

/**
 * 這套配裝用到的零件各自被高手評在哪一級。
 *
 * 與六軸評估刻意分開：六軸是本站的模型推估（講結構），這一層是人的主觀評級（講賽場）。
 * 兩者不相加、不換算成分數，讓使用者自己對照——這是配裝器畫面的顯示邏輯。
 * 購買推薦排序（`recommendations.ts`）是另一條使用者已核准的例外路徑，
 * 見下面 `getExpertPartRatingIndex()`。
 */
export function getExpertPartRatings(slots: ComboSlots): ExpertPartRating[] {
  const selected = new Set(Object.values(slots).filter((id): id is string => Boolean(id)))
  if (selected.size === 0) return []
  const seen = new Set<string>()
  return ratingsRaw.ratings
    .filter((rating) => selected.has(rating.partId))
    .filter((rating) => {
      const key = `${rating.partId}:${rating.tierLabel}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

/* ------------------------------------------------- 購買推薦用的數值化評級索引 */

/**
 * 只有這三級：來源頁面「高手零件評級」用 X／SS／S。
 *
 * `beybladehub-tier-ratings.json` 裡還混了 T1／T2（來源頁面另一套獨立的 T 表
 * 排行，跟 X/SS/S 不是同一套系統，強度換算關係未知），抓取時誤觸混進同一個
 * 陣列——這裡明確排除，不猜兩套系統的換算關係。
 */
const EXPERT_TIER_RANK: Record<string, number> = { X: 3, SS: 2, S: 1 }

export interface ExpertPartRatingRank {
  tierLabel: 'X' | 'SS' | 'S'
  rank: number
  agreeCount: number
  expertCount: number
}

let cachedExpertPartRatingIndex: Map<string, ExpertPartRatingRank> | undefined

/**
 * partId → 數值化高手評級，只收 X/SS/S。供購買推薦排序使用；
 * 一個零件在來源資料裡若有多筆評級，取分數最高的一筆。
 * 底層 `ratingsRaw` 是靜態匯入的 JSON，整個 App 生命週期不會變，快取只建一次即可。
 */
export function getExpertPartRatingIndex(): Map<string, ExpertPartRatingRank> {
  if (cachedExpertPartRatingIndex) return cachedExpertPartRatingIndex
  const index = new Map<string, ExpertPartRatingRank>()
  for (const rating of ratingsRaw.ratings) {
    const rank = EXPERT_TIER_RANK[rating.tierLabel]
    if (rank === undefined) continue
    const existing = index.get(rating.partId)
    if (existing && existing.rank >= rank) continue
    index.set(rating.partId, {
      tierLabel: rating.tierLabel as ExpertPartRatingRank['tierLabel'],
      rank,
      agreeCount: rating.agreeCount,
      expertCount: rating.expertCount,
    })
  }
  cachedExpertPartRatingIndex = index
  return index
}
