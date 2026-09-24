# BBXHub 零件強度合併 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 BBXHub（bbxhub.net WBO 賽事統計）的零件進前三名次資料併進
`buildPartStrength.mjs` 的 `podiumCountByPart`，讓 CX 配置第一次有零件強度
fallback、BX/UX 配置拿到第二個獨立來源，且不改動任何下游消費程式碼
（`deck.ts`／`recommendations.ts`）。

**Architecture:** 合併點放在建置腳本（`buildPartStrength.mjs`），輸出格式
不變，下游只認 `part-strength.generated.json` 這一份檔案，不知道數字來源。
上線前用新增的合併版回測（`backtestPartStrength.mjs`）驗證合併沒有讓訊號
變差，過關才把合併寫進正式輸出；不過關就退回百分位平均法再驗一次，兩者都
不過就不合併，只記錄發現。

**Tech Stack:** Node.js（純腳本，無外部套件），Vitest（既有單元測試，本次
不新增）。

**Spec:** `docs/superpowers/specs/2026-09-24-bbxhub-part-strength-merge-design.md`

## Global Constraints

- 不改 `src/domain/deck.ts`、`src/domain/recommendations.ts`（規格第 6 節）。
- 不新增執行期權重常數（規格第 3 節）。
- `podiumAppearances` 只計 `placements.first + second + third`，不計
  `fourthPlus`（規格第 2 節，對齊 stan-yao「進前三」定義）。
- 兩來源的 `verificationStatus` 合併後維持 `community_only`，不得宣稱官方
  認證（規格第 5 節）。
- 不新增 `buildPartStrength.mjs`／`backtestPartStrength.mjs` 的單元測試，
  維持現狀手動執行、人工讀主控台輸出（規格第 6 節）。
- 合併與否的最終判準見 Task 2 的 Step 2——**沒過關就不能把合併寫進
  `buildPartStrength.mjs` 的正式輸出**（規格第 4 節，硬性）。

## Review Focus

- `bbxhub-meta.json` 裡 `unresolved` 陣列的條目、以及 `parts` 裡沒有
  `placements` 欄位的條目，不能讓合併邏輯拋錯或算出 `NaN`——Task 1 的測試
  要涵蓋「有零件缺 `placements`」這個輸入。
- `bbxhub-meta.json` 檔案在合併版回測／正式建置腳本執行時如果不存在（例如
  接手的人忘了先跑 `fetch:bbxhub-meta`），錯誤訊息要講清楚缺哪個檔案、
  該跑哪個指令補，不能是原始的 `ENOENT` 堆疊——Task 1 與 Task 3 都要處理。
- 同一個 `partId` 如果 stan-yao 跟 bbxhub 都有資料，相加後的數字要真的是
  兩者相加，不能只取其中一邊或覆蓋——Task 1 的測試要有這個案例。
- `catalogPartIds` 過濾（現有邏輯把不在圖鑑裡的 partId 排除）合併後要繼續
  生效，bbxhub 條目理論上都已經是圖鑑裡的 partId（`fetchBbxhubMeta.mjs`
  只會產出 `resolveFusedName()` 解出來的 partId），但仍要驗證沒有繞過這層
  過濾。
- `lowSampleWarnings`／`unmatchedCatalogPartIds` 這兩個既有的健檢欄位合併後
  語義不能變——`unmatchedCatalogPartIds` 仍然是「兩個來源合起來都沒有資料」
  才算未涵蓋，不是「stan-yao 沒有但 bbxhub 有」也算未涵蓋。

---

### Task 1: `buildPartStrength.mjs` 合併 bbxhub 計數（先寫成可切換的函式，兩種合併策略都能跑）

**Files:**
- Modify: `scripts/buildPartStrength.mjs`
- Test: 這支是手動執行的建置腳本，沒有既有單元測試框架（見 Global
  Constraints），改用 Task 1 Step 1 的臨時驗證腳本（跑完即刪）確認合併函式
  邏輯正確，不新增進 `tests/` 目錄的正式測試檔。

**Interfaces:**
- Produces: `mergePodiumCounts(baseCountByPart, bbxhubMeta, { mode })`——
  純函式，`baseCountByPart` 是 `Map<string, number>`，`bbxhubMeta` 是
  `fetchBbxhubMeta.mjs` 輸出的完整物件（含 `parts` 陣列），`mode` 是
  `'sum'`（直接加總，Task 1 先實作這個）或 `'percentile-average'`（Task 4
  才會用到的備案，這次先留函式簽名，內部丟
  `throw new Error('percentile-average 模式待 Task 4 實作')`）。回傳新的
  `Map<string, number>`（`mode: 'sum'` 時），不修改傳入的 `baseCountByPart`
  （複製一份再改）。

- [ ] **Step 1: 寫一支臨時驗證腳本，涵蓋 Review Focus 列的三個案例**

建立 `scripts/_tmp-verify-merge.mjs`（跑完這個 Task 就刪掉，不進 git）：

```javascript
import { mergePodiumCounts } from './buildPartStrength.mjs'

function assertEqual(actual, expected, label) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a !== e) throw new Error(`FAIL ${label}：預期 ${e}，實際 ${a}`)
  console.log(`PASS ${label}`)
}

// 案例 1：同一個 partId 兩邊都有資料，要真的相加
{
  const base = new Map([['blade:A', 10]])
  const bbxhub = {
    parts: [
      { partId: 'blade:A', placements: { first: 3, second: 2, third: 1, fourthPlus: 100 } },
    ],
  }
  const result = mergePodiumCounts(base, bbxhub, { mode: 'sum' })
  assertEqual(result.get('blade:A'), 16, '同一零件相加（10 + 3+2+1，不計 fourthPlus）')
}

// 案例 2：bbxhub 有新零件（base 裡沒有），要新增進去
{
  const base = new Map([['blade:A', 10]])
  const bbxhub = { parts: [{ partId: 'main_blade:X', placements: { first: 1, second: 0, third: 0, fourthPlus: 5 } }] }
  const result = mergePodiumCounts(base, bbxhub, { mode: 'sum' })
  assertEqual(result.get('main_blade:X'), 1, 'bbxhub 獨有的零件要新增')
  assertEqual(result.get('blade:A'), 10, '沒被 bbxhub 提到的零件維持原值')
}

// 案例 3：bbxhub 條目缺 placements 欄位，不能拋錯或算出 NaN
{
  const base = new Map()
  const bbxhub = { parts: [{ partId: 'blade:B' }] }
  const result = mergePodiumCounts(base, bbxhub, { mode: 'sum' })
  assertEqual(result.has('blade:B'), false, '缺 placements 的條目不貢獻計數，也不拋錯')
}

console.log('全部通過')
```

- [ ] **Step 2: 執行驗證腳本，確認全部失敗（`mergePodiumCounts` 還沒實作）**

Run: `node scripts/_tmp-verify-merge.mjs`
Expected: 報錯 `mergePodiumCounts is not a function`（或類似的 import 失敗
訊息）——這是預期的紅燈，`buildPartStrength.mjs` 目前還沒 export 這個函式。

- [ ] **Step 3: 在 `buildPartStrength.mjs` 加上 `mergePodiumCounts()` 並 export**

在 `computePercentiles()` 函式後面加：

```javascript
/**
 * 把 bbxhub-meta.json 的進前三次數併進既有的 podiumCountByPart。
 * mode: 'sum' 直接相加（不設換算係數，規格第 3 節）；'percentile-average'
 * 是規格第 3 節的備案，只有 'sum' 沒過回測驗證才會用到（Task 4 實作）。
 */
export function mergePodiumCounts(baseCountByPart, bbxhubMeta, { mode }) {
  if (mode === 'percentile-average') {
    throw new Error('percentile-average 模式待 Task 4 實作')
  }
  if (mode !== 'sum') {
    throw new Error(`不支援的合併模式：${mode}`)
  }
  const merged = new Map(baseCountByPart)
  for (const part of bbxhubMeta.parts) {
    const p = part.placements
    if (!p) continue
    const podiumCount = (p.first ?? 0) + (p.second ?? 0) + (p.third ?? 0)
    merged.set(part.partId, (merged.get(part.partId) ?? 0) + podiumCount)
  }
  return merged
}
```

`main()` 函式維持原樣（Task 3 才會改成呼叫這個函式）——這一步只新增函式，
不接進正式輸出流程，避免這一步的改動範圍跟「要不要合併」的驗證結果綁在
一起。

- [ ] **Step 4: 重跑驗證腳本，確認全部通過**

Run: `node scripts/_tmp-verify-merge.mjs`
Expected: 三個 `PASS` 加一行 `全部通過`。

- [ ] **Step 5: 刪除臨時驗證腳本，確認既有測試沒被這步影響**

```bash
rm scripts/_tmp-verify-merge.mjs
npx tsc -b && npm test
```

Expected: `tsc` 乾淨無輸出，`npm test` 463/463 全過（這一步只新增了一個
`buildPartStrength.mjs` 裡的 export 函式，`main()` 沒變，不應該有任何既有
測試受影響）。

- [ ] **Step 6: Commit**

```bash
git add scripts/buildPartStrength.mjs
git commit -m "$(cat <<'EOF'
feat: add mergePodiumCounts() for combining stan-yao and BBXHub counts

Pure function only, not yet wired into main() — the decision to ship the
'sum' merge depends on the backtest in the next task (spec section 4).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `backtestPartStrength.mjs` 合併版回測，跑出判準要看的數字

**Files:**
- Modify: `scripts/backtestPartStrength.mjs`

**Interfaces:**
- Consumes: `mergePodiumCounts` from `scripts/buildPartStrength.mjs`（Task 1
  的 `'sum'` 模式）。
- Produces: 主控台額外印出「合併版」的 Spearman／長尾 Spearman／隨機打亂
  對照組，跟現有「純 stan-yao 版」並排，供 Step 2 的人工判讀使用。

- [ ] **Step 1a: 先把 `bottomRho` 從區塊作用域拉到函式作用域，供合併版對照用**

現有程式碼裡 `bottomRho` 宣告在 `if (bottom75.length >= 2) { const bottomRho = ... }`
區塊內，出了這個 if 就讀不到。合併版要拿它做對照（純 stan-yao 版長尾
Spearman），所以先把宣告拉到外面。把：

```javascript
  if (bottom75.length >= 2) {
    const bottomRho = spearman(bottom75.map((row) => [row.trainPercentile, row.holdoutCount]))
    console.log('')
    console.log(`排除前 25% 熱門零件後，剩下長尾（n=${bottom75.length}）的 Spearman：${bottomRho === undefined ? '無法計算' : bottomRho.toFixed(3)}`)
    console.log('（這段才是 fallback 實際要用到的區間——熱門零件的具體配置通常早有配置級證據，不需要 fallback）')
  }
```

改成：

```javascript
  let bottomRho
  if (bottom75.length >= 2) {
    bottomRho = spearman(bottom75.map((row) => [row.trainPercentile, row.holdoutCount]))
    console.log('')
    console.log(`排除前 25% 熱門零件後，剩下長尾（n=${bottom75.length}）的 Spearman：${bottomRho === undefined ? '無法計算' : bottomRho.toFixed(3)}`)
    console.log('（這段才是 fallback 實際要用到的區間——熱門零件的具體配置通常早有配置級證據，不需要 fallback）')
  }
```

- [ ] **Step 1b: 在 `main()` 裡，算完純 stan-yao 版的所有指標之後，加一段合併版**

在現有 `main()` 函式最後（`if (newInHoldout.length > 0) { ... }` 那個區塊
之後），加：

```javascript
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
```

在檔案最上面的 import 區塊加上 `mergePodiumCounts`：

```javascript
import { mergePodiumCounts } from './buildPartStrength.mjs'
```

（`computePercentiles`／`spearman`／`shuffled` 這幾個函式在這支檔案裡本來
就有自己的定義，不用改；`readFileSync`／`resolve` 已經在既有 import 裡。）

- [ ] **Step 2: 執行合併版回測，讀輸出，套用判準做決定**

Run: `node scripts/backtestPartStrength.mjs`

Expected: 主控台印出純 stan-yao 版（既有輸出）跟合併版（Step 1 新增）兩組
數字。對照判準：

- 合併版「排除前 25% 後的長尾 Spearman」跟純 stan-yao 版的長尾 Spearman
  相比，差距在 0.05 以內（含變好）→ 判準 A 通過。
- 合併版 Spearman 的絕對值，超出合併版隨機打亂對照組｜值｜最大至少 2 倍
  → 判準 B 通過。

兩個判準都通過：**記錄「合併通過，採用 sum 模式」，進 Task 3。**
任一判準沒過：**記錄「sum 模式沒過，改試 Task 4 的 percentile-average
備案」，跳過 Task 3，改做 Task 4。**

這一步的實際輸出數字要記下來（貼進 commit message 或 Task 3／Task 4 開頭
的筆記），下一個 Task 開頭要能看到這輪實際測出的數字，不能只憑印象。

- [ ] **Step 3: Commit**

```bash
git add scripts/backtestPartStrength.mjs
git commit -m "$(cat <<'EOF'
feat: add merged-source backtest variant to decide BBXHub merge strategy

BBXHub counts are added to the training period only (it has no per-record
dates to split), holdout stays pure stan-yao — this tests whether adding
BBXHub actually improves prediction of stan-yao's own future results.

Result: <把 Step 2 讀到的實際數字跟判準結論貼在這裡>

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `sum` 模式通過判準──把合併接進正式輸出（Task 2 判準通過才做這個 Task）

跳過這個 Task 的條件：Task 2 Step 2 判準沒過。這種情況直接跳到 Task 4。

**Files:**
- Modify: `scripts/buildPartStrength.mjs`

**Interfaces:**
- Consumes: `mergePodiumCounts()`（Task 1，`mode: 'sum'`）。

- [ ] **Step 1: 修改 `main()`，串上合併**

在 `main()` 函式裡，把：

```javascript
  const podiumCountByPart = new Map()
  for (const record of raw.records) {
    for (const partId of record.comboPartIds ?? []) {
      podiumCountByPart.set(partId, (podiumCountByPart.get(partId) ?? 0) + 1)
    }
  }

  const percentiles = computePercentiles(podiumCountByPart)
```

改成：

```javascript
  const stanYaoCountByPart = new Map()
  for (const record of raw.records) {
    for (const partId of record.comboPartIds ?? []) {
      stanYaoCountByPart.set(partId, (stanYaoCountByPart.get(partId) ?? 0) + 1)
    }
  }

  const BBXHUB_META_FILE = resolve(root, 'src/catalog/sources/bbxhub-meta.json')
  let bbxhubMeta
  try {
    bbxhubMeta = JSON.parse(readFileSync(BBXHUB_META_FILE, 'utf8'))
  } catch (error) {
    throw new Error(
      `找不到 ${BBXHUB_META_FILE}，先跑 node scripts/fetchBbxhubMeta.mjs 產出這份檔案再重跑本腳本。`,
    )
  }
  const podiumCountByPart = mergePodiumCounts(stanYaoCountByPart, bbxhubMeta, { mode: 'sum' })

  const percentiles = computePercentiles(podiumCountByPart)
```

在檔案最上面補 `BBXHUB_META_FILE` 常數定義位置——直接寫在 `main()` 內部
就好（跟上面程式碼一致），不用拉到檔案頂層跟 `RAW_FILE`／`CATALOG_FILE`
並列，因為這個常數只有 `main()` 用到一次。

- [ ] **Step 2: 更新輸出的 `source`／`note` 欄位，如實反映兩來源合併（規格第 5 節）**

在 `main()` 的 `output` 物件裡，把：

```javascript
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
```

改成：

```javascript
  const output = {
    source: `${raw.source} + ${bbxhubMeta.source}`,
    sourceUrl: [raw.sourceUrl, bbxhubMeta.sourceUrl],
    fetchedAt: raw.fetchedAt,
    bbxhubFetchedAt: bbxhubMeta.fetchedAt,
    note:
      '零件層級的賽果聲量聚合，不是勝率或名次預測（見規格第 50.1 節）。podiumAppearances ' +
      '合併了兩個獨立社群來源的進前三次數（stan-yao 表單逐場記錄 + BBXHub WBO 統計，' +
      '直接相加、不設換算係數，見 2026-09-24-bbxhub-part-strength-merge-design.md ' +
      '第 3 節），兩者皆為社群來源，不宣稱官方認證。percentileScore 是該零件的 ' +
      'podiumAppearances 在所有零件分布裡的百分位排名，跟 competitiveMeta.ts 的 ' +
      'computePercentiles() 同一套算法。',
    totalRecords: raw.records.length,
    parts,
    lowSampleWarnings,
    unmatchedCatalogPartIds,
  }
```

- [ ] **Step 3: 重新產出 `part-strength.generated.json`**

Run: `npm run build:part-strength`
Expected: 主控台印出的「型錄裡完全沒有賽果紀錄的零件」數字應該比合併前
下降（CX 零件開始有資料）。人工打開
`src/catalog/sources/part-strength.generated.json`，確認 `source` 欄位
變成兩個來源合併的字串、抽查幾個 CX partId（例如 `main_blade:` 開頭的）
出現在 `parts` 陣列裡。

- [ ] **Step 4: 跑完整驗證**

```bash
npx tsc -b && npm test
```

Expected: `tsc` 乾淨，`npm test` 463/463 全過（Review Focus 已確認
`deck.test.ts` 對 `estimateComboPartStrength()` 的測試都用假 Map，不吃真實
產出檔，不會被這步影響；如果真的紅了，代表有別的測試意外依賴了這份檔案的
具體內容，要先讀那條測試在斷言什麼再決定怎麼處理，不能直接改測試遷就）。

- [ ] **Step 5: Commit**

```bash
git add scripts/buildPartStrength.mjs src/catalog/sources/part-strength.generated.json
git commit -m "$(cat <<'EOF'
feat: ship BBXHub-merged part-strength data (sum mode passed backtest)

Backtest result (Task 2): <貼上 Task 2 Step 2 記錄的實際數字>. CX combos
now have podium-appearance data for the first time — estimateComboPartStrength()
in deck.ts needed no changes, it already consumes this file generically.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

跳到本計畫最後的「收尾」段落，不用做 Task 4。

---

### Task 4: `sum` 模式沒過判準──改用 percentile-average 備案（Task 2 判準沒過才做這個 Task）

跳過這個 Task 的條件：Task 2 判準通過（已經做 Task 3 了）。

**Files:**
- Modify: `scripts/buildPartStrength.mjs`

**Interfaces:**
- Consumes: 修改 `mergePodiumCounts()`（Task 1）的 `'percentile-average'`
  分支。

- [ ] **Step 1: 實作 `percentile-average` 模式**

把 Task 1 寫的：

```javascript
  if (mode === 'percentile-average') {
    throw new Error('percentile-average 模式待 Task 4 實作')
  }
```

改成：

```javascript
  if (mode === 'percentile-average') {
    const bbxhubCountByPart = new Map()
    for (const part of bbxhubMeta.parts) {
      const p = part.placements
      if (!p) continue
      bbxhubCountByPart.set(part.partId, (p.first ?? 0) + (p.second ?? 0) + (p.third ?? 0))
    }
    const basePercentiles = computePercentiles(baseCountByPart)
    const bbxhubPercentiles = computePercentiles(bbxhubCountByPart)
    const allPartIds = new Set([...basePercentiles.keys(), ...bbxhubPercentiles.keys()])
    const merged = new Map()
    for (const partId of allPartIds) {
      const values = [basePercentiles.get(partId), bbxhubPercentiles.get(partId)].filter(
        (v) => v !== undefined,
      )
      merged.set(partId, values.reduce((a, b) => a + b, 0) / values.length)
    }
    return merged
  }
```

這個分支回傳的是「兩來源百分位平均」而不是「進前三次數」，跟 `'sum'`
模式的回傳值單位不同（一個是次數、一個已經是 0-100 的百分位）——呼叫端
（Step 2）要注意這點，不能對這個模式的回傳值再套一次
`computePercentiles()`。

`computePercentiles` 需要在檔案裡可以被 `mergePodiumCounts` 呼叫到（本來
就在同一個檔案裡定義在上面，不用額外 import）。

- [ ] **Step 2: 改 `backtestPartStrength.mjs`，這次跑 `percentile-average` 模式的合併版回測**

把 Task 2 Step 1 加的這段：

```javascript
  const mergedTrainCountByPart = mergePodiumCounts(trainCountByPart, bbxhubMeta, { mode: 'sum' })
  const mergedTrainPercentiles = computePercentiles(mergedTrainCountByPart)
```

改成：

```javascript
  const mergeMode = 'percentile-average'
  const mergedTrainPercentiles =
    mergeMode === 'sum'
      ? computePercentiles(mergePodiumCounts(trainCountByPart, bbxhubMeta, { mode: 'sum' }))
      : mergePodiumCounts(trainCountByPart, bbxhubMeta, { mode: 'percentile-average' })
```

（`percentile-average` 模式回傳的已經是百分位，不用再套
`computePercentiles()`；用一個 `mergeMode` 變數而不是寫死，方便之後如果
還要比第三種模式，只改這一行。）

- [ ] **Step 3: 執行，套用跟 Task 2 Step 2 一樣的判準**

Run: `node scripts/backtestPartStrength.mjs`
Expected: 同 Task 2 Step 2 的判準（長尾 Spearman 差距 0.05 以內、超出
隨機打亂對照組至少 2 倍）。

兩個判準都通過：**記錄「percentile-average 模式通過」，回頭把 Task 3 的
Step 1／Step 2 套用到這個模式**（Task 3 的 `mergePodiumCounts(..., { mode: 'sum' })`
呼叫改成 `{ mode: 'percentile-average' }`；Step 2 的 `output.note` 文字改成
講清楚這次用的是百分位平均法，不是直接相加），然後做 Task 3 剩下的 Step
3-5。

任一判準沒過：**記錄「兩種合併策略都沒過回測，這輪不合併 bbxhub 資料」**，
不修改 `buildPartStrength.mjs` 的 `main()`（`mergePodiumCounts()` 函式本身
保留在檔案裡，供之後有新資料再嘗試時重用，但不接進 `main()`），跳到「收尾」
段落，在 HANDOFF 記錄這個結論跟兩輪回測的實際數字。

- [ ] **Step 4: 視 Step 3 的結果 commit**

通過（採用 percentile-average）：

```bash
git add scripts/buildPartStrength.mjs scripts/backtestPartStrength.mjs src/catalog/sources/part-strength.generated.json
git commit -m "$(cat <<'EOF'
feat: ship BBXHub-merged part-strength data (percentile-average mode)

sum mode failed the backtest gate (Task 2 result: <數字>); percentile-average
passed instead (Task 4 result: <數字>). See design spec section 3 for why
this fallback exists.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

都沒過（不合併）：

```bash
git add scripts/buildPartStrength.mjs scripts/backtestPartStrength.mjs
git commit -m "$(cat <<'EOF'
docs: record that BBXHub merge did not pass the backtest gate

Both sum mode (Task 2: <數字>) and percentile-average mode (Task 4: <數字>)
failed the correlation gate in the design spec's section 4. mergePodiumCounts()
is kept in buildPartStrength.mjs for future reuse but is not wired into
main() — part-strength.generated.json still only reflects stan-yao data.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## 收尾

不管走 Task 3（合併成功，sum 模式）、Task 4 通過（合併成功，
percentile-average 模式），還是 Task 4 都沒過（不合併），都要做完這三步
才算結束（`CLAUDE.md` 收尾規則）：

- [ ] **更新 HANDOFF.md**：寫清楚這輪的結論是「合併了，用哪個模式，
  兩輪回測的實際數字是多少」還是「兩種都沒過，維持只用 stan-yao」，附上
  Task 2／Task 4 記錄的具體 Spearman 數字（不寫「應該有改善」這種沒有
  數字支撐的話）。如果有合併，順便提一句 CX 配置現在第一次有零件強度
  fallback 了。
- [ ] **Push**：`git push origin main`。
- [ ] **視情況部署**：只有 Task 3／Task 4 真的改了
  `part-strength.generated.json`（合併成功的分支）才需要
  `npm run deploy:pages` → `npm run test:live`——這份資料會被
  `deck.ts`／`recommendations.ts` 在執行期讀取，屬於「型錄產物變更」
  （`CLAUDE.md` 規則），不能只 push 不部署。如果兩種模式都沒過（沒有改
  `part-strength.generated.json`），只是文件變更，不用部署，但 HANDOFF
  要寫清楚線上版本未變。
