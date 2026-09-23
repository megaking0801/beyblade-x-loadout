/**
 * 時間切分回測：用較早的賽事日期算零件強度分數，驗證分數高的零件在「較晚」
 * 賽事裡的進前三傾向是否真的比較高。
 *
 * 規格對照：第 50.6 節。**不得**把這裡的輸出包裝成「準確率」或「模型評分」——
 * 這是相關性／分組比較，資料沒有負例（第 50.1 節），算不出真正的預測準確度。
 *
 * 用法：node scripts/backtestPartStrength.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const RAW_FILE = resolve(root, 'src/catalog/sources/stanyao-raw-records.json')

const TRAIN_FRACTION = 0.8

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
  const dates = [...new Set(raw.records.map((r) => r.date))].sort()
  const splitIndex = Math.floor(dates.length * TRAIN_FRACTION)
  const trainDates = new Set(dates.slice(0, splitIndex))
  const holdoutDates = new Set(dates.slice(splitIndex))

  const trainRecords = raw.records.filter((r) => trainDates.has(r.date))
  const holdoutRecords = raw.records.filter((r) => holdoutDates.has(r.date))

  console.log(`訓練期賽事日期數：${trainDates.size}，驗證期：${holdoutDates.size}`)
  console.log(`訓練期記錄數：${trainRecords.length}，驗證期記錄數：${holdoutRecords.length}`)

  if (holdoutRecords.length === 0) {
    console.log('驗證期沒有資料，無法回測（賽事日期數太少或全部落在訓練期）。')
    return
  }

  const podiumCountByPart = new Map()
  for (const record of trainRecords) {
    for (const partId of record.comboPartIds ?? []) {
      podiumCountByPart.set(partId, (podiumCountByPart.get(partId) ?? 0) + 1)
    }
  }
  const percentiles = computePercentiles(podiumCountByPart)

  const scoreForRecord = (record) => {
    const scores = (record.comboPartIds ?? [])
      .map((partId) => percentiles.get(partId))
      .filter((score) => score !== undefined)
    if (scores.length === 0) return undefined
    return scores.reduce((sum, s) => sum + s, 0) / scores.length
  }

  const byRank = { 1: [], 2: [], 3: [] }
  for (const record of holdoutRecords) {
    const score = scoreForRecord(record)
    if (score === undefined) continue
    byRank[record.rank]?.push(score)
  }

  const average = (values) => (values.length === 0 ? undefined : values.reduce((s, v) => s + v, 0) / values.length)

  console.log('驗證期內，用訓練期零件強度分數，對「已進前三」的紀錄按名次分組平均：')
  for (const rank of [1, 2, 3]) {
    const scores = byRank[rank]
    const avg = average(scores)
    console.log(
      `  第 ${rank} 名（樣本數 ${scores.length}）：平均零件強度分數 ${avg === undefined ? '無樣本' : avg.toFixed(1)}`,
    )
  }
  console.log('')
  console.log(
    '解讀方式：如果第 1 名組的平均分數明顯高於第 3 名組，代表零件強度分數在時間上有' +
      '一定的前瞻相關性，可以支持繼續用目前的 fallback 權重；如果三組數字接近或第 3 名' +
      '組反而更高，代表這個訊號在這份資料上沒有前瞻性，fallback 權重應該調低或本節' +
      '整個重新評估——不得無視這個結果硬是維持原權重。',
  )
}

main()
