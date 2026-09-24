/**
 * 時間切分回測：用較早的賽事日期算零件強度分數，驗證分數高的零件在「較晚」
 * 賽事裡是否仍然常常上頒獎台（不分名次，只看有沒有出現）。
 *
 * 規格對照：第 50.6 節。**不得**把這裡的輸出包裝成「準確率」或「模型評分」——
 * 這是相關性／分組比較，資料沒有負例（第 50.1 節），算不出真正的預測準確度。
 *
 * 2026-09-24 方法修正：舊版只比較驗證期裡「已進前三」的第 1／2／3 名三組平均
 * 分數，這三組全部已經進前三、用的本來就是熱門零件，天花板效應讓這個比較法
 * 測不出東西（曾經測出 87.0／89.2／87.0，看起來像沒有訊號，其實是問錯了
 * 問題）。改成測「訓練期分數高的零件，驗證期出場次數是否仍然偏高」——這才是
 * fallback 實際要回答的問題：型錄裡一堆沒有配置級證據的零件，哪個比較該被
 * 推薦。用 Spearman 排名相關係數＋前 25%／後 75% 出場次數佔比兩個角度看，
 * 並用隨機打亂訓練期分數做對照組，確認結果不是方法上的假訊號。
 *
 * 用法：node scripts/backtestPartStrength.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mergePodiumCounts } from './buildPartStrength.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const RAW_FILE = resolve(root, 'src/catalog/sources/stanyao-raw-records.json')

const TRAIN_FRACTION = 0.8
const SHUFFLE_TRIALS = 20

/**
 * 跟 src/domain/competitiveMeta.ts 的 computePercentiles() 是同一套算法，
 * 理由見 buildPartStrength.mjs 同名函式的註解。
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

/** Spearman 排名相關係數，同分用平均名次（tie-corrected）。 */
function spearman(pairs) {
  const n = pairs.length
  if (n < 2) return undefined
  const rankOf = (values) => {
    const sorted = values.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0])
    const ranks = new Array(values.length)
    let i = 0
    while (i < sorted.length) {
      let j = i
      while (j + 1 < sorted.length && sorted[j + 1][0] === sorted[i][0]) j++
      const avgRank = (i + j) / 2 + 1
      for (let k = i; k <= j; k++) ranks[sorted[k][1]] = avgRank
      i = j + 1
    }
    return ranks
  }
  const rx = rankOf(pairs.map((p) => p[0]))
  const ry = rankOf(pairs.map((p) => p[1]))
  const meanRx = rx.reduce((a, b) => a + b, 0) / n
  const meanRy = ry.reduce((a, b) => a + b, 0) / n
  let num = 0
  let denomX = 0
  let denomY = 0
  for (let i = 0; i < n; i++) {
    const dx = rx[i] - meanRx
    const dy = ry[i] - meanRy
    num += dx * dy
    denomX += dx * dx
    denomY += dy * dy
  }
  if (denomX === 0 || denomY === 0) return undefined
  return num / Math.sqrt(denomX * denomY)
}

function shuffled(values) {
  const copy = [...values]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
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

  const trainCountByPart = new Map()
  for (const r of trainRecords) {
    for (const partId of r.comboPartIds ?? []) {
      trainCountByPart.set(partId, (trainCountByPart.get(partId) ?? 0) + 1)
    }
  }
  const trainPercentiles = computePercentiles(trainCountByPart)

  const holdoutCountByPart = new Map()
  for (const r of holdoutRecords) {
    for (const partId of r.comboPartIds ?? []) {
      holdoutCountByPart.set(partId, (holdoutCountByPart.get(partId) ?? 0) + 1)
    }
  }

  // 兩期都出現過的零件才能比較；只在驗證期出現的零件（新品或訓練期樣本沒中）
  // 分開報告，不能混進相關係數——否則等於用「有沒有上市」在預測，跟零件強弱無關。
  const bothPeriods = []
  const newInHoldout = []
  for (const [partId, holdoutCount] of holdoutCountByPart) {
    const trainPercentile = trainPercentiles.get(partId)
    if (trainPercentile === undefined) newInHoldout.push({ partId, holdoutCount })
    else bothPeriods.push({ partId, trainPercentile, holdoutCount })
  }

  console.log('')
  console.log(`驗證期出現過的零件共 ${holdoutCountByPart.size} 個`)
  console.log(`  訓練期也出現過（可比較持續性）：${bothPeriods.length} 個`)
  console.log(`  訓練期完全沒出現（新品或訓練期樣本沒中，排除在相關係數外）：${newInHoldout.length} 個`)

  if (bothPeriods.length < 2) {
    console.log('可比較的零件不足兩個，無法計算相關係數。')
    return
  }

  const rho = spearman(bothPeriods.map((row) => [row.trainPercentile, row.holdoutCount]))
  console.log('')
  console.log(`Spearman 排名相關係數（訓練期百分位 vs 驗證期出場次數，n=${bothPeriods.length}）：${rho.toFixed(3)}`)

  // 集中度檢查：訓練期分數前 25%／後 75% 的零件，各佔驗證期出場次數的比例。
  const sortedByTrainPercentile = [...bothPeriods].sort((a, b) => b.trainPercentile - a.trainPercentile)
  const top25Count = Math.max(1, Math.round(sortedByTrainPercentile.length * 0.25))
  const top25 = sortedByTrainPercentile.slice(0, top25Count)
  const bottom75 = sortedByTrainPercentile.slice(top25Count)
  const totalHoldoutAppearances = bothPeriods.reduce((sum, row) => sum + row.holdoutCount, 0)
  const top25Share = (100 * top25.reduce((sum, row) => sum + row.holdoutCount, 0)) / totalHoldoutAppearances

  console.log('')
  console.log(`訓練期分數前 25%（${top25Count}／${sortedByTrainPercentile.length} 個零件）佔驗證期總出場次數的 ${top25Share.toFixed(1)}%`)
  console.log('（對照基準：如果分數跟持續性完全無關，佔比「應該」接近 25%）')

  // fallback 實際要用在冷門、沒有配置級證據的長尾配置——排除熱門零件後看
  // 剩下的長尾是否仍有排序鑑別力，避免相關係數只是被少數超熱門零件拉出來的。
  let bottomRho
  if (bottom75.length >= 2) {
    bottomRho = spearman(bottom75.map((row) => [row.trainPercentile, row.holdoutCount]))
    console.log('')
    console.log(`排除前 25% 熱門零件後，剩下長尾（n=${bottom75.length}）的 Spearman：${bottomRho === undefined ? '無法計算' : bottomRho.toFixed(3)}`)
    console.log('（這段才是 fallback 實際要用到的區間——熱門零件的具體配置通常早有配置級證據，不需要 fallback）')
  }

  // 隨機打亂對照組：把訓練期分數隨機重新分配給同一批零件，重跑幾次，
  // 確認上面的相關係數不是計算方法本身必然產生的假訊號。
  const partIds = bothPeriods.map((row) => row.partId)
  const trainValues = bothPeriods.map((row) => row.trainPercentile)
  const holdoutByPartId = new Map(bothPeriods.map((row) => [row.partId, row.holdoutCount]))
  const shuffleResults = []
  for (let t = 0; t < SHUFFLE_TRIALS; t++) {
    const shuffledValues = shuffled(trainValues)
    const pairs = partIds.map((partId, i) => [shuffledValues[i], holdoutByPartId.get(partId)])
    const shuffledRho = spearman(pairs)
    if (shuffledRho !== undefined) shuffleResults.push(shuffledRho)
  }
  const shuffleMean = shuffleResults.reduce((a, b) => a + b, 0) / shuffleResults.length
  const shuffleMax = Math.max(...shuffleResults.map(Math.abs))
  console.log('')
  console.log(`隨機打亂對照組（${SHUFFLE_TRIALS} 次）：平均 ${shuffleMean.toFixed(3)}，|值| 最大 ${shuffleMax.toFixed(3)}`)
  console.log('（真實 Spearman 需要明顯超出這個範圍，才能說是真訊號而不是方法上的假結果）')

  console.log('')
  console.log('解讀方式：這是「零件會不會繼續出現在賽果」的持續性檢查，不是名次預測或準確率。')
  console.log('每次資料更新後重跑一次，確認持續性沒有隨 meta（新品發售、規則調整）消失。')

  if (newInHoldout.length > 0) {
    console.log('')
    console.log('訓練期完全沒紀錄、驗證期才出現的零件（前 10 個依驗證期出場數排序，不計入上面的相關係數）：')
    for (const row of [...newInHoldout].sort((a, b) => b.holdoutCount - a.holdoutCount).slice(0, 10)) {
      console.log(`  ${row.partId}：驗證期出場 ${row.holdoutCount} 次`)
    }
  }

  // 合併版回測（規格第 4 節）：bbxhub 資料只加進訓練期，不加進驗證期——
  // bbxhub 是彙總到抓取當下的數字，沒有可切分的逐筆日期，這樣做剛好對應
  // 真正想驗證的問題：「訓練期多了 bbxhub，有沒有更準地猜中 stan-yao 之後
  // （驗證期）實際觀測到的結果」。
  const bbxhubMetaPath = resolve(root, 'src/catalog/sources/bbxhub-meta.json')
  let bbxhubMeta
  try {
    bbxhubMeta = JSON.parse(readFileSync(bbxhubMetaPath, 'utf8'))
  } catch (error) {
    console.log('')
    console.log(`找不到 ${bbxhubMetaPath}，略過合併版回測。`)
    console.log(`先跑 node scripts/fetchBbxhubMeta.mjs 產出這份檔案再重跑本腳本。`)
    return
  }

  const mergedTrainCountByPart = mergePodiumCounts(trainCountByPart, bbxhubMeta, { mode: 'sum' })
  const mergedTrainPercentiles = computePercentiles(mergedTrainCountByPart)

  const mergedBothPeriods = []
  for (const [partId, holdoutCount] of holdoutCountByPart) {
    const trainPercentile = mergedTrainPercentiles.get(partId)
    if (trainPercentile !== undefined) mergedBothPeriods.push({ partId, trainPercentile, holdoutCount })
  }

  console.log('')
  console.log('========== 合併版（訓練期併入 bbxhub，驗證期維持純 stan-yao） ==========')
  console.log(`可比較的零件數：${mergedBothPeriods.length}（純 stan-yao 版是 ${bothPeriods.length}）`)

  if (mergedBothPeriods.length < 2) {
    console.log('可比較的零件不足兩個，無法計算合併版相關係數。')
    return
  }

  const mergedRho = spearman(mergedBothPeriods.map((row) => [row.trainPercentile, row.holdoutCount]))
  console.log(`合併版 Spearman（n=${mergedBothPeriods.length}）：${mergedRho.toFixed(3)}`)
  console.log(`（純 stan-yao 版是 ${rho.toFixed(3)}，供對照）`)

  const mergedSorted = [...mergedBothPeriods].sort((a, b) => b.trainPercentile - a.trainPercentile)
  const mergedTop25Count = Math.max(1, Math.round(mergedSorted.length * 0.25))
  const mergedBottom75 = mergedSorted.slice(mergedTop25Count)
  if (mergedBottom75.length >= 2) {
    const mergedBottomRho = spearman(mergedBottom75.map((row) => [row.trainPercentile, row.holdoutCount]))
    console.log(
      `合併版排除前 25% 後的長尾 Spearman（n=${mergedBottom75.length}）：${mergedBottomRho === undefined ? '無法計算' : mergedBottomRho.toFixed(3)}`,
    )
    console.log(`（純 stan-yao 版長尾是 ${bottomRho === undefined ? '無法計算' : bottomRho.toFixed(3)}，供對照）`)
  }

  const mergedPartIds = mergedBothPeriods.map((row) => row.partId)
  const mergedTrainValues = mergedBothPeriods.map((row) => row.trainPercentile)
  const mergedHoldoutByPartId = new Map(mergedBothPeriods.map((row) => [row.partId, row.holdoutCount]))
  const mergedShuffleResults = []
  for (let t = 0; t < SHUFFLE_TRIALS; t++) {
    const shuffledValues = shuffled(mergedTrainValues)
    const pairs = mergedPartIds.map((partId, i) => [shuffledValues[i], mergedHoldoutByPartId.get(partId)])
    const shuffledRho = spearman(pairs)
    if (shuffledRho !== undefined) mergedShuffleResults.push(shuffledRho)
  }
  const mergedShuffleMax = Math.max(...mergedShuffleResults.map(Math.abs))
  console.log(`合併版隨機打亂對照組｜值｜最大：${mergedShuffleMax.toFixed(3)}`)
  console.log('')
  console.log('判準（規格第 4 節）：合併版長尾 Spearman 不能明顯低於純 stan-yao 版' )
  console.log('（容忍差距 0.05 以內算沒有明顯變差），且合併版 Spearman 要明顯超出' )
  console.log('隨機打亂對照組的｜值｜最大——建議超出至少 2 倍。都符合才把合併寫進' )
  console.log('buildPartStrength.mjs 的正式輸出（Task 3）；否則改試 percentile-average' )
  console.log('備案（Task 4）。')
}

main()
