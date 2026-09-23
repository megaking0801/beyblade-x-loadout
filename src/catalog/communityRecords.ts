import raw from './sources/stanyao-raw-records.json'

export interface CommunityRecordMeta {
  source: string
  sourceUrl: string
  fetchedAt: string
  recordCount: number
  unresolvedCount: number
}

export const communityRecordsMeta: CommunityRecordMeta = {
  source: raw.source,
  sourceUrl: raw.sourceUrl,
  fetchedAt: raw.fetchedAt,
  recordCount: raw.records.length,
  unresolvedCount: raw.unresolved.length,
}

export interface CommunityRecord {
  comboCode: string
  rank?: number
}

/** 逐筆賽事名次紀錄，供 `competitiveMeta.ts` 聚合成百分位證據。 */
export function getCommunityRecords(): CommunityRecord[] {
  return raw.records.map((record) => ({
    comboCode: record.comboCode,
    ...(record.rank ? { rank: record.rank } : {}),
  }))
}

/**
 * `createCompetitiveEvidenceByCode({ community: ... })` 要的完整參數形狀，
 * 呼叫端（各 UI 頁面）直接用這個，不用自己組 records/updatedAt/sourceUrl。
 */
export function getCommunityEvidenceSource(): { records: CommunityRecord[]; updatedAt: string; sourceUrl: string } {
  return {
    records: getCommunityRecords(),
    updatedAt: communityRecordsMeta.fetchedAt,
    sourceUrl: communityRecordsMeta.sourceUrl,
  }
}
