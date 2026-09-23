/**
 * 從 stanyao-raw-records.json 的逐筆賽果，聚合出「零件層級」的歷史戰績分數。
 *
 * 規格對照：第 50 節。這不是模型訓練，是把既有的配置層級百分位聚合
 * （見 competitiveMeta.ts 的 computePercentiles()）搬到零件層級，理由是
 * stan-yao 的 rank 只收 1～3 名，沒有負例，算不出勝率或名次預測（第 50.1 節），
 * 唯一誠實可做的是「零件在賽果紀錄裡的聲量聚合」。
 *
 * 用法：node scripts/buildPartStrength.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const RAW_FILE = resolve(root, 'src/catalog/sources/stanyao-raw-records.json')
const CATALOG_FILE = resolve(root, 'src/catalog/catalog.generated.json')
const OUT_FILE = resolve(root, 'src/catalog/sources/part-strength.generated.json')

const LOW_SAMPLE_THRESHOLD = 5

/**
 * 跟 src/domain/competitiveMeta.ts 的 computePercentiles() 是同一套算法。
 * 那邊是 domain TS、這裡是純 Node 腳本，scripts/ 底下沒有 import src/domain
 * 的先例（會需要額外的建置機制），刻意逐字對齊避免兩邊算法各走各的、之後
 * 改一邊忘了改另一邊。
 */
function computePercentiles(countByKey) {
  const sorted = [...countByKey.values()].sort((a, b) => a - b)
  const percentileOf = (value) => {
    if (sorted.length <= 1) return sorted.length === 0 ? 0 : 100
    let countLessEqual = 0
    for (const other of sorted) if (other <= value) countLessEqual++
    return Math.round((100 * (countLessEqual - 1)) / (sorted.length - 1))
  }
  const result = new Map()
  for (const [key, value] of countByKey) result.set(key, percentileOf(value))
  return result
}

function main() {
  const raw = JSON.parse(readFileSync(RAW_FILE, 'utf8'))
  const catalog = JSON.parse(readFileSync(CATALOG_FILE, 'utf8'))
  const catalogPartIds = new Set(catalog.parts.map((part) => part.id))

  const podiumCountByPart = new Map()
  for (const record of raw.records) {
    for (const partId of record.comboPartIds ?? []) {
      podiumCountByPart.set(partId, (podiumCountByPart.get(partId) ?? 0) + 1)
    }
  }

  const percentiles = computePercentiles(podiumCountByPart)

  const parts = [...podiumCountByPart.entries()]
    .map(([partId, podiumAppearances]) => ({
      partId,
      podiumAppearances,
      percentileScore: percentiles.get(partId) ?? 0,
    }))
    .sort((a, b) => b.percentileScore - a.percentileScore)

  const lowSampleWarnings = parts
    .filter((row) => row.podiumAppearances < LOW_SAMPLE_THRESHOLD)
    .map((row) => ({ partId: row.partId, podiumAppearances: row.podiumAppearances }))

  const unmatchedCatalogPartIds = [...catalogPartIds]
    .filter((id) => !podiumCountByPart.has(id))
    .sort()

  const output = {
    source: raw.source,
    sourceUrl: raw.sourceUrl,
    fetchedAt: raw.fetchedAt,
    note:
      '零件層級的賽果聲量聚合，不是勝率或名次預測（見規格第 50.1 節）。percentileScore ' +
      '是該零件的 podiumAppearances 在所有零件分布裡的百分位排名，跟 competitiveMeta.ts ' +
      '的 computePercentiles() 同一套算法。',
    totalRecords: raw.records.length,
    parts,
    lowSampleWarnings,
    unmatchedCatalogPartIds,
  }

  writeFileSync(OUT_FILE, `${JSON.stringify(output, null, 2)}\n`)
  console.log(`寫入 ${parts.length} 個零件的強度分數到 ${OUT_FILE}`)
  console.log(`樣本數過低（< ${LOW_SAMPLE_THRESHOLD} 次進前三）的零件：${lowSampleWarnings.length} 個`)
  console.log(`型錄裡完全沒有賽果紀錄的零件：${unmatchedCatalogPartIds.length} 個`)
}

main()
