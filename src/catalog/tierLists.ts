import raw from './sources/beybladehub-tier-lists.json'
import type { ComboSlots } from '../domain/types.ts'

export interface ExpertTierMatch {
  listTitleZhTW: string
  authorZhTW: string
  updatedAt: string
  sourceUrl: string
  noteZhTW: string
  tierLabel: string
}

/** T 表只是一層獨立的專家意見，絕不餵進模型或賽事 evidence。 */
export function getExpertTierMatches(slots: ComboSlots): ExpertTierMatch[] {
  const bladeId = slots.bladeId
  if (!bladeId) return []
  return raw.lists.flatMap((list) =>
    list.entries.filter((entry) => entry.partId === bladeId).map((entry) => ({
      listTitleZhTW: list.titleZhTW,
      authorZhTW: list.authorZhTW,
      updatedAt: list.updatedAt,
      sourceUrl: list.sourceUrl,
      noteZhTW: list.noteZhTW,
      tierLabel: entry.tierLabel,
    })),
  )
}
