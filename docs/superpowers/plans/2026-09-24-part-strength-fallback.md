# 零件層級強度分數 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓「下一包推薦」與「3on3 組隊」對沒有完整配置賽事紀錄的型錄配置也能拿到非零、但明確弱於真實證據的分數，取代目前這種配置一律 0 分的覆蓋率死角。

**Architecture:** 從 `stanyao-raw-records.json`（14,743 筆逐場進前三名次）離線聚合出零件層級的百分位分數，寫成新的靜態產物 `part-strength.generated.json`。整合方式完全比照 `deck.ts` 裡已經驗證過的 `expertTierGain` 模式：索引由呼叫端 DI 傳入，`deck.ts`／`recommendations.ts` 直接查 `member.slots`／`addedPartIds` 加總，**不**碰 `analysis.ts`／`builder.ts`。

**Tech Stack:** TypeScript（domain 純函式）、Vitest、純 Node（`.mjs` 資料管線腳本，無外部依賴）。

**Spec:** `BEYBLADE_X_codex_prompt.md` 第 50 節（50.1～50.6）。

## Global Constraints

- 不得宣稱勝率、名次預測或「準確率」——資料只有正例（第 50.1 節）。
- 產物需標 `source`/`sourceUrl`/`fetchedAt`，`verificationStatus` 概念上等同 `community`，不得標官方（第 50.2 節）。
- **不進 `analyzeCombo()`／`ComboAnalysis`／`builder.ts`**，比照 `expertTierGain` 的 DI 模式（第 50.3 節）。
- `evidence` 策略（`deck.ts`）與 `competitiveEvidenceGain`（`recommendations.ts`）只吃真實 evidence，不吃零件拼湊推估的 fallback（第 50.3 節）。
- fallback 權重初始值先給保守常數（0.3），不得無來由調整；正式校準排進本計畫最後一個任務的回測產出（第 50.3、50.6 節）。
- 前台文字「完整配置賽事證據」與「零件歷史戰績推估（非完整配置實測）」必須是不同句子，不得合併（第 50.4 節）。
- 六軸系統（`BASE_BY_TYPE`）本計畫不動（第 50.5 節，另案處理）。
- 改 `src/catalog/sources/` 必須來源腳本＋產物＋稽核同批交付，稽核用內嵌欄位（`lowSampleWarnings`／`unmatchedCatalogPartIds`），比照 `stanyao-raw-records.json` 的 `unresolved` 慣例，不建立額外稽核檔（第 50.6 節）。
- 回測用時間切分，不得隨機切分；回測結果只能講相關性／分組比較，不得包裝成「準確率」（第 50.6 節）。

## Review Focus

- **完全沒有賽果資料的零件（新零件／冷門零件）**：`estimateComboPartStrength()` 要回傳 `undefined`，不能當 0 分——0 分代表「查得到、排名最後」，`undefined` 代表「完全沒樣本」，兩者語意不同，UI 文字也要能分辨（決定要不要顯示「零件歷史戰績推估」）。
- **CX 四件式配置**（`lockChipId`／`mainBladeId`／`overBladeId`／`assistBladeId`）比 BX/UX 三件式多幾個部位：`estimateComboPartStrength()` 用 `OCCUPYING_SLOT_KEYS` 掃全部七個 key，要測到 CX 配置的多部位平均正確算出來，不能只測三件式。
- **`evidence` 存在時 fallback 完全不生效**：就算 `partStrengthIndex` 有資料，只要 `member.analysis.evidence?.percentileScore` 有值就一律用真實值，不得疊加或覆蓋。
- **fallback 權重造成零件推估贏過真實證據**：要有一條測試檢查「就算零件推估拉到滿分 100，加權後（× 0.3）也不可能超過任何有真實 `evidence.percentileScore` 的配置分數」這個關係在合理輸入下成立。
- **低樣本零件被悄悄當高分用**：只出現 1 次進前三的零件，百分位算法可能給出偏高的分數（樣本少、排序敏感）；稽核的 `lowSampleWarnings` 要能在腳本輸出裡看到，不能被使用端無條件信任。

---

## Task 1: 零件層級強度分數資料管線

**Files:**
- Create: `scripts/buildPartStrength.mjs`
- Create（腳本產出，這裡先寫規格，Step 3 實際跑腳本產生）: `src/catalog/sources/part-strength.generated.json`

**Interfaces:**
- Consumes: `src/catalog/sources/stanyao-raw-records.json`（`records[].comboPartIds: string[]`）、`src/catalog/catalog.generated.json`（`parts[].id`）
- Produces: `part-strength.generated.json` 的 shape：
  ```ts
  {
    source: string
    sourceUrl: string
    fetchedAt: string
    note: string
    totalRecords: number
    parts: { partId: string; podiumAppearances: number; percentileScore: number }[]
    lowSampleWarnings: { partId: string; podiumAppearances: number }[]
    unmatchedCatalogPartIds: string[]
  }
  ```
  下游 Task 2 的 `getPartStrengthIndex()` 讀這份檔案。

- [ ] **Step 1: 寫腳本**

建立 `scripts/buildPartStrength.mjs`：

```js
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
```

- [ ] **Step 2: 加進 `package.json` scripts**

在 `"scripts"` 區塊裡 `"fetch:stanyao-records"` 附近加一行：

```json
"build:part-strength": "node scripts/buildPartStrength.mjs"
```

- [ ] **Step 3: 實際跑一次，檢查輸出**

Run: `npm run build:part-strength`

Expected（數字可能因資料有微調而略有出入，但量級要接近）：
```
寫入 XXX 個零件的強度分數到 .../part-strength.generated.json
樣本數過低（< 5 次進前三）的零件：N 個
型錄裡完全沒有賽果紀錄的零件：M 個
```
人工打開 `src/catalog/sources/part-strength.generated.json`，確認：
- `parts` 陣列非空、每筆都有 `partId`/`podiumAppearances`/`percentileScore`。
- `percentileScore` 落在 0～100。
- 最高分的幾筆 `partId` 是看起來合理的常見零件（不是亂碼／測試殘留）。

- [ ] **Step 4: Commit**

```bash
git add scripts/buildPartStrength.mjs package.json src/catalog/sources/part-strength.generated.json
git commit -m "feat: aggregate part-level podium frequency from stan-yao records"
```

---

## Task 2: `catalog/partStrength.ts` 讀取層 + `deck.ts` 的 `estimateComboPartStrength()`

**Files:**
- Create: `src/catalog/partStrength.ts`
- Modify: `src/domain/deck.ts`（在 `OCCUPYING_SLOT_KEYS` 定義之後、`scoreDeck` 之前新增函式）
- Test: `tests/unit/deck.test.ts`

**Interfaces:**
- Consumes: `part-strength.generated.json`（Task 1 產物）
- Produces:
  - `export interface PartStrengthEntry { podiumAppearances: number; percentileScore: number }`（`src/catalog/partStrength.ts`）
  - `export function getPartStrengthIndex(): Map<string, PartStrengthEntry>`（`src/catalog/partStrength.ts`）
  - `export function estimateComboPartStrength(slots: ComboSlots, partStrengthIndex: Map<string, PartStrengthEntry>): number | undefined`（`src/domain/deck.ts`）——Task 3、Task 5（UI）都會用到這個函式。

- [ ] **Step 1: 寫 `catalog/partStrength.ts`（無需先寫失敗測試——這是純資料讀取層，跟 `tierLists.ts` 的 `getExpertPartRatingIndex()` 同類，那個也沒有專屬單元測試，靠下游 `deck.test.ts` 間接覆蓋）**

```ts
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
```

- [ ] **Step 2: 寫 `estimateComboPartStrength()` 的失敗測試**

在 `tests/unit/deck.test.ts` 頂部 import 區塊加入：

```ts
import {
  DEFAULT_DECK_RULES,
  estimateComboPartStrength,
  scoreDeck,
  suggestDecks,
  validateDeck,
  type DeckMember,
} from '../../src/domain/deck.ts'
```

（把原本的 `import { ... scoreDeck, suggestDecks, validateDeck, type DeckMember } from ...` 換成上面這行，多 `estimateComboPartStrength`。）

在 `scoreDeck 強度定義` 那個 `describe` 區塊裡加一個新的 `describe`：

```ts
describe('estimateComboPartStrength（零件層級強度 fallback，第 50 節）', () => {
  it('三個零件都有資料時回傳平均百分位', () => {
    const index = new Map([
      ['b-atk', { podiumAppearances: 10, percentileScore: 80 }],
      ['r-60', { podiumAppearances: 5, percentileScore: 40 }],
      ['bit-f', { podiumAppearances: 20, percentileScore: 60 }],
    ])
    const result = estimateComboPartStrength(threeDistinct[0]!, index)
    expect(result).toBe(60) // (80 + 40 + 60) / 3
  })

  it('完全沒有任何零件的資料時回傳 undefined，不能當 0 分', () => {
    const result = estimateComboPartStrength(threeDistinct[0]!, new Map())
    expect(result).toBeUndefined()
  })

  it('部分零件有資料時只平均查得到的那幾個', () => {
    const index = new Map([['b-atk', { podiumAppearances: 10, percentileScore: 90 }]])
    const result = estimateComboPartStrength(threeDistinct[0]!, index)
    expect(result).toBe(90)
  })
})
```

- [ ] **Step 3: 跑測試確認失敗**

Run: `npx vitest run tests/unit/deck.test.ts`
Expected: FAIL，`estimateComboPartStrength is not a function`（或 import 找不到具名匯出）。

- [ ] **Step 4: 在 `src/domain/deck.ts` 實作**

在檔案頂部 import 區塊，`import type { ExpertPartRatingRank } from '../catalog/tierLists.ts'` 那行下面加一行：

```ts
import type { PartStrengthEntry } from '../catalog/partStrength.ts'
```

在 `OCCUPYING_SLOT_KEYS` 常數定義之後（`function partName(part: Part): string {` 之前）新增：

```ts
/**
 * evidence 缺席時的低權重替代訊號：這套配置用到的零件，各自在賽果紀錄裡的
 * 「進前三次數」百分位平均——不是這套配置本身被驗證過，只是零件拼湊推估
 * （第 50 節）。任何一個零件都查不到資料時回傳 undefined，不能當 0 分處理：
 * 0 分代表「查得到、但排名最後」，undefined 代表「完全沒樣本」，語意不同。
 */
export function estimateComboPartStrength(
  slots: ComboSlots,
  partStrengthIndex: Map<string, PartStrengthEntry>,
): number | undefined {
  const matched = OCCUPYING_SLOT_KEYS.map((key) => slots[key])
    .filter((partId): partId is string => Boolean(partId))
    .map((partId) => partStrengthIndex.get(partId))
    .filter((entry): entry is PartStrengthEntry => Boolean(entry))
  if (matched.length === 0) return undefined
  return matched.reduce((sum, entry) => sum + entry.percentileScore, 0) / matched.length
}
```

- [ ] **Step 5: 跑測試確認通過**

Run: `npx vitest run tests/unit/deck.test.ts`
Expected: PASS，全部（含既有測試）綠燈。

- [ ] **Step 6: Commit**

```bash
git add src/catalog/partStrength.ts src/domain/deck.ts tests/unit/deck.test.ts
git commit -m "feat: add part-strength index loader and combo-level estimator"
```

---

## Task 3: `scoreDeck()` 接入 fallback

**Files:**
- Modify: `src/domain/deck.ts`（`scoreDeck` 函式本體、`SuggestDecksArgs`、`suggestDecks` 兩個呼叫點）
- Test: `tests/unit/deck.test.ts`

**Interfaces:**
- Consumes: Task 2 的 `estimateComboPartStrength`、`PartStrengthEntry`
- Produces: `scoreDeck(strategy, members, expertPartRatingIndex?, partStrengthIndex?)`（新增第 4 個參數）；`SuggestDecksArgs.partStrengthIndex?: Map<string, PartStrengthEntry>`

- [ ] **Step 1: 寫失敗測試**

在 `tests/unit/deck.test.ts` 的 `scoreDeck 強度定義` describe 區塊最後加：

```ts
it('balanced 策略：沒有真實 evidence 時，用零件強度 fallback 補分（權重低於真實證據）', () => {
  const membersNoEvidence = threeDistinct.map((slots) => memberFor(slots))
  const partStrengthIndex = new Map([
    ['b-atk', { podiumAppearances: 50, percentileScore: 100 }],
    ['r-60', { podiumAppearances: 50, percentileScore: 100 }],
    ['bit-f', { podiumAppearances: 50, percentileScore: 100 }],
  ])
  const withFallback = scoreDeck('balanced', membersNoEvidence, undefined, partStrengthIndex)
  const withoutFallback = scoreDeck('balanced', membersNoEvidence)
  expect(withFallback).toBeGreaterThan(withoutFallback)
})

it('balanced 策略：fallback 權重低於真實證據，滿分零件推估也贏不過真實證據', () => {
  const maxFallback = threeDistinct.map((slots) => memberFor(slots))
  const partStrengthIndex = new Map(
    ['b-atk', 'b-sta', 'b-def', 'r-60', 'r-80', 'r-70', 'bit-f', 'bit-b', 'bit-p'].map((id) => [
      id,
      { podiumAppearances: 999, percentileScore: 100 },
    ]),
  )
  const withMaxFallback = scoreDeck('balanced', maxFallback, undefined, partStrengthIndex)

  const realEvidence: EvidenceInput = {
    appearances: 1,
    top4: 0,
    championships: 0,
    totalDecks: 10,
    sourceTier: 'community',
    percentileScore: 100,
  }
  const withRealEvidence = threeDistinct.map((slots) => memberFor(slots, realEvidence))
  const withRealEvidenceScore = scoreDeck('balanced', withRealEvidence)

  expect(withMaxFallback).toBeLessThan(withRealEvidenceScore)
})

it('evidence 策略不吃零件強度 fallback，維持「最高賽事證據」策略名稱的承諾', () => {
  const members = threeDistinct.map((slots) => memberFor(slots))
  const partStrengthIndex = new Map([['b-atk', { podiumAppearances: 50, percentileScore: 100 }]])
  expect(scoreDeck('evidence', members, undefined, partStrengthIndex)).toBe(scoreDeck('evidence', members))
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/unit/deck.test.ts`
Expected: FAIL——第一條因為 `scoreDeck` 目前第 4 個參數還不存在／沒作用，`withFallback` 會等於 `withoutFallback`。

- [ ] **Step 3: 實作**

在 `src/domain/deck.ts` 修改 `scoreDeck` 簽名與內部邏輯：

```ts
export function scoreDeck(
  strategy: DeckStrategy,
  members: DeckMember[],
  expertPartRatingIndex?: Map<string, ExpertPartRatingRank>,
  partStrengthIndex?: Map<string, PartStrengthEntry>,
): number {
  const scores = members.map((m) => m.analysis.scores)
  const axis = (key: 'attack' | 'defense' | 'stamina' | 'stability' | 'burst' | 'burstResistance') =>
    scores.map((s) => s?.[key] ?? 0)
  // 完整配置在自己來源分布裡的百分位（0～100，見 evidence.percentileScore 的
  // 註解），不是原始出場筆數——不同來源量級差很多，直接加總原始筆數會讓查得到
  // 大量社群出場數的配置系統性蓋過真正在本地賽事拿過名次的配置，跟
  // `competitiveMeta.ts` 的 `computePercentiles()` 是同一套修正。
  const competitiveEvidence = members.reduce((sum, member) => sum + (member.analysis.evidence?.percentileScore ?? 0), 0)
  // evidence 缺席時的低權重 fallback（第 50 節）：`evidence` 策略刻意不吃這個，
  // 理由跟它不吃 expertTierGain 一樣——策略名稱承諾「最高賽事證據」，混進零件
  // 拼湊推估會誤導。權重是保守初始值，正式校準見規格第 50.6 節的回測腳本。
  const competitiveEvidenceWithFallback = members.reduce((sum, member) => {
    const real = member.analysis.evidence?.percentileScore
    if (real !== undefined) return sum + real
    const fallback = partStrengthIndex ? estimateComboPartStrength(member.slots, partStrengthIndex) : undefined
    return sum + (fallback ?? 0) * PART_STRENGTH_FALLBACK_WEIGHT
  }, 0)
  // BBXHub 高手零件評級加總（X/SS/S），跟 `recommendations.ts` 的
  // `expertTierGain` 同一份索引；這是社群主觀意見，不是賽事證據，`evidence`
  // 策略刻意不吃這項，避免跟策略名稱承諾的「最高賽事證據」互相混淆。
  const expertTierGain = expertPartRatingIndex
    ? members.reduce(
        (sum, member) =>
          sum +
          OCCUPYING_SLOT_KEYS.reduce((partSum, key) => {
            const partId = member.slots[key]
            if (!partId) return partSum
            return partSum + (expertPartRatingIndex.get(partId)?.rank ?? 0)
          }, 0),
        0,
      )
    : 0

  switch (strategy) {
    case 'aggressive':
      return average(axis('attack'))
    case 'stable':
      return average(axis('stability'))
    case 'beginner':
      return -average(members.map((m) => m.analysis.operationDifficulty ?? 100))
    case 'balanced':
      // 三個面向各取隊中最高值鼓勵角色互補；完整配置的實戰證據（含零件強度
      // fallback）與高手評級則作為次要加分，不能用零件類型分數蓋過賽場已驗證
      // 的組合。
      return (
        Math.max(...axis('attack')) +
        Math.max(...axis('stamina')) +
        Math.max(...axis('stability')) +
        competitiveEvidenceWithFallback +
        expertTierGain * EXPERT_TIER_WEIGHT
      )
    case 'evidence':
      return competitiveEvidence
    case 'vs_attack':
      return average(axis('defense')) + average(axis('burstResistance')) + competitiveEvidenceWithFallback * 0.35 + expertTierGain * EXPERT_TIER_WEIGHT
    case 'vs_stamina':
      return average(axis('attack')) + average(axis('burst')) + competitiveEvidenceWithFallback * 0.35 + expertTierGain * EXPERT_TIER_WEIGHT
  }
}
```

在 `EXPERT_TIER_WEIGHT` 常數定義下面加一行：

```ts
/** 第 50.3 節：零件拼湊推估的權重必須明確低於完整配置證據，初始值待第 50.6 節回測校準。 */
const PART_STRENGTH_FALLBACK_WEIGHT = 0.3
```

`SuggestDecksArgs` interface（`evidenceByCode`／`expertPartRatingIndex` 欄位附近）加：

```ts
  /** BeybladeHub 高手零件評級（X/SS/S），partId 索引，見 `catalog/tierLists.ts` 的 `getExpertPartRatingIndex()`。 */
  expertPartRatingIndex?: Map<string, ExpertPartRatingRank>
  /** 零件層級賽果聲量聚合，見 `catalog/partStrength.ts` 的 `getPartStrengthIndex()`；第 50 節。 */
  partStrengthIndex?: Map<string, PartStrengthEntry>
```

`suggestDecks()` 內部：解構時加 `partStrengthIndex`，兩個 `scoreDeck(...)` 呼叫點都補上第 4 個參數：

```ts
    candidateCap = DEFAULT_CANDIDATE_CAP,
    evidenceByCode,
    expertPartRatingIndex,
    partStrengthIndex,
  } = args
```

```ts
        rough.push({ indexes: [i, j, k], score: scoreDeck(strategy, members, expertPartRatingIndex, partStrengthIndex) })
```

```ts
      score: scoreDeck(strategy, validation.members, expertPartRatingIndex, partStrengthIndex),
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run tests/unit/deck.test.ts`
Expected: PASS，全部綠燈（含 Task 2、Task 3 新增的測試）。

- [ ] **Step 5: 跑 `npx tsc -b` 確認型別沒破**

Run: `npx tsc -b`
Expected: 無輸出（成功）。

- [ ] **Step 6: Commit**

```bash
git add src/domain/deck.ts tests/unit/deck.test.ts
git commit -m "feat: fall back to part-strength estimate when a deck member has no combo evidence"
```

---

## Task 4: `recommendations.ts` 的 `partStrengthGain`

**Files:**
- Modify: `src/domain/recommendations.ts`
- Test: `tests/unit/recommendations.test.ts`

**Interfaces:**
- Consumes: Task 2 的 `PartStrengthEntry`（`import type`）
- Produces: `PurchaseRecommendation.partStrengthGain: number`；`recommendNextProducts()` 新增 `partStrengthIndex?: Map<string, PartStrengthEntry>` 參數

這個訊號**獨立於** `deckScoreGain`（跟 `expertTierGain` 現在的設計一樣——`profile()` 內部呼叫 `suggestDecks()` 時不傳 `partStrengthIndex`，`deckScoreGain` 因此不受影響，維持既有測試「`expect(rated?.deckScoreGain).toBe(unrated?.deckScoreGain)`」那條的精神：每個訊號各自獨立顯示，不疊加進同一個數字）。

- [ ] **Step 1: 寫失敗測試**

在 `tests/unit/recommendations.test.ts` 頂部 import 加：

```ts
import type { PartStrengthEntry } from '../../src/catalog/partStrength.ts'
```

這條測試完全比照檔案裡既有「結構上完全等效的兩個商品，含高手評級零件的那個排名較高」那個測試（84～130 行）的結構——同一份 `bladeA/B/C`、`ratchetA/B/C`、`bitA/B/C` fixture，只是把 `bitD`／`expertTierByPartId` 換成新的 `bitE`／`partStrengthIndex`，加在同一個 `describe('下一包推薦', ...)` 區塊裡、緊接在那個測試之後：

```ts
it('結構上完全等效的兩個商品，零件強度分數較高的那個排名較高，且不影響 deckScoreGain', () => {
  const bitE = { ...part('bit-e', 'bit', 'attack'), code: 'Re', bitContact: 'flat' as const }
  const productWithStrongPart: Product = {
    id: 'z-with-strength', line: 'BX', category: 'starter', naming: { primaryZhTW: '有戰績固定包' }, region: ['JP'], isRandom: false,
    contents: [{ partId: bitA.id, quantity: 1 }], provenance,
  }
  const productWithoutStrength: Product = {
    id: 'a-without-strength', line: 'BX', category: 'starter', naming: { primaryZhTW: '無戰績固定包' }, region: ['JP'], isRandom: false,
    contents: [{ partId: bitE.id, quantity: 1 }], provenance,
  }
  const partStrengthIndex = new Map<string, PartStrengthEntry>([
    [bitA.id, { podiumAppearances: 40, percentileScore: 85 }],
  ])
  const result = recommendNextProducts({
    products: [productWithStrongPart, productWithoutStrength],
    variants: [],
    ownedProducts: [],
    parts: [bladeA, bladeB, bladeC, ratchetA, ratchetB, ratchetC, bitA, bitB, bitC, bitE],
    rules: [],
    lots: [lot(bladeA.id), lot(bladeB.id), lot(bladeC.id), lot(ratchetA.id), lot(ratchetB.id), lot(ratchetC.id), lot(bitB.id), lot(bitC.id)],
    combos: [],
    evidenceByCode: {
      'blade-a 1-60R': { appearances: 0, top4: 0, championships: 0, totalDecks: 0, sourceTier: 'community' },
      'blade-a 1-60Re': { appearances: 0, top4: 0, championships: 0, totalDecks: 0, sourceTier: 'community' },
    },
    partStrengthIndex,
  })
  expect(result.recommendations).toHaveLength(2)
  const rated = result.recommendations.find((row) => row.product.id === productWithStrongPart.id)
  const unrated = result.recommendations.find((row) => row.product.id === productWithoutStrength.id)
  expect(rated?.deckScoreGain).toBe(unrated?.deckScoreGain)
  expect(rated?.partStrengthGain).toBe(85)
  expect(unrated?.partStrengthGain).toBe(0)
  expect(rated?.rank).toBe(1)
  expect(rated?.reasonsZhTW.some((line) => line.includes('零件歷史戰績推估') && line.includes('進前三 40 次'))).toBe(true)
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/unit/recommendations.test.ts`
Expected: FAIL，`partStrengthGain` 是 `undefined` 或型別錯誤（欄位還不存在）。

- [ ] **Step 3: 實作**

在 `src/domain/recommendations.ts` 頂部 import 加：

```ts
import type { PartStrengthEntry } from '../catalog/partStrength.ts'
```

`PurchaseRecommendation` interface，在 `expertTierGain` 欄位下面加：

```ts
  /**
   * 這次購買新增零件在賽果紀錄裡的歷史戰績分數合計（零件層級百分位聚合，
   * 第 50 節）。是統計聚合不是賽事證據本身，排序上排在 `expertTierGain` 之後、
   * `deckScoreGain` 之前——比高手主觀評級更客觀（是計數不是意見），但比
   * `competitiveEvidenceGain` 弱得多（那是完整配置被賽事記錄過，這只是零件
   * 拼湊推估）。
   */
  partStrengthGain: number
```

`recommendNextProducts` 的參數物件，在 `expertTierByPartId` 那行下面加：

```ts
  /** 零件層級賽果聲量聚合，見 `catalog/partStrength.ts` 的 `getPartStrengthIndex()`；第 50 節。 */
  partStrengthIndex?: Map<string, PartStrengthEntry>
```

解構時加 `partStrengthIndex`（`const { products, variants, ownedProducts, parts, rules, lots, combos, evidenceByCode, expertTierByPartId, partStrengthIndex, limit = 5 } = args`）。

在 `ratedAddedParts`/`expertTierGain` 計算下面加：

```ts
    const partStrengthAddedParts = addedPartIds
      .map((partId) => ({ part: partById.get(partId), strength: partStrengthIndex?.get(partId) }))
      .filter((row): row is { part: Part; strength: PartStrengthEntry } => Boolean(row.part) && Boolean(row.strength))
    const partStrengthGain = partStrengthAddedParts.reduce((sum, row) => sum + row.strength.percentileScore, 0)
```

把 `isPureBreadth` 與早退的 `continue` 判斷式都加上 `partStrengthGain === 0`：

```ts
    const isPureBreadth = deckScoreGain === 0 && competitiveEvidenceGain === 0 && expertTierGain === 0 && partStrengthGain === 0 && unlocked.length > 0
    if (deckScoreGain === 0 && competitiveEvidenceGain === 0 && expertTierGain === 0 && partStrengthGain === 0 && unlocked.length === 0) continue
```

在 `ratedAddedParts.length > 0` 那個 `reasonsZhTW.push` 區塊之後加：

```ts
    if (partStrengthAddedParts.length > 0) {
      const detail = partStrengthAddedParts
        .map((row) => `${resolveDisplayName(row.part.naming).titleZhTW}（進前三 ${row.strength.podiumAppearances} 次，百分位 ${row.strength.percentileScore}）`)
        .join('、')
      reasonsZhTW.push(`零件歷史戰績推估（非完整配置實測）：${detail}。`)
    }
```

`recommendations.push({...})` 物件裡，`expertTierGain,` 那行下面加 `partStrengthGain,`。

排序比較式，在 `|| b.expertTierGain - a.expertTierGain` 下面加一行：

```ts
    || b.partStrengthGain - a.partStrengthGain
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run tests/unit/recommendations.test.ts`
Expected: PASS，全部綠燈。

- [ ] **Step 5: 跑 `npx tsc -b`**

Run: `npx tsc -b`
Expected: 無輸出。

- [ ] **Step 6: Commit**

```bash
git add src/domain/recommendations.ts tests/unit/recommendations.test.ts
git commit -m "feat: surface part-strength gain as an independent purchase-recommendation signal"
```

---

## Task 5: `DecksPage.tsx` 接入零件強度索引與前台文字

**Files:**
- Modify: `src/ui/pages/DecksPage.tsx`

**Interfaces:**
- Consumes: Task 2 的 `getPartStrengthIndex`、`PartStrengthEntry`；Task 3 的 `estimateComboPartStrength`

- [ ] **Step 1: import 與索引**

在 `import { getExpertPartRatingIndex } from '../../catalog/tierLists.ts'` 下面加：

```ts
import { getPartStrengthIndex } from '../../catalog/partStrength.ts'
```

`deck.ts` 的 import 區塊加入 `estimateComboPartStrength`：

```ts
import {
  DECK_STRATEGY_ZH,
  DEFAULT_DECK_RULES,
  estimateComboPartStrength,
  suggestDecks,
  validateDeck,
  type DeckStrategy,
} from '../../domain/deck.ts'
```

在 `const expertPartRatingIndex = useMemo(() => getExpertPartRatingIndex(), [])` 下面加：

```ts
  const partStrengthIndex = useMemo(() => getPartStrengthIndex(), [])
```

- [ ] **Step 2: 傳進 `suggestDecks()`**

`suggestions` 的 `useMemo` 呼叫，在 `expertPartRatingIndex,`（見既有 6.2 節加的那行）下面加：

```ts
        expertPartRatingIndex,
        partStrengthIndex,
      }),
    [candidates, parts, lots, combos, strategy, evidenceByCode, expertPartRatingIndex, partStrengthIndex],
```

（把既有的依賴陣列也加上 `partStrengthIndex`。）

- [ ] **Step 3: 前台文字三分法**

找到隊員卡片渲染那段（`member.analysis.evidence ? (...) : (...)` 那個三元判斷，在 `member.reasonZhTW` 之後）：

```tsx
{member.analysis.evidence ? (
  <div className="meta">完整配置賽事證據：出現 {member.analysis.evidence.appearances} 次</div>
) : (
  <div className="meta">尚無此完整配置的賽事證據，請視為模型候選並先實測。</div>
)}
```

改成三段：

```tsx
{member.analysis.evidence ? (
  <div className="meta">完整配置賽事證據：出現 {member.analysis.evidence.appearances} 次</div>
) : (() => {
  const fallback = estimateComboPartStrength(member.slots, partStrengthIndex)
  return fallback === undefined ? (
    <div className="meta">尚無此完整配置的賽事證據，請視為模型候選並先實測。</div>
  ) : (
    <div className="meta">零件歷史戰績推估（非完整配置實測）：分數 {Math.round(fallback)}</div>
  )
})()}
```

- [ ] **Step 4: 手動驗證**

Run: `npm run dev`，開 `/#/decks`，切到「均衡型」策略，確認每張隊員卡片顯示三種文字其中一種，沒有卡片同時顯示兩種或都不顯示。截圖工具（`npm run shots`）這輪不用重跑，留到 Task 6 完成後一次跑。

- [ ] **Step 5: Commit**

```bash
git add src/ui/pages/DecksPage.tsx
git commit -m "feat: wire part-strength index into DecksPage and differentiate evidence text"
```

---

## Task 6: `HomePage.tsx`／`RecommendationsPage.tsx` 接入零件強度索引

**Files:**
- Modify: `src/ui/pages/HomePage.tsx`
- Modify: `src/ui/pages/RecommendationsPage.tsx`

**Interfaces:**
- Consumes: Task 2 的 `getPartStrengthIndex`

- [ ] **Step 1: `HomePage.tsx`**

在 `import { getExpertPartRatingIndex } from '../../catalog/tierLists.ts'` 下面加：

```ts
import { getPartStrengthIndex } from '../../catalog/partStrength.ts'
```

在 `const expertTierByPartId = useMemo(() => getExpertPartRatingIndex(), [])` 下面加：

```ts
  const partStrengthIndex = useMemo(() => getPartStrengthIndex(), [])
```

`recommendNextProducts({...})` 呼叫裡 `expertTierByPartId,` 下面加 `partStrengthIndex,`；依賴陣列（第 105 行附近）也加上 `partStrengthIndex`。

- [ ] **Step 2: `RecommendationsPage.tsx`**

同樣的三處改動（import、`useMemo` 索引、`recommendNextProducts` 呼叫 + 依賴陣列）。

- [ ] **Step 3: 手動驗證**

Run: `npm run dev`，開首頁跟 `/#/recommendations`，確認頁面正常渲染、沒有 console error。

- [ ] **Step 4: Commit**

```bash
git add src/ui/pages/HomePage.tsx src/ui/pages/RecommendationsPage.tsx
git commit -m "feat: wire part-strength index into purchase recommendation pages"
```

---

## Task 7: 回測腳本，校準 fallback 權重

**Files:**
- Create: `scripts/backtestPartStrength.mjs`

**Interfaces:**
- Consumes: `stanyao-raw-records.json`
- Produces: console 報告（相關性／分組比較數字），不寫檔案

- [ ] **Step 1: 寫腳本**

```js
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
```

- [ ] **Step 2: 加進 `package.json` scripts**

```json
"backtest:part-strength": "node scripts/backtestPartStrength.mjs"
```

- [ ] **Step 3: 跑一次，人工判讀**

Run: `npm run backtest:part-strength`

人工看三組平均分數：
- 若第 1 名組明顯高於第 3 名組：在 `HANDOFF.md` 記下這個結果與具體數字，`PART_STRENGTH_FALLBACK_WEIGHT` 維持 0.3（或視差距大小小幅上調，上調前必須先跟使用者確認新數值，不得自己拍板）。
- 若三組接近或反直覺：在 `HANDOFF.md` 記下這個結果，**不得**自行調整權重掩蓋，改為回報使用者「這個訊號在目前資料上驗證不出前瞻性，要不要繼續用」，交由使用者決定去留。

- [ ] **Step 4: Commit**

```bash
git add scripts/backtestPartStrength.mjs package.json
git commit -m "feat: add time-split backtest for part-strength fallback weight"
```

---

## 收尾（跨任務，全部 Task 完成後才做一次）

- [ ] 跑 `npx tsc -b`，確認無錯誤。
- [ ] 跑 `npm test`，確認全套通過，記下實際筆數。
- [ ] 跑 `npm run test:e2e`，確認 87 通過、1 跳過（或記下實際數字，不得沿用舊數字）。
- [ ] 跑 `npm run shots`，phone + desktop 都跑，人工看 `phone-decks.png`／`phone-home.png` 確認新文字正常顯示、沒有 NaN／undefined。
- [ ] 更新 `HANDOFF.md`：這輪做了什麼、Task 7 回測的實際結論與數字、`PART_STRENGTH_FALLBACK_WEIGHT` 最終值與理由。
- [ ] `git push origin main`，接 `npm run deploy:pages`，再 `npm run test:live` 確認上線。
