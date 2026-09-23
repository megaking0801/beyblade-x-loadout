// 只 import 聚合過的摘要檔，不 import stanyao-raw-records.json（近 4MB，直接
// import 會被打包進瀏覽器程式碼，讓 PWA service worker 的 precache 超過 2MB
// 上限、整個 build 失敗——這是實測踩過的坑，見 fetchStanYaoRecords.mjs 開頭）。
import raw from './sources/stanyao-combo-summary.json'

export interface CommunityRecordMeta {
  source: string
  sourceUrl: string
  fetchedAt: string
  totalRecords: number
  comboCount: number
}

export const communityRecordsMeta: CommunityRecordMeta = {
  source: raw.source,
  sourceUrl: raw.sourceUrl,
  fetchedAt: raw.fetchedAt,
  totalRecords: raw.totalRecords,
  comboCount: raw.combos.length,
}

export interface CommunityComboSummary {
  comboCode: string
  appearances: number
  top4: number
  championships: number
}

/** 依 comboCode 聚合過的社群站台名次摘要，供 `competitiveMeta.ts` 算百分位證據。 */
export function getCommunityComboSummary(): CommunityComboSummary[] {
  return raw.combos
}

/**
 * `createCompetitiveEvidenceByCode({ community: ... })` 要的完整參數形狀，
 * 呼叫端（各 UI 頁面）直接用這個，不用自己組 combos/totalRecords/updatedAt/sourceUrl。
 */
export function getCommunityEvidenceSource(): {
  combos: CommunityComboSummary[]
  totalRecords: number
  updatedAt: string
  sourceUrl: string
} {
  return {
    combos: getCommunityComboSummary(),
    totalRecords: communityRecordsMeta.totalRecords,
    updatedAt: communityRecordsMeta.fetchedAt,
    sourceUrl: communityRecordsMeta.sourceUrl,
  }
}
