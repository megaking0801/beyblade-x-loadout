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

export function getPartStrengthIndex(): Map<string, PartStrengthEntry> {
  const index = new Map<string, PartStrengthEntry>()
  for (const row of raw.parts) {
    index.set(row.partId, { podiumAppearances: row.podiumAppearances, percentileScore: row.percentileScore })
  }
  return index
}
