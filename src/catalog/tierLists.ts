import raw from './sources/beybladehub-tier-lists.json'
import type { ComboSlots, Part } from '../domain/types.ts'

export interface ExpertTierMatch {
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
      listTitleZhTW: list.titleZhTW,
      authorZhTW: list.authorZhTW,
      updatedAt: list.updatedAt,
      sourceUrl: list.sourceUrl,
      noteZhTW: list.noteZhTW,
      tierLabel: entry.tierLabel,
    })),
  )
}
