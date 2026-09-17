/**
 * 來源標示（純函式）。
 *
 * 規格對照：第 41 節（來源與驗證狀態）、第 22 節（UI 必須可查看來源）、
 * 第 1.5 節（不得把社群數據講成官方數據）。
 *
 * 零件的「身分」（型號、名稱）來自官方商品頁，但類型／重量／旋向／軸心特性
 * 官方沒有公布，數值來自社群圖鑑的玩家實測。兩者來源不同，標籤也必須不同。
 */
import type { Part, VerificationStatus } from './types.ts'

export const VERIFICATION_STATUS_ZH: Record<VerificationStatus, string> = {
  official_verified: '官方已核對',
  multi_source_verified: '多來源核對',
  community_only: '社群實測',
  needs_review: '待查',
}

export interface StatSource {
  /** 加在欄位名稱後面的括號說明，例如「（社群實測）」。 */
  suffixZhTW: string
  /** true 表示數值本身有官方來源，可以稱為「官方數值」。 */
  isOfficial: boolean
  statusZhTW: string
  sourceUrls: string[]
  verifiedAt?: string
}

/**
 * 回傳零件數值欄位（類型／重量／旋向／軸心特性）的來源說明。
 * 沒有任何數值來源時回 null，呼叫端就顯示「官方未公布」。
 */
export function describeStatSource(part: Part): StatSource | null {
  const provenance = part.statsProvenance
  if (!provenance) return null
  const isOfficial =
    provenance.verificationStatus === 'official_verified' ||
    provenance.verificationStatus === 'multi_source_verified'
  const statusZhTW = VERIFICATION_STATUS_ZH[provenance.verificationStatus]
  return {
    suffixZhTW: `（${statusZhTW}）`,
    isOfficial,
    statusZhTW,
    sourceUrls: provenance.sourceUrls,
    ...(provenance.verifiedAt ? { verifiedAt: provenance.verifiedAt } : {}),
  }
}

/** 欄位標籤：有官方數值才叫「官方 X」，社群數值一律標社群。 */
export function statFieldLabel(part: Part, fieldZhTW: string): string {
  const source = describeStatSource(part)
  if (!source) return `官方${fieldZhTW}`
  if (source.isOfficial) return `官方${fieldZhTW}`
  return `${fieldZhTW}${source.suffixZhTW}`
}

/**
 * 一組零件裡，數值來源是否含非官方資料。
 * 用來在配裝結果上標示「重量與類型為社群彙整」。
 */
export function summarizeStatSources(parts: Part[]): {
  hasCommunityStats: boolean
  noticeZhTW?: string
  sourceUrls: string[]
} {
  const sources = parts
    .map((part) => describeStatSource(part))
    .filter((source): source is StatSource => source !== null)
  const community = sources.filter((source) => !source.isOfficial)
  if (community.length === 0) return { hasCommunityStats: false, sourceUrls: [] }
  const sourceUrls = [...new Set(community.flatMap((source) => source.sourceUrls))]
  return {
    hasCommunityStats: true,
    noticeZhTW: '類型、旋向與軸心特性官方未公布，數值取自社群圖鑑的玩家實測',
    sourceUrls,
  }
}
