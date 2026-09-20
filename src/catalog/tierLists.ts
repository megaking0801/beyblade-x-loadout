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
 * 兩者不相加、不換算成分數，讓使用者自己對照。
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
