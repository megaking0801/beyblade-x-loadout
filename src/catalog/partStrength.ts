/**
 * 零件層級的賽果聲量聚合分數。
 *
 * 規格對照：第 50 節。只是「進前三次數」的百分位排名，不是勝率或名次預測——
 * stan-yao 的原始資料沒有負例，算不出真正的機率（第 50.1 節）。
 */
import raw from './sources/part-strength.generated.json'

export interface PartStrengthEntry {
  podiumAppearances: number
  percentileScore: number
}

let cachedIndex: Map<string, PartStrengthEntry> | undefined

/** 底層 `raw.parts` 是靜態匯入的 JSON，整個 App 生命週期不會變，快取只建一次即可。 */
export function getPartStrengthIndex(): Map<string, PartStrengthEntry> {
  if (!cachedIndex) {
    cachedIndex = new Map()
    for (const row of raw.parts) {
      cachedIndex.set(row.partId, { podiumAppearances: row.podiumAppearances, percentileScore: row.percentileScore })
    }
  }
  return cachedIndex
}
