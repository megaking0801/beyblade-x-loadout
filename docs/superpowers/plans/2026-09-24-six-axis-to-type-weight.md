# 六軸評估系統改成零件類型比重 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `analysis.ts` 的六軸假分數（`ComboScores`／`BASE_BY_TYPE`）換成誠實的
「零件類型比重」（`TypeWeight`：攻擊／防守／持久／均衡四個百分比，加總為 100），
並讓所有消費端（配裝器 UI、3on3 角色分工、排序、購買推薦、一句話結論）跟著改用
新介面。

**Architecture:** `analysis.ts` 的 `estimateTypeWeight()` 取代 `estimateScores()`，
直接把零件的 `type` 標籤按既有槽位權重（上蓋 0.5／軸心 0.3／固鎖 0.2）加權混合成
四個百分比，不再查一張手填的分數表。`ComboAnalysis.typeWeight?: TypeWeight` 取代
`scores?: ComboScores`。下游六個消費檔案（`builder.ts`／`buildableRows.ts`／
`deck.ts`／`recommendations.ts`／`reasons.ts`／`BuilderPage.tsx`）原本讀
`attack`／`stamina`／`stability` 三個軸的地方，`attack`／`stamina` 直接對應，
`stability` 改對應 `typeWeight.defense`（原本「穩定」軸的數值跟防守型最貼近，見
spec 第 3 節）；讀 `defense`／`burst`／`burstResistance` 的地方視情況併入
`typeWeight.defense`／`typeWeight.attack` 或整個移除。

**Tech Stack:** TypeScript、Vitest、既有 domain 純函式風格（無框架依賴）。

**Spec:** `docs/superpowers/specs/2026-09-24-six-axis-to-type-weight-design.md`

## Global Constraints

- 全程使用繁體中文溝通與所有前台文字；不得出現日文假名（`CLAUDE.md` 第 1.4 節）。
- 不得編造數據：沒有任何零件帶 `type` 資料時，`estimateTypeWeight()` 必須回傳
  `undefined`，不得回傳一個看起來像「均衡型」的假比重物件（spec 第 2 節、
  `CLAUDE.md` 第 1.5 節）。
- 四個類型比重（`attack`／`defense`／`stamina`／`balance`）任何情況下加總必須
  剛好等於 100，不能因四捨五入變成 99 或 101（spec 第 2 節）。
- 每個 Task 完成後跑 `npx tsc -b` + `npm test`（全套 Vitest 只要幾秒，見
  `CLAUDE.md`：便宜到沒理由跳過）；只跑改到的測試檔用
  `npm test -- tests/unit/xxx.test.ts` 先驗證單一 Task，最後一個 Task 再跑全套。
- 這是前台程式改動：全部 Task 完成後、上線前要跑 `npm run test:e2e` 然後
  `npm run shots`（順序不能反，`playwright test` 開跑會清掉 `test-results/`），
  確認過再 `git push` → `npm run deploy:pages` → `npm run test:live`。
- `TYPE_WEIGHT`（上蓋 0.5／軸心 0.3／固鎖 0.2 的槽位權重）維持原樣，不在這個計畫
  範圍內調整（spec 第 5 節已有結論，不用重新討論）。
- 新增的測試如果看起來「不管邏輯對不對都會過」，要做一次變異驗證：故意改壞實作
  確認測試會紅，再改回來確認變綠（`CLAUDE.md`）。

## Review Focus

- **四個類型比重加總不是剛好 100**：只有單一零件有類型資料時（例如上蓋 100%
  攻擊、固鎖軸心都沒類型資料）容易漏測，Task 1 要覆蓋這種「只有一顆零件貢獻
  權重」的邊界，不能只測三顆都有類型的情況。
- **`estimateTypeWeight()` 在完全沒有類型資料時錯誤地回傳假比重物件**，被 UI
  誤判成「這是均衡型」而不是「資料不足」——Task 1 要有一條測試直接呼叫
  `estimateTypeWeight({ extras: [] })`（三個槽位都不給）斷言回傳 `undefined`。
- **`vs_attack`／`vs_stamina` 策略拿掉重複軸後排序權重失衡**，導致「對攻擊」
  選出來的隊伍防守佔比反而不是最高——Task 4 要新增這兩個策略目前完全沒有的
  測試，鎖住「防守佔比最高的候選會被 vs_attack 選中」這個行為。
- **前台文字殘留「六軸」「分數」字眼**，讓使用者以為還是舊模型——Task 7 改完
  UI 文案後要跑一次 `npm run shots` 人工看圖確認，另外 `grep -rn "六軸" src/`
  要在最後一個 Task 裡跑一次確認乾淨（`buildEvidenceReasons` 等其他模組的舊
  comment 也要一起抓出來看是否需要更新）。
- **`buildComboVerdict()` 的差距門檻改壞**：原本 12 分的門檻是對著 0–100
  假分數校準的，百分比的分布特性不同，要各測一個「有明顯偏向」與「接近打平」
  的邊界案例，不能只延用舊數字沒驗證過。

---

## Task 1: `analysis.ts` — `TypeWeight` 資料模型

**Files:**
- Modify: `src/domain/analysis.ts:41-141`（`ComboScores`／`BASE_BY_TYPE`／
  `TYPE_WEIGHT`／`SCORE_AXES`／`AXIS_ZH`／`estimateScores`）
- Modify: `src/domain/analysis.ts:216-240`（`ComboAnalysis.scores` 欄位）
- Modify: `src/domain/analysis.ts:320-373`（`analyzeCombo()` 內組裝 `scores`／
  呼叫 `buildSynergyNotes`／`buildProsCons` 的地方）
- Modify: `src/domain/analysis.ts:396-425`（`buildSynergyNotes()`）
- Modify: `src/domain/analysis.ts:459-484`（`buildProsCons()`）
- Test: `tests/unit/analysis.test.ts`

**Interfaces:**
- Consumes: `Part.type?: BeyType`（`types.ts` 既有欄位，四種值
  `'attack' | 'defense' | 'stamina' | 'balance'`）、`EstimateArgs`（不變）。
- Produces（後續所有 Task 都依賴這組介面，符號要完全一致）：
  ```ts
  export interface TypeWeight {
    attack: number
    defense: number
    stamina: number
    balance: number
  }
  export function estimateTypeWeight(args: EstimateArgs): TypeWeight | undefined
  ```
  `ComboAnalysis.typeWeight?: TypeWeight`（取代原本的 `scores?: ComboScores`）。

- [ ] **Step 1: 改 `tests/unit/analysis.test.ts` 的類型分數測試，先讓它紅**

把第 5 行的 import 改名：

```ts
import {
  ESTIMATE_LABEL,
  analyzeCombo,
  estimateTypeWeight,
  type AnalyzeArgs,
} from '../../src/domain/analysis.ts'
```

把第 210–239 行（原本的「攻擊型配裝的攻擊分數高於持久型」等 4 個 it）整段換成：

```ts
  it('攻擊型配裝的攻擊比重高於持久型', () => {
    const attack = estimateTypeWeight({ blade: attackBlade, ratchet: ratchetLow, bit: bitFlat, extras: [] })
    const stamina = estimateTypeWeight({ blade: staminaBlade, ratchet: ratchetHigh, bit: bitBall, extras: [] })
    expect(attack!.attack).toBeGreaterThan(stamina!.attack)
    expect(stamina!.stamina).toBeGreaterThan(attack!.stamina)
  })

  it('防守型配裝的防守比重高於攻擊型', () => {
    const defense = estimateTypeWeight({ blade: defenseBlade, ratchet: ratchetHigh, bit: bitBall, extras: [] })
    const attack = estimateTypeWeight({ blade: attackBlade, ratchet: ratchetLow, bit: bitFlat, extras: [] })
    expect(defense!.defense).toBeGreaterThan(attack!.defense)
  })

  it('重量不影響比重：同類型只差重量的兩顆上蓋比重相同', () => {
    // 來源只有單顆實測值，同款零件的個體差異常比配裝差異還大，
    // 拿去加減分數是把雜訊當訊號，所以模型刻意不看重量。
    const heavy = estimateTypeWeight({ blade: heavyBlade, ratchet: ratchetLow, bit: bitBall, extras: [] })
    const light = estimateTypeWeight({ blade: lightBlade, ratchet: ratchetLow, bit: bitBall, extras: [] })
    expect(heavy).toEqual(light)
  })

  it('四個類型比重都落在 0 到 100 之間、且加總剛好是 100', () => {
    for (const weight of [
      estimateTypeWeight({ blade: heavyBlade, ratchet: ratchetLow, bit: bitRubber, extras: [] }),
      estimateTypeWeight({ blade: lightBlade, ratchet: ratchetHigh, bit: bitBall, extras: [] }),
      // 只有一顆零件帶類型資料（固鎖軸心都沒類型）：加權混合的邊界情況，
      // 容易漏測「只有一份權重貢獻」時還能不能湊出剛好 100。
      estimateTypeWeight({ blade: attackBlade, extras: [] }),
    ]) {
      expect(weight).toBeDefined()
      let sum = 0
      for (const value of Object.values(weight!)) {
        expect(value).toBeGreaterThanOrEqual(0)
        expect(value).toBeLessThanOrEqual(100)
        sum += value
      }
      expect(sum).toBe(100)
    }
  })

  it('沒有任何零件帶官方類型資料時回傳 undefined，不得假裝算得出均衡型', () => {
    expect(estimateTypeWeight({ extras: [] })).toBeUndefined()
  })
```

把第 341、401、417 行的 `r.scores` 改成 `r.typeWeight`（三處，含
`toBeUndefined()`／`toBeUndefined()`／`toBeDefined()`，前後文字不變）。

- [ ] **Step 2: 跑測試確認紅**

Run: `npm test -- tests/unit/analysis.test.ts`
Expected: FAIL —— `estimateTypeWeight` 不存在（`analysis.ts` 還沒 export 這個
名字），以及 `r.typeWeight` 讀不到值（`ComboAnalysis` 還沒有這個欄位）。

- [ ] **Step 3: 改 `src/domain/analysis.ts` 的資料模型與估算函式**

把第 41–141 行（從 `export interface ComboScores` 到 `estimateScores()` 結尾）
整段換成：

```ts
export interface TypeWeight {
  attack: number
  defense: number
  stamina: number
  balance: number
}

/** 各槽位在類型混合時的權重。 */
const TYPE_WEIGHT = { blade: 0.5, bit: 0.3, ratchet: 0.2 } as const

const TYPE_WEIGHT_CATEGORIES: BeyType[] = ['attack', 'defense', 'stamina', 'balance']

const TYPE_WEIGHT_ZH: Record<BeyType, string> = {
  attack: '攻擊',
  defense: '防守',
  stamina: '持久',
  balance: '均衡',
}

function clampScore(value: number): number {
  return Math.round(Math.min(100, Math.max(0, value)))
}

/**
 * 把四個不一定剛好加總為 100 的原始百分比，用最大餘數法分配成整數且保證
 * 加總剛好是 100（不會因為各自四捨五入變成 99 或 101，也不會有負值）。
 */
function distributeToHundred(raw: Record<BeyType, number>): TypeWeight {
  const floors = TYPE_WEIGHT_CATEGORIES.map((type) => Math.floor(raw[type]))
  const remainders = TYPE_WEIGHT_CATEGORIES.map((type, index) => raw[type] - floors[index]!)
  const leftover = 100 - floors.reduce((sum, value) => sum + value, 0)
  const order = TYPE_WEIGHT_CATEGORIES.map((_, index) => index).sort(
    (a, b) => remainders[b]! - remainders[a]!,
  )
  const result = [...floors]
  for (let i = 0; i < leftover; i++) result[order[i]!] += 1
  return {
    attack: result[0]!,
    defense: result[1]!,
    stamina: result[2]!,
    balance: result[3]!,
  }
}

export interface EstimateArgs {
  blade?: Part
  ratchet?: Part
  bit?: Part
  /** CX 的鎖定紋章與輔助戰刃等額外零件。 */
  extras: Part[]
}

/**
 * 依零件官方類型估算「零件類型比重」（不是強度分數）。
 *
 * 直接把零件本身的 `type` 標籤按槽位權重（上蓋 0.5／軸心 0.3／固鎖 0.2）加權
 * 混合，是零件真實組成的比例，不是編出來的分數——舊版 `BASE_BY_TYPE` 對四種
 * 類型各手填一組六個數字，被驗算出攻擊型系統性排最後（見規格第 50.5 節），
 * 已經整個拔除。
 *
 * 高度、重量、CX 槽位權重都不進這個估算，理由跟舊版相同：重量的個體差異比
 * 配裝差異還大（見下方 `buildSynergyNotes` 的說明），高度要配合對手配置與
 * 盤型才有意義，不能被偷偷塞進單一數字。
 */
export function estimateTypeWeight(args: EstimateArgs): TypeWeight | undefined {
  const { blade, ratchet, bit, extras } = args
  const typed: { type: BeyType; weight: number }[] = []
  if (blade?.type) typed.push({ type: blade.type, weight: TYPE_WEIGHT.blade })
  if (bit?.type) typed.push({ type: bit.type, weight: TYPE_WEIGHT.bit })
  if (ratchet?.type) typed.push({ type: ratchet.type, weight: TYPE_WEIGHT.ratchet })
  for (const extra of extras) {
    if (extra.type) typed.push({ type: extra.type, weight: TYPE_WEIGHT.blade })
  }

  const totalWeight = typed.reduce((sum, row) => sum + row.weight, 0)
  if (totalWeight === 0) return undefined

  const raw: Record<BeyType, number> = { attack: 0, defense: 0, stamina: 0, balance: 0 }
  for (const row of typed) raw[row.type] += (100 * row.weight) / totalWeight

  return distributeToHundred(raw)
}
```

（`clampScore` 搬到這裡但保留給下面 `estimateOperationDifficulty()` 用，不要
刪掉——它跟類型比重無關，是操作難度自己的 0–100 夾限。）

- [ ] **Step 4: 改 `ComboAnalysis` 介面與 `analyzeCombo()` 組裝邏輯**

第 216–240 行的 `ComboAnalysis` 介面裡，把：

```ts
  /**
   * 第 20 節 B：無法安裝、或缺少官方類型資料時都不提供分數。
   * 官方沒公布的東西不補值，寧可顯示資料不足（第 1.5、49 節）。
   */
  scores?: ComboScores
```

改成：

```ts
  /**
   * 第 20 節 B：無法安裝、或缺少官方類型資料時都不提供類型比重。
   * 官方沒公布的東西不補值，寧可顯示資料不足（第 1.5、49 節）。
   */
  typeWeight?: TypeWeight
```

第 320–373 行 `analyzeCombo()` 內部，把：

```ts
  const canEstimate = compatibility.ok && Boolean(blade?.type)
  const scores = canEstimate ? estimateScores({ blade, ratchet, bit, extras }) : undefined
  const operationDifficulty = estimateOperationDifficulty(bit, ratchet, blade)
  const synergyNotesZhTW = buildSynergyNotes({ blade, ratchet, bit, scores, spinDirectionZhTW })
```

改成：

```ts
  const canEstimate = compatibility.ok && Boolean(blade?.type)
  const typeWeight = canEstimate ? estimateTypeWeight({ blade, ratchet, bit, extras }) : undefined
  const operationDifficulty = estimateOperationDifficulty(bit, ratchet, blade)
  const synergyNotesZhTW = buildSynergyNotes({ blade, ratchet, bit, typeWeight, spinDirectionZhTW })
```

同一個函式再往下，把：

```ts
  const { prosZhTW, consZhTW } = buildProsCons({ scores, synergyNotesZhTW, operationDifficulty })

  return {
    system,
    fullNameZhTW,
    fullCode,
    typeZhTW,
    compatibility,
    objective,
    ...(scores ? { scores } : {}),
```

改成：

```ts
  const { prosZhTW, consZhTW } = buildProsCons({ typeWeight, synergyNotesZhTW, operationDifficulty })

  return {
    system,
    fullNameZhTW,
    fullCode,
    typeZhTW,
    compatibility,
    objective,
    ...(typeWeight ? { typeWeight } : {}),
```

（其餘欄位不動。）

- [ ] **Step 5: 改 `buildSynergyNotes()` 與 `buildProsCons()`**

第 396–425 行整段換成：

```ts
function buildSynergyNotes(args: {
  blade?: Part
  ratchet?: Part
  bit?: Part
  typeWeight?: TypeWeight
  spinDirectionZhTW?: string
}): string[] {
  const { blade, ratchet, typeWeight, spinDirectionZhTW } = args
  const notes: string[] = []
  const heightCode = ratchet?.heightCode

  if (typeof heightCode === 'number') {
    notes.push(`高度碼 ${heightCode}：需在對手完整配置與盤型中判讀，不單獨換算成強度。`)
  }

  if (blade?.type === 'attack') notes.push('攻擊角度偏斜向撞擊，適合主動找對手')
  if (blade?.type === 'stamina') notes.push('持久協同：低耗損接地配上持久上蓋，適合拖時間')
  if (blade?.type === 'defense') notes.push('防守協同：重心集中，適合承受撞擊')

  if (typeWeight) {
    if (typeWeight.stamina >= 70) notes.push('持久協同良好')
    if (typeWeight.defense >= 70) notes.push('防守協同良好')
  }

  if (spinDirectionZhTW && spinDirectionZhTW !== '雙旋') {
    notes.push(`左右旋對位：本配置為${spinDirectionZhTW}，對上反向旋轉時吸力表現會不同`)
  }

  return notes
}
```

第 459–484 行（`buildProsCons`）整段換成：

```ts
function buildProsCons(args: {
  typeWeight?: TypeWeight
  synergyNotesZhTW: string[]
  operationDifficulty?: number
}): { prosZhTW: string[]; consZhTW: string[] } {
  const { typeWeight, synergyNotesZhTW, operationDifficulty } = args
  const prosZhTW: string[] = []
  const consZhTW: string[] = []
  if (!typeWeight) return { prosZhTW, consZhTW }

  const sorted = [...TYPE_WEIGHT_CATEGORIES].sort((a, b) => typeWeight[b] - typeWeight[a])
  const best = sorted[0]!
  const worst = sorted[sorted.length - 1]!
  prosZhTW.push(`${TYPE_WEIGHT_ZH[best]}型佔比最高（${typeWeight[best]}%，${ESTIMATE_LABEL}）`)
  consZhTW.push(`${TYPE_WEIGHT_ZH[worst]}型佔比最低（${typeWeight[worst]}%，${ESTIMATE_LABEL}）`)

  if (operationDifficulty !== undefined) {
    if (operationDifficulty >= 70) consZhTW.push('操作難度偏高，需要練發射')
    else prosZhTW.push('操作難度不高，新手也好上手')
  }

  const scrape = synergyNotesZhTW.find((note) => note.includes('刮地'))
  if (scrape) consZhTW.push(scrape)

  return { prosZhTW, consZhTW }
}
```

- [ ] **Step 6: 跑測試確認變綠**

Run: `npm test -- tests/unit/analysis.test.ts`
Expected: PASS，全部通過。

- [ ] **Step 7: `tsc` 確認沒有型別錯誤殘留（下游檔案這時還沒改，預期會報錯，先記錄不用修）**

Run: `npx tsc -b`
Expected: `builder.ts`／`deck.ts`／`recommendations.ts`／`buildableRows.ts`／
`reasons.ts`／`BuilderPage.tsx` 會報找不到 `estimateScores`／`ComboScores`／
`.scores` 之類的錯誤——這是預期的，後面幾個 Task 會逐一修掉，這裡只是確認
Task 1 本身沒有引入新的型別問題（錯誤訊息裡不該出現 `analysis.ts` 自己的檔名）。

- [ ] **Step 8: Commit**

```bash
git add src/domain/analysis.ts tests/unit/analysis.test.ts
git commit -m "$(cat <<'EOF'
refactor: replace six-axis ComboScores with TypeWeight percentages

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `builder.ts` — 排序改用 `TypeWeight`

**Files:**
- Modify: `src/domain/builder.ts:7-14`（import）
- Modify: `src/domain/builder.ts:76-103`（`partAxisRank`／`AXIS_BASE`）
- Modify: `src/domain/builder.ts:219-235`（`sortValue`）
- Modify: `src/domain/builder.ts:296-328`（`cheapSortValue`）
- Test: `tests/unit/builder.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `estimateTypeWeight`、`TypeWeight`、
  `ComboAnalysis.typeWeight?: TypeWeight`。
- Produces：`BuildableSortKey` 維持原本 6 個值不變
  （`'beginner' | 'attack' | 'stamina' | 'stability' | 'evidence' | 'simplest'`），
  下游 `buildableRows.ts`／`recommendations.ts`／`DecksPage.tsx` 都是照這組字面值
  呼叫，這次不改動這個型別本身。

- [ ] **Step 1: 改 `tests/unit/builder.test.ts`，先讓它紅**

第 17 行的 `parts` 陣列目前只有攻擊型與持久型的上蓋（`bladeAttack`／
`bladeStamina`），沒有防守型，會讓「最穩排序」的新測試在防守佔比全部是 0 的
情況下變成怎麼寫都會過的假綠燈。在第 18 行後面加一顆防守型上蓋，並把它加進
`parts` 陣列：

```ts
const bladeAttack = part({ id: 'b-atk', family: 'blade', type: 'attack', spinDirection: 'right', officialWeightG: 34 })
const bladeStamina = part({ id: 'b-sta', family: 'blade', type: 'stamina', spinDirection: 'right', officialWeightG: 34 })
const bladeDefense = part({ id: 'b-def', family: 'blade', type: 'defense', spinDirection: 'right', officialWeightG: 34 })
const bladeLeft = part({ id: 'b-left', family: 'blade', type: 'attack', spinDirection: 'left', officialWeightG: 34 })
```

第 28 行的 `parts` 陣列加入 `bladeDefense`：

```ts
const parts: Part[] = [bladeAttack, bladeStamina, bladeDefense, bladeLeft, ratchet60, ratchet80, bitFlat, bitBall, bitRightOnly]
```

第 171–197 行（`排序方式` describe block 開頭到「最穩排序」測試結尾）換成：

```ts
describe('排序方式（第 29 節）', () => {
  const lots = [
    lot(bladeAttack.id),
    lot(bladeStamina.id),
    lot(bladeDefense.id),
    lot(ratchet60.id),
    lot(ratchet80.id),
    lot(bitFlat.id),
    lot(bitBall.id),
  ]

  it('攻擊最高排序時第一名的攻擊比重最高', () => {
    const r = generateBuildableCombos({ ...baseArgs, lots, mode: 'owned', sortBy: 'attack' })
    const weights = r.map((row) => row.analysis.typeWeight?.attack ?? 0)
    expect(weights[0]).toBe(Math.max(...weights))
  })

  it('持久最高排序時第一名的持久比重最高', () => {
    const r = generateBuildableCombos({ ...baseArgs, lots, mode: 'owned', sortBy: 'stamina' })
    const weights = r.map((row) => row.analysis.typeWeight?.stamina ?? 0)
    expect(weights[0]).toBe(Math.max(...weights))
  })

  it('最穩排序時第一名的防守比重最高', () => {
    // bladeDefense 是這批 fixture 裡唯一的防守型零件，用它確認「最穩」真的是
    // 依防守比重排序，不是巧合排第一（原本的 fixture 沒有防守型零件，會讓
    // 這條測試不管邏輯對不對都過）。
    const r = generateBuildableCombos({ ...baseArgs, lots, mode: 'owned', sortBy: 'stability' })
    const weights = r.map((row) => row.analysis.typeWeight?.defense ?? 0)
    expect(weights[0]).toBe(Math.max(...weights))
    expect(weights[0]).toBeGreaterThan(0)
  })
```

（後面「最適合新手」「賽事證據」「上限參數」幾個 it 保持原樣不動，緊接著同一個
describe block 結尾的 `})` 也不動。）

- [ ] **Step 2: 跑測試確認紅**

Run: `npm test -- tests/unit/builder.test.ts`
Expected: FAIL —— `row.analysis.typeWeight` 目前還是 `undefined`
（`builder.ts` 呼叫的還是舊的 `estimateScores`／`.scores`，Task 1 已經把
`analysis.ts` 改掉，所以這裡型別對不上、執行期讀不到值）。

- [ ] **Step 3: 改 `src/domain/builder.ts`**

第 7–14 行的 import 把 `estimateScores` 改成 `estimateTypeWeight`：

```ts
import {
  analyzeCombo,
  comboFullCode,
  estimateOperationDifficulty,
  estimateTypeWeight,
  type ComboAnalysis,
  type EvidenceInput,
} from './analysis.ts'
```

第 76–103 行（`partAxisRank` 到 `AXIS_BASE` 結尾）整段換成：

```ts
/**
 * 單一零件在指定排序軸上的相對優劣，用來決定剪枝時先留哪些。
 *
 * 只需要「這顆零件的類型是不是目標軸想要的類型」，不需要一組虛構的相對大小
 * 關係——舊版 `AXIS_BASE` 手填一張「攻擊型零件對持久排序值多少分」的表，跟
 * `BASE_BY_TYPE` 犯的是同一種錯：沒有來源。二元判斷加上零件代號當 tie-break
 * 已經足夠決定剪枝時先留哪些。
 */
function partAxisRank(part: Part, sortBy: BuildableSortKey): number {
  if (sortBy === 'beginner' || sortBy === 'simplest') {
    // 新手取向：先留有資料的、操作簡單的（球狀、尖點）。
    const difficulty = part.bitContact ? (DIFFICULTY_HINT[part.bitContact] ?? 50) : 50
    return difficulty
  }
  if (!part.type) return 1
  const wantedType = AXIS_WANTED_TYPE[sortBy]
  if (!wantedType) return 1
  return part.type === wantedType ? 0 : 1
}

/** 排序軸對應「最想要的零件類型」，用於剪枝時的二元判斷。 */
const AXIS_WANTED_TYPE: Partial<Record<BuildableSortKey, Part['type']>> = {
  attack: 'attack',
  stamina: 'stamina',
  stability: 'defense',
}
```

第 219–235 行（`sortValue`）換成：

```ts
function sortValue(row: BuildableCombo, sortBy: BuildableSortKey): number {
  const { analysis } = row
  switch (sortBy) {
    case 'attack':
      return -(analysis.typeWeight?.attack ?? -1)
    case 'stamina':
      return -(analysis.typeWeight?.stamina ?? -1)
    case 'stability':
      return -(analysis.typeWeight?.defense ?? -1)
    case 'evidence':
      return -(analysis.evidence?.appearances ?? -1)
    case 'beginner':
    case 'simplest':
      // 沒有操作難度資料的配置排最後，不假裝它簡單。
      return analysis.operationDifficulty ?? Number.POSITIVE_INFINITY
  }
}
```

第 296–328 行（`cheapSortValue`）換成：

```ts
/**
 * 便宜的排序值，與 sortValue 使用同一組公式（estimateTypeWeight／操作難度），
 * 所以先用它挑出前幾名、再對勝出者做完整分析，排序結果不會跟著跑掉。
 */
function cheapSortValue(
  slotParts: SlotParts,
  sortBy: BuildableSortKey,
  evidenceByCode: Record<string, EvidenceInput> | undefined,
): number {
  if (sortBy === 'evidence') {
    if (!evidenceByCode) return 1
    const code = standardCode(slotParts)
    const appearances = code ? evidenceByCode[code]?.appearances : undefined
    return -(appearances ?? -1)
  }

  if (sortBy === 'beginner' || sortBy === 'simplest') {
    const difficulty = estimateOperationDifficulty(slotParts.bit, slotParts.ratchet, slotParts.blade)
    return difficulty ?? Number.POSITIVE_INFINITY
  }

  if (!slotParts.blade?.type) return 1
  const weight = estimateTypeWeight({
    ...(slotParts.blade ? { blade: slotParts.blade } : {}),
    ...(slotParts.ratchet ? { ratchet: slotParts.ratchet } : {}),
    ...(slotParts.bit ? { bit: slotParts.bit } : {}),
    extras: slotParts.extras,
  })
  switch (sortBy) {
    case 'attack':
      return -(weight?.attack ?? 0)
    case 'stamina':
      return -(weight?.stamina ?? 0)
    case 'stability':
      return -(weight?.defense ?? 0)
  }
}
```

- [ ] **Step 4: 跑測試確認變綠**

Run: `npm test -- tests/unit/builder.test.ts`
Expected: PASS，全部通過。

- [ ] **Step 5: `tsc` 確認 `builder.ts` 本身沒有新的型別錯誤**

Run: `npx tsc -b`
Expected: `deck.ts`／`recommendations.ts`／`buildableRows.ts`／`reasons.ts`／
`BuilderPage.tsx` 仍會報錯（還沒改到），但錯誤訊息裡不該再出現
`src/domain/builder.ts`。

- [ ] **Step 6: Commit**

```bash
git add src/domain/builder.ts tests/unit/builder.test.ts
git commit -m "$(cat <<'EOF'
refactor: builder.ts sorting uses TypeWeight instead of ComboScores

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `buildableRows.ts` — 「我能組什麼」列表顯示

**Files:**
- Modify: `src/domain/buildableRows.ts:40-46`
- Test: `tests/unit/buildableRows.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `ComboAnalysis.typeWeight?: TypeWeight`。
- Produces：`describeSortMetric()` 的回傳形狀（`SortMetricView`）不變，這個
  Task 只改內部怎麼取值。

- [ ] **Step 1: 改 `tests/unit/buildableRows.test.ts`，先讓它紅**

第 26–33 行的 `scores` 假資料換成：

```ts
const typeWeight = {
  attack: 62,
  defense: 15,
  stamina: 8,
  balance: 15,
}
```

第 35–44 行那個 it 換成：

```ts
  it('依排序顯示對應的那一軸並畫條', () => {
    const r = describeSortMetric(analysis({ typeWeight }), 'attack')
    expect(r).toEqual({
      labelZhTW: '攻',
      valueZhTW: '62',
      percent: 62,
      color: 'var(--type-attack)',
    })
  })
```

第 46–52 行那個 it 換成：

```ts
  it('沒有類型比重時寫「資料不足」，而且不畫條', () => {
    const r = describeSortMetric(analysis({}), 'attack')
    expect(r.valueZhTW).toBe('資料不足')
    expect(r.percent).toBeUndefined()
    // 沒有比例就不該有顏色，否則畫面上會出現一條長度未定的色條。
    expect(r.color).toBeUndefined()
  })
```

第 54–59 行那個 it（操作難度不畫條）把 `scores` 參數換成 `typeWeight`：

```ts
  it('操作難度不畫條：越低越好，畫出來會跟數字互相矛盾', () => {
    const r = describeSortMetric(analysis({ operationDifficulty: 20, typeWeight }), 'simplest')
    expect(r.labelZhTW).toBe('操作難度')
    expect(r.valueZhTW).toBe('20')
    expect(r.percent).toBeUndefined()
  })
```

再加一條「最穩」的測試（目前完全沒有覆蓋這個 case）：

```ts
  it('最穩排序顯示防守比重並畫條', () => {
    const r = describeSortMetric(analysis({ typeWeight }), 'stability')
    expect(r).toEqual({
      labelZhTW: '穩',
      valueZhTW: '15',
      percent: 15,
      color: 'var(--type-defense)',
    })
  })
```

- [ ] **Step 2: 跑測試確認紅**

Run: `npm test -- tests/unit/buildableRows.test.ts`
Expected: FAIL —— `analysis({ typeWeight })` 目前這個欄位在 `ComboAnalysis`
型別上還沒有對到 `describeSortMetric` 讀的地方（`describeSortMetric` 還在讀
`analysis.scores`）。

- [ ] **Step 3: 改 `src/domain/buildableRows.ts`**

第 40–46 行換成：

```ts
  switch (sortBy) {
    case 'attack':
      return axis('攻', analysis.typeWeight?.attack, 'var(--type-attack)')
    case 'stamina':
      return axis('久', analysis.typeWeight?.stamina, 'var(--type-stamina)')
    case 'stability':
      return axis('穩', analysis.typeWeight?.defense, 'var(--type-defense)')
```

（`case 'beginner': case 'simplest':` 與 `case 'evidence':` 兩段不動。）

- [ ] **Step 4: 跑測試確認變綠**

Run: `npm test -- tests/unit/buildableRows.test.ts`
Expected: PASS，全部通過。

- [ ] **Step 5: Commit**

```bash
git add src/domain/buildableRows.ts tests/unit/buildableRows.test.ts
git commit -m "$(cat <<'EOF'
refactor: buildableRows.ts sort metric display uses TypeWeight

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `deck.ts` — 3on3 角色分工與隊伍策略

**Files:**
- Modify: `src/domain/deck.ts:220-303`（`assignRoles`、`validateDeck` 裡的警告判斷）
- Modify: `src/domain/deck.ts:384-450`（`scoreDeck`）
- Test: `tests/unit/deck.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `ComboAnalysis.typeWeight?: TypeWeight`。
- Produces：`assignRoles`／`scoreDeck` 的對外簽名不變，只改內部取值方式。

- [ ] **Step 1: 改 `tests/unit/deck.test.ts`，先讓它紅**

第 250–257 行（「最暴力策略不會選到比最穩定策略更低的平均攻擊分數」）把
`m.analysis.scores?.attack` 改成 `m.analysis.typeWeight?.attack`：

```ts
  it('最暴力策略不會選到比最穩定策略更低的平均攻擊比重', () => {
    const args = { candidates, parts, lots: fullStock, combos: [], ruleSet: DEFAULT_DECK_RULES }
    const aggressive = suggestDecks({ ...args, strategy: 'aggressive' })[0]!
    const stable = suggestDecks({ ...args, strategy: 'stable' })[0]!
    const avgAttack = (deck: typeof aggressive) =>
      deck.validation.members.reduce((s, m) => s + (m.analysis.typeWeight?.attack ?? 0), 0) / 3
    expect(avgAttack(aggressive)).toBeGreaterThanOrEqual(avgAttack(stable))
  })
```

在同一個 `describe('3on3 推薦（第 32 節推薦模式）'` block 裡（緊接著上面那個
it 之後），新增兩條目前完全沒有測過的策略：

```ts
  it('對攻擊策略選出的隊伍，平均防守比重不會低於對持久策略', () => {
    // vs_attack 想找「防守佔比高」的隊伍去對付攻擊型對手；防守型零件只有
    // b-def／bit-p，避免測試在候選池碰巧沒有防守型配置時變成沒有鑑別力的假測試。
    const args = { candidates, parts, lots: fullStock, combos: [], ruleSet: DEFAULT_DECK_RULES }
    const vsAttack = suggestDecks({ ...args, strategy: 'vs_attack' })[0]!
    const vsStamina = suggestDecks({ ...args, strategy: 'vs_stamina' })[0]!
    const avgDefense = (deck: typeof vsAttack) =>
      deck.validation.members.reduce((s, m) => s + (m.analysis.typeWeight?.defense ?? 0), 0) / 3
    expect(avgDefense(vsAttack)).toBeGreaterThanOrEqual(avgDefense(vsStamina))
  })

  it('對持久策略選出的隊伍，平均攻擊比重不會低於對攻擊策略', () => {
    const args = { candidates, parts, lots: fullStock, combos: [], ruleSet: DEFAULT_DECK_RULES }
    const vsAttack = suggestDecks({ ...args, strategy: 'vs_attack' })[0]!
    const vsStamina = suggestDecks({ ...args, strategy: 'vs_stamina' })[0]!
    const avgAttack = (deck: typeof vsAttack) =>
      deck.validation.members.reduce((s, m) => s + (m.analysis.typeWeight?.attack ?? 0), 0) / 3
    expect(avgAttack(vsStamina)).toBeGreaterThanOrEqual(avgAttack(vsAttack))
  })
```

- [ ] **Step 2: 跑測試確認紅**

Run: `npm test -- tests/unit/deck.test.ts`
Expected: FAIL —— `m.analysis.typeWeight` 目前讀不到值（`deck.ts` 還在用
`.scores`），新加的兩條 vs_attack／vs_stamina 測試也會因為同樣原因紅。

- [ ] **Step 3: 改 `src/domain/deck.ts` 的 `assignRoles()` 與相關警告判斷**

第 220–225 行（`validateDeck` 裡的警告判斷）把：

```ts
  const members = structurallyValid ? assignRoles(slotsList, analyses) : []
  if (members.length > 0 && members.every((member) => !member.analysis.scores)) {
```

改成：

```ts
  const members = structurallyValid ? assignRoles(slotsList, analyses) : []
  if (members.length > 0 && members.every((member) => !member.analysis.typeWeight)) {
```

第 236–303 行（`assignRoles` 全函式）裡的三段 `pick(...)` 與 `reasonFor(...)`
呼叫，把：

```ts
  const attacker = pick(
    (a, b) => (b.analysis.scores?.attack ?? -1) - (a.analysis.scores?.attack ?? -1),
  )
  if (attacker) {
    members.push({
      ...attacker,
      roleZhTW: '主攻',
      reasonZhTW: reasonFor(attacker.analysis.scores?.attack, '攻擊', '負責主動撞擊'),
    })
  }

  const stamina = pick(
    (a, b) => (b.analysis.scores?.stamina ?? -1) - (a.analysis.scores?.stamina ?? -1),
  )
  if (stamina) {
    members.push({
      ...stamina,
      roleZhTW: '持久',
      reasonZhTW: reasonFor(stamina.analysis.scores?.stamina, '持久', '負責拖時間比轉久'),
    })
  }

  const stable = pick(
    (a, b) => (b.analysis.scores?.stability ?? -1) - (a.analysis.scores?.stability ?? -1),
  )
  if (stable) {
    members.push({
      ...stable,
      roleZhTW: '穩定／抗攻',
      reasonZhTW: reasonFor(stable.analysis.scores?.stability, '穩定', '負責接下對手的攻擊'),
    })
  }
```

改成：

```ts
  const attacker = pick(
    (a, b) => (b.analysis.typeWeight?.attack ?? -1) - (a.analysis.typeWeight?.attack ?? -1),
  )
  if (attacker) {
    members.push({
      ...attacker,
      roleZhTW: '主攻',
      reasonZhTW: reasonFor(attacker.analysis.typeWeight?.attack, '攻擊型佔比', '負責主動撞擊'),
    })
  }

  const stamina = pick(
    (a, b) => (b.analysis.typeWeight?.stamina ?? -1) - (a.analysis.typeWeight?.stamina ?? -1),
  )
  if (stamina) {
    members.push({
      ...stamina,
      roleZhTW: '持久',
      reasonZhTW: reasonFor(stamina.analysis.typeWeight?.stamina, '持久型佔比', '負責拖時間比轉久'),
    })
  }

  const stable = pick(
    (a, b) => (b.analysis.typeWeight?.defense ?? -1) - (a.analysis.typeWeight?.defense ?? -1),
  )
  if (stable) {
    members.push({
      ...stable,
      roleZhTW: '穩定／抗攻',
      reasonZhTW: reasonFor(stable.analysis.typeWeight?.defense, '防守型佔比', '負責接下對手的攻擊'),
    })
  }
```

`reasonFor()` 這個 helper（第 250–257 行）本身的邏輯不用改，它組出的句子會
變成「攻擊型佔比 80 分為隊中最高，負責主動撞擊（模型推估）」——後面 Task 7
會確認前台顯示時要不要把「分」改成「%」，這裡先只改資料來源，文案微調留給
Task 7 統一處理（`reasonFor` 目前字串是 `${axisZhTW} ${score} 分為隊中最高`，
Task 7 會加上一條 e2e 檢查含 `%` 文字）。

- [ ] **Step 4: 改 `scoreDeck()`**

第 384–450 行整段換成：

```ts
export function scoreDeck(
  strategy: DeckStrategy,
  members: DeckMember[],
  expertPartRatingIndex?: Map<string, ExpertPartRatingRank>,
  partStrengthIndex?: Map<string, PartStrengthEntry>,
): number {
  const weights = members.map((m) => m.analysis.typeWeight)
  const axis = (key: 'attack' | 'defense' | 'stamina' | 'balance') =>
    weights.map((w) => w?.[key] ?? 0)
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
    // 只墊高會輸給 fallback 上限的真實百分位，不是無條件套用固定樓層值，
    // 這樣兩個都已經贏過上限的真實 evidence 之間仍保留相對排序。
    if (real !== undefined) return sum + Math.max(real, PART_STRENGTH_FALLBACK_FLOOR)
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
      return average(axis('defense'))
    case 'beginner':
      return -average(members.map((m) => m.analysis.operationDifficulty ?? 100))
    case 'balanced':
      // 三個面向各取隊中最高值鼓勵角色互補；完整配置的實戰證據（含零件強度
      // fallback）與高手評級則作為次要加分，不能用零件類型比重蓋過賽場已驗證
      // 的組合。
      return (
        Math.max(...axis('attack')) +
        Math.max(...axis('stamina')) +
        Math.max(...axis('defense')) +
        competitiveEvidenceWithFallback +
        expertTierGain * EXPERT_TIER_WEIGHT
      )
    case 'evidence':
      return competitiveEvidence
    case 'vs_attack':
      // 舊版把 defense 與 burstResistance 兩個相關軸加總，兩者本來就是同一份
      // 資訊的裝飾（見規格第 1 節），現在只剩 defense 單軸，乘 2 是為了保留
      // 這一項在總分裡原本的量級，不讓拿掉裝飾軸之後這個策略的排序權重被
      // competitiveEvidenceWithFallback／expertTierGain 蓋過去。
      return average(axis('defense')) * 2 + competitiveEvidenceWithFallback * 0.35 + expertTierGain * EXPERT_TIER_WEIGHT
    case 'vs_stamina':
      return average(axis('attack')) * 2 + competitiveEvidenceWithFallback * 0.35 + expertTierGain * EXPERT_TIER_WEIGHT
  }
}
```

- [ ] **Step 5: 跑測試確認變綠**

Run: `npm test -- tests/unit/deck.test.ts`
Expected: PASS，全部通過，含新加的 vs_attack／vs_stamina 兩條。

- [ ] **Step 6: `tsc` 確認 `deck.ts` 本身沒有新的型別錯誤**

Run: `npx tsc -b`
Expected: `recommendations.ts`／`reasons.ts`／`BuilderPage.tsx` 仍會報錯，但
錯誤訊息裡不該再出現 `src/domain/deck.ts`。

- [ ] **Step 7: Commit**

```bash
git add src/domain/deck.ts tests/unit/deck.test.ts
git commit -m "$(cat <<'EOF'
refactor: deck.ts role assignment and scoring use TypeWeight

Adds the first-ever tests for the vs_attack/vs_stamina strategies, which
previously had zero coverage.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `recommendations.ts` — 購買推薦的峰值增益

**Files:**
- Modify: `src/domain/recommendations.ts:44-45`（`PurchaseRecommendation.axisGains`）
- Modify: `src/domain/recommendations.ts:58-66`（`StrengthProfile`）
- Modify: `src/domain/recommendations.ts:86-94`（`profile()` 的 `maximum`）
- Modify: `src/domain/recommendations.ts:200-204`（`axisGains` 計算）
- Modify: `src/domain/recommendations.ts:250-256`（`roleGains` 文案）
- Test: `tests/unit/recommendations.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `ComboAnalysis.typeWeight?: TypeWeight`。
- Produces：`PurchaseRecommendation.axisGains` 型別從
  `{ attack: number; stamina: number; stability: number }` 改成
  `{ attack: number; stamina: number; defense: number }`——這是唯一一個對外
  型別欄位改名（`stability` → `defense`），沒有其他消費端讀這個欄位（已於
  spec 撰寫階段用 `grep -rn "axisGains" src/ui/ tests/` 確認過只有
  `recommendations.ts` 自己在用）。

- [ ] **Step 1: 改 `tests/unit/recommendations.test.ts`，先讓它紅**

現有測試都沒有直接斷言 `axisGains` 的欄位名稱（只有間接透過
`reasonsZhTW` 文字），所以這裡不用大改既有測試。在檔案最後
（`describe('下一包推薦'` 區塊結尾的 `})` 之前，也就是「不再有「整體強度」
話術」那個 it 後面）新增一條，直接重用檔案開頭既有的 `bladeC`（本來就是
`defense` 型，見檔案第 20 行 `const bladeC = part('blade-c', 'blade', 'defense')`），
不用再造一顆新零件：

```ts
  it('axisGains 用防守比重取代舊的穩定分數，且鍵名是 defense 不是 stability', () => {
    // bladeC 是既有 fixture 裡的防守型上蓋；這裡刻意不把它放進 lots，
    // 讓「買含 bladeC 的商品」變成新增的防守型候選，藉此觸發非零的
    // axisGains.defense。
    const productDefense: Product = {
      id: 'product-defense-2', line: 'BX', category: 'starter', naming: { primaryZhTW: '備用防禦組 2' }, region: ['JP'], isRandom: false,
      contents: [{ partId: bladeC.id, quantity: 1 }], provenance,
    }
    const result = recommendNextProducts({
      products: [productDefense],
      variants: [],
      ownedProducts: [],
      parts: [bladeA, bladeB, bladeC, ratchetA, ratchetB, ratchetC, bitA, bitB, bitC],
      rules: [],
      lots: [lot(bladeA.id), lot(bladeB.id), lot(ratchetA.id), lot(ratchetB.id), lot(ratchetC.id), lot(bitA.id), lot(bitB.id), lot(bitC.id)],
      combos: [],
      evidenceByCode: {
        'blade-c 1-60R': { appearances: 0, top4: 0, championships: 0, totalDecks: 0, sourceTier: 'community' },
      },
    })
    for (const rec of result.recommendations) {
      expect('stability' in rec.axisGains).toBe(false)
      expect(typeof rec.axisGains.defense).toBe('number')
    }
  })
```

- [ ] **Step 2: 跑測試確認紅**

Run: `npm test -- tests/unit/recommendations.test.ts`
Expected: FAIL —— `rec.axisGains` 目前還是 `{ attack, stamina, stability }`
（`'stability' in rec.axisGains` 會是 `true`），而且
`profile()` 內部呼叫的 `analysis.scores` 已經在 Task 1 被拔掉，型別檢查會報錯。

- [ ] **Step 3: 改 `src/domain/recommendations.ts`**

第 44–45 行：

```ts
  partStrengthGain: number
  axisGains: { attack: number; stamina: number; defense: number }
```

第 58–66 行（`StrengthProfile`）：

```ts
interface StrengthProfile {
  candidates: BuildableCombo[]
  codes: Set<string>
  attack: number
  stamina: number
  defense: number
  deckScore: number
  competitiveEvidence: number
}
```

第 86–94 行（`profile()` 開頭的 `maximum` 與 `result` 組裝，只列改動的那幾行）：

把：

```ts
  const maximum = (axis: 'attack' | 'stamina' | 'stability') => Math.max(0, ...candidates.map((row) => row.analysis.scores?.[axis] ?? 0))
```

改成：

```ts
  const maximum = (axis: 'attack' | 'stamina' | 'defense') => Math.max(0, ...candidates.map((row) => row.analysis.typeWeight?.[axis] ?? 0))
```

把 `result` 物件裡的：

```ts
    attack: maximum('attack'),
    stamina: maximum('stamina'),
    stability: maximum('stability'),
```

改成：

```ts
    attack: maximum('attack'),
    stamina: maximum('stamina'),
    defense: maximum('defense'),
```

第 200–204 行（`axisGains` 計算）：

```ts
    const axisGains = {
      attack: Math.max(0, after.attack - baseline.attack),
      stamina: Math.max(0, after.stamina - baseline.stamina),
      defense: Math.max(0, after.defense - baseline.defense),
    }
```

第 250–256 行（`roleGains` 文案）：

```ts
    const roleGains = [
      axisGains.attack > 0 ? `攻擊型佔比峰值 +${axisGains.attack}` : '',
      axisGains.stamina > 0 ? `持久型佔比峰值 +${axisGains.stamina}` : '',
      axisGains.defense > 0 ? `防守型佔比峰值 +${axisGains.defense}` : '',
    ].filter(Boolean)
    if (roleGains.length > 0) reasonsZhTW.push(`補強角色：${roleGains.join('、')}。`)
```

第 284 行（排序 comparator 裡的 `axisGains` 加總）：

把：

```ts
    || (b.axisGains.attack + b.axisGains.stamina + b.axisGains.stability) - (a.axisGains.attack + a.axisGains.stamina + a.axisGains.stability)
```

改成：

```ts
    || (b.axisGains.attack + b.axisGains.stamina + b.axisGains.defense) - (a.axisGains.attack + a.axisGains.stamina + a.axisGains.defense)
```

- [ ] **Step 4: 跑測試確認變綠**

Run: `npm test -- tests/unit/recommendations.test.ts`
Expected: PASS，全部通過。

- [ ] **Step 5: `tsc` 確認 `recommendations.ts` 本身沒有新的型別錯誤**

Run: `npx tsc -b`
Expected: 只剩 `reasons.ts`／`BuilderPage.tsx` 還會報錯。

- [ ] **Step 6: Commit**

```bash
git add src/domain/recommendations.ts tests/unit/recommendations.test.ts
git commit -m "$(cat <<'EOF'
refactor: recommendations.ts axisGains renames stability to defense

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `reasons.ts` — 一句話結論

**Files:**
- Modify: `src/domain/reasons.ts:1-14`（檔案頂端說明註解）
- Modify: `src/domain/reasons.ts:199-257`（`ComboScoreInput`／
  `AXIS_STRENGTH_ZH`／`AXIS_WEAKNESS_ZH`／`buildComboVerdict`）
- Modify: `src/ui/pages/BuilderPage.tsx:526-529`（呼叫端，先在這個 Task 一併
  改掉呼叫參數，UI 其餘部分留給 Task 7）
- Test: `tests/unit/reasons.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `TypeWeight`（`reasons.ts` 刻意不 import `analysis.ts`
  的型別，維持原本「六軸分數的最小輸入形狀，避免這一層依賴 analysis 模組」的
  設計，這個 Task 把 `ComboScoreInput` 改成跟 `TypeWeight` 同形狀但獨立定義）。
- Produces：
  ```ts
  export interface ComboScoreInput {
    attack: number
    defense: number
    stamina: number
    balance: number
  }
  export function buildComboVerdict(args: {
    scores?: ComboScoreInput
    typeZhTW?: string
  }): string | undefined
  ```
  （函式名稱與參數名稱 `scores` 保持不變——這個模組的既有慣例是用最小輸入
  形狀跟 `analysis.ts` 解耦，呼叫端 `BuilderPage.tsx` 傳入時會給
  `analysis.typeWeight`，但這裡的參數名稱本來就跟來源欄位名稱無關，不用
  跟著改。）

- [ ] **Step 1: 改 `tests/unit/reasons.test.ts`，先讓它紅**

第 136–157 行整段換成：

```ts
describe('整顆陀螺的一句話結論', () => {
  it('沒有分數時不硬湊一句話', () => {
    expect(buildComboVerdict({})).toBeUndefined()
  })

  it('講得出最強與最弱的類型佔比', () => {
    const verdict = buildComboVerdict({
      scores: { attack: 62, defense: 15, stamina: 8, balance: 15 },
      typeZhTW: '攻擊',
    })
    expect(verdict).toContain('攻擊型配置')
    expect(verdict).toContain('強在')
    expect(verdict).toContain('弱在')
  })

  it('四個類型佔比差距太小時說是平均型，不硬講擅長什麼', () => {
    const verdict = buildComboVerdict({
      scores: { attack: 27, defense: 25, stamina: 24, balance: 24 },
    })
    expect(verdict).toContain('沒有明顯偏向')
  })

  it('最強最弱差距剛好等於門檻（15）時，判定成「有明確偏向」而不是平均型', () => {
    // attack 35、balance 20，差距剛好 15——門檻判斷式是 `< 15` 才算打平，
    // 15 本身不成立，所以要能正確判成「有偏向」，釘住這個邊界不被改壞。
    const verdict = buildComboVerdict({
      scores: { attack: 35, defense: 24, stamina: 21, balance: 20 },
    })
    expect(verdict).not.toContain('沒有明顯偏向')
    expect(verdict).toContain('強在')
  })
})
```

- [ ] **Step 2: 跑測試確認紅**

Run: `npm test -- tests/unit/reasons.test.ts`
Expected: FAIL —— `ComboScoreInput` 目前還是六個欄位的形狀，傳
`{ attack, defense, stamina, balance }` 這種四欄位物件會被 TS 當成缺少
`burst`／`burstResistance`／`stability` 而報錯；`AXIS_STRENGTH_ZH` 也還沒有
`balance` 的翻譯。

- [ ] **Step 3: 改 `src/domain/reasons.ts`**

第 1–14 行的檔案頂端註解，把：

```ts
/**
 * 配裝理由的證據層。
 *
 * 規格對照：第 20 節 C（賽事／社群證據）、第 21 節（樣本限制）、第 22 節（來源可查）。
 *
 * 為什麼要有這一層：六軸評估是本站的模型推估，它說得出「這套的結構偏持久」，
 * 說不出「賽場上真的有人這樣打」。本模組只做一件事 —— 把已經收進來的兩種外部資料
 * （高手逐件評級、台灣賽事名次觀測）翻成一句一句可回查的理由。
```

改成：

```ts
/**
 * 配裝理由的證據層。
 *
 * 規格對照：第 20 節 C（賽事／社群證據）、第 21 節（樣本限制）、第 22 節（來源可查）。
 *
 * 為什麼要有這一層：零件類型比重是本站算出來的組成比例，它說得出「這套的結構偏
 * 持久」，說不出「賽場上真的有人這樣打」。本模組只做一件事 —— 把已經收進來的
 * 兩種外部資料（高手逐件評級、台灣賽事名次觀測）翻成一句一句可回查的理由。
```

第 199–257 行（`ComboScoreInput` 到 `buildComboVerdict` 結尾）整段換成：

```ts
/** 類型比重的最小輸入形狀，避免這一層依賴 analysis 模組。 */
export interface ComboScoreInput {
  attack: number
  defense: number
  stamina: number
  balance: number
}

const AXIS_STRENGTH_ZH: Record<keyof ComboScoreInput, string> = {
  attack: '正面撞擊',
  defense: '硬吃攻擊',
  stamina: '拖到最後',
  balance: '攻守持久都不差',
}

const AXIS_WEAKNESS_ZH: Record<keyof ComboScoreInput, string> = {
  attack: '撞不動人',
  defense: '被撞就吃虧',
  stamina: '拖不久',
  balance: '沒有明顯強項',
}

/**
 * 用一句話講完這顆陀螺是什麼打法。
 *
 * 為什麼需要：零件類型比重給的是四個百分比，逐條讀完才拼得出「所以這顆是幹嘛
 * 的」；而證據理由列的是一顆顆零件，讀起來像三份零件報告而不是一顆陀螺的分析。
 * 這一句把佔比最高與最低的類型翻成人話，放在所有細節之前。
 *
 * 只講模型算得出來的東西；沒有比重就回 undefined，不要硬湊一句廢話。
 */
export function buildComboVerdict(args: {
  scores?: ComboScoreInput
  typeZhTW?: string
}): string | undefined {
  const { scores } = args
  if (!scores) return undefined
  const entries = (Object.keys(AXIS_STRENGTH_ZH) as (keyof ComboScoreInput)[])
    .map((axis) => ({ axis, value: scores[axis] }))
    .sort((a, b) => b.value - a.value)
  const best = entries[0]
  const worst = entries[entries.length - 1]
  if (!best || !worst) return undefined

  // 四個類型佔比差距太小時不要硬講「擅長什麼」，那只是雜訊。四個百分比加總
  // 是 100，平均值 25；門檻抓「最高與最低差不到 15 個百分點」，比舊版 0–100
  // 假分數的 12 分門檻略寬，因為百分比的分布天然比舊版分數更集中在 25 附近。
  if (best.value - worst.value < 15) {
    return '四個類型佔比接近，是沒有明顯偏向的平均型配置。'
  }
  const typePrefix = args.typeZhTW && args.typeZhTW !== '資料不足' ? `${args.typeZhTW}型配置：` : ''
  return `${typePrefix}強在${AXIS_STRENGTH_ZH[best.axis]}，弱在${AXIS_WEAKNESS_ZH[worst.axis]}。`
}
```

- [ ] **Step 4: 跑測試確認變綠**

Run: `npm test -- tests/unit/reasons.test.ts`
Expected: PASS，全部通過。若「差距剛好等於門檻」那條沒過，檢查
`{ attack: 35, defense: 24, stamina: 21, balance: 20 }` 的最大最小差
（35-20=15）是否確實不小於 15；若「差距太小」那條沒過，檢查
`{ attack: 27, defense: 25, stamina: 24, balance: 24 }` 的最大最小差
（27-24=3）是否確實 <15。兩組數字都已經算過，理論上第一次跑就會過。

- [ ] **Step 5: 改 `src/ui/pages/BuilderPage.tsx` 呼叫端**

第 526–529 行：

```ts
  const comboVerdictZhTW = buildComboVerdict({
    scores: analysis.scores,
    typeZhTW: analysis.typeZhTW,
  })
```

改成：

```ts
  const comboVerdictZhTW = buildComboVerdict({
    scores: analysis.typeWeight,
    typeZhTW: analysis.typeZhTW,
  })
```

（`ComboScoreInput` 的四個欄位跟 `TypeWeight` 的四個欄位形狀完全一致，這裡
可以直接傳，不需要另外轉換。這一步先讓 `tsc` 對這一行不再報錯，`BuilderPage.tsx`
其餘的六條分數條留給 Task 7 改。）

- [ ] **Step 6: `tsc` 確認 `reasons.ts` 與這一行呼叫沒有新的型別錯誤**

Run: `npx tsc -b`
Expected: 只剩 `BuilderPage.tsx` 裡第 568–574 行那六個 `ScoreBar` 還會報錯
（`analysis.scores` 已經不存在），留給 Task 7 處理。

- [ ] **Step 7: Commit**

```bash
git add src/domain/reasons.ts src/ui/pages/BuilderPage.tsx tests/unit/reasons.test.ts
git commit -m "$(cat <<'EOF'
refactor: reasons.ts combo verdict uses type-weight percentages

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `BuilderPage.tsx`／`ui.tsx` — 配裝器六條分數條換成四條類型比重

**Files:**
- Modify: `src/ui/components/ui.tsx:341-376`（`ScoreBar`，加一個可選的 `unit` prop）
- Modify: `src/ui/pages/BuilderPage.tsx:557-580`
- Test: `tests/e2e/pwa.spec.ts`（新增一條畫面文字檢查，e2e 而非單元測試，因為
  這是純 UI 呈現，`ui.tsx`／`BuilderPage.tsx` 目前都沒有專屬的 Vitest 元件測試
  基礎設施，照專案既有慣例用 Playwright 驗）

**Interfaces:**
- Consumes: Task 1 的 `analysis.typeWeight?: TypeWeight`。
- Produces：`ScoreBar` 新增 `unit?: string` prop（預設空字串，`operationDifficulty`
  那行不傳這個 prop，行為完全不變）。

- [ ] **Step 1: 改 `src/ui/components/ui.tsx` 的 `ScoreBar`，加 `unit` prop**

第 341–355 行換成：

```ts
export function ScoreBar({
  label,
  value,
  color,
  unit = '',
}: {
  label: string
  value?: number
  color?: string
  /** 數值後面要不要加單位（例如「%」），預設空字串維持舊行為不變。 */
  unit?: string
}) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
        <span>{label}</span>
        <span style={{ color: 'var(--ink-dim)' }}>{value === undefined ? '資料不足' : `${value}${unit}`}</span>
      </div>
```

（後面畫條的 `<div>` 區塊完全不動，寬度公式 `${value ?? 0}%` 本來就是拿
`value` 當百分比用，跟新的 `unit` 顯示是兩件事，不用改。）

- [ ] **Step 2: 改 `src/ui/pages/BuilderPage.tsx` 的分數條區塊**

第 557–580 行整段換成：

```ts
        <div>
          <Row>
            <strong style={{ fontSize: 14 }}>零件類型比重</strong>
            <EstimateBadge />
          </Row>
          <div style={{ height: 6 }} />
          {/*
            每個類型自己的顏色，對齊零件類型色：攻＝紅、防＝藍、久＝綠、均衡＝中性色。
            這是零件本身 type 標籤按槽位權重算出的組成比例，不是強度分數——
            四個百分比加總一定是 100（規格第 50.7 節）。
          */}
          <ScoreBar label="攻擊型" value={analysis.typeWeight?.attack} color="var(--type-attack)" unit="%" />
          <ScoreBar label="防守型" value={analysis.typeWeight?.defense} color="var(--type-defense)" unit="%" />
          <ScoreBar label="持久型" value={analysis.typeWeight?.stamina} color="var(--type-stamina)" unit="%" />
          <ScoreBar label="均衡型" value={analysis.typeWeight?.balance} color="var(--type-balance)" unit="%" />
          <ScoreBar label="操作難度" value={analysis.operationDifficulty} />
          {analysis.typeWeight ? null : (
            <div style={{ fontSize: 13, color: 'var(--warn)' }}>
              官方尚未公布這些零件的類型與旋向，因此不給類型比重，避免誤導。
            </div>
          )}
        </div>
```

- [ ] **Step 3: `tsc` 確認整個專案沒有殘留錯誤**

Run: `npx tsc -b`
Expected: 乾淨無輸出。這是六個 Task 以來第一次全部消費端都改完，如果還有
報錯，回頭檢查是不是漏改了某個檔案。

- [ ] **Step 4: 跑全套單元測試確認沒有連帶壞掉**

Run: `npm test`
Expected: 全部通過（Task 1–6 各自的測試檔加總）。

- [ ] **Step 5: 補一條 e2e 檢查畫面文字，先讓它紅**

在 `tests/e2e/pwa.spec.ts` 第 369 行「配裝器會顯示對應上蓋的專家 T 表，且清楚
標成社群意見」那條 it 後面（緊接著它的結尾 `})` 之後），新增一條。零件 id
沿用同檔案第 357–359 行已經在用、確定能組出合法標準三件式且有官方類型資料的
組合（蒼龍神劍 3-60F）：

```ts
test('配裝器顯示零件類型比重，不再顯示六軸評估或分數字樣', async ({ page }) => {
  await openApp(page, '/builder')
  await page.getByRole('button', { name: '顯示全部圖鑑' }).click()
  await pickSlot(page, 'bladeId', 'blade:ドランソード')
  await pickSlot(page, 'ratchetId', 'ratchet:3-60')
  await pickSlot(page, 'bitId', 'bit:F')
  await expect(page.getByText('零件類型比重')).toBeVisible()
  await expect(page.getByText('六軸評估')).toHaveCount(0)
  await expect(page.getByText('攻擊型', { exact: true })).toBeVisible()
})
```

- [ ] **Step 6: 跑這條 e2e 確認紅**

Run: `npx playwright test tests/e2e/pwa.spec.ts -g "配裝器顯示零件類型比重"`
Expected: FAIL 或 PASS 都有可能在這一步之前就已經是綠的（因為 Step 1–2 已經
把程式碼改完了）——如果本來就是綠的，回頭確認测试真的測到了正確的東西：
暫時把 Step 2 的 `label="攻擊型"` 改回 `label="攻擊"` 存檔，重跑這條 e2e 確認
會紅（變異驗證），再改回 `"攻擊型"`。

- [ ] **Step 7: 跑完整 e2e 與截圖，確認沒有連帶壞掉**

Run: `npm run test:e2e`
Expected: 全部通過（跑之前先確認沒有殘留的 4173 port 預覽程序：
`lsof -i :4173`）。

Run: `npm run shots`（一定要排在 `test:e2e` 之後，`playwright test` 開跑會
清掉 `test-results/`）
Expected: `phone`／`desktop` 各一張通過；跑完用 Read 工具實際打開
`test-results/shots/desktop-builder.png` 跟 `phone-builder.png`，人工確認
「零件類型比重」四條分數條顯示正常、數字後面有 `%`、沒有殘留「六軸」字樣。

- [ ] **Step 8: 全域搜尋確認沒有殘留的「六軸」字樣**

Run: `grep -rn "六軸" src/ tests/`
Expected: 只剩解釋歷史脈絡的 comment（例如「舊版六軸系統」這種明確講過去式
的說明），不該有任何會被使用者看到的字串字面值。如果找到使用者可見字串，
回去改掉。

- [ ] **Step 9: Commit**

```bash
git add src/ui/components/ui.tsx src/ui/pages/BuilderPage.tsx tests/e2e/pwa.spec.ts
git commit -m "$(cat <<'EOF'
feat: replace the six-axis score bars with type-weight percentage bars

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: 收尾——文件、上線前檢查、部署

**Files:**
- Modify: `BEYBLADE_X_codex_prompt.md`（規格第 50.7 節改成「已完成」，並記錄
  最終校準過的門檻值等實作細節跟 spec 草案不一致的地方）
- Modify: `HANDOFF.md`
- Modify: `docs/superpowers/specs/2026-09-24-six-axis-to-type-weight-design.md`
  （狀態欄改成「已實作」）

**Interfaces:** 無新程式碼介面，這個 Task 是文件同步與上線流程。

- [ ] **Step 1: 跑一次全專案確認乾淨**

Run: `npx tsc -b && npm test`
Expected: 全部通過，這是 Task 1–7 的最終匯總檢查。

- [ ] **Step 2: 更新規格文件**

打開 `BEYBLADE_X_codex_prompt.md` 的「50.7 待辦：「判定位」改用類型比重
（尚未動工）」，把標題改成「50.7 判定位改用類型比重（已完成）」，內容前面
原本的分析段落保留，後面加一段：

```
- 2026-09-24 實作完成：`BASE_BY_TYPE` 已整個刪除，`estimateTypeWeight()`
  取代 `estimateScores()`，`ComboAnalysis.typeWeight` 取代 `scores`。
  `assignRoles()`、`vs_attack`／`vs_stamina`、配裝器分數條、購買推薦峰值
  文案、一句話結論全部改用四個類型比重（攻擊／防守／持久／均衡，加總 100）。
  `buildComboVerdict()` 的差距門檻從 12 分調整為 15 個百分點（理由見
  `reasons.ts` 該函式內的註解）。`vs_attack`／`vs_stamina` 拿掉重複的
  裝飾軸後，單軸乘 2 保留原本在總分裡的量級。
```

- [ ] **Step 3: 更新 spec 文件狀態列**

把 `docs/superpowers/specs/2026-09-24-six-axis-to-type-weight-design.md`
第 3 行的：

```
**狀態**：設計已跟使用者逐段確認，待書面 spec 審核。
```

改成：

```
**狀態**：已實作並上線，實作計畫見
`docs/superpowers/plans/2026-09-24-six-axis-to-type-weight.md`。
```

- [ ] **Step 4: 更新 `HANDOFF.md`**

先跑 `git status --short`、`git rev-parse --short HEAD`、
`git rev-parse --short origin/main` 取得目前實際狀態（不要沿用舊數字）。
把「目前目標」改成這輪做完六軸→類型比重的重構、把「發布狀態」表格的 SHA
換成這輪最新的、在「踩過的坑」加一條（若在實作過程中真的踩到本計畫沒預料
到的坑；若沒有就不用硬加）、「下一個具體動作」拿掉「六軸『判形狀』職責…」
那一條（已完成），視情況補上這輪測完後發現的任何新缺口。

- [ ] **Step 5: Commit 文件**

```bash
git add BEYBLADE_X_codex_prompt.md HANDOFF.md docs/superpowers/specs/2026-09-24-six-axis-to-type-weight-design.md
git commit -m "$(cat <<'EOF'
docs: mark six-axis-to-type-weight spec and plan as implemented

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: Push**

```bash
git push origin main
```

- [ ] **Step 7: 部署**

Run: `npm run deploy:pages`
Expected: 成功部署到 `gh-pages`，記下輸出的 commit SHA。

- [ ] **Step 8: 線上驗證**

Run: `npm run test:live`
Expected: 全部通過。如果第一次跑遇到圖片 403／503（GitHub Pages CDN 剛部署
完的傳播延遲，前幾輪部署也遇過），重跑一次確認是不是真的壞掉，不是就正常
收尾。

- [ ] **Step 9: 補最終部署結果到 HANDOFF**

把 Step 7、8 實際跑出來的 `gh-pages` commit SHA 與 `test:live` 結果寫回
`HANDOFF.md` 的「發布狀態」表格，這是最後一次改 `HANDOFF.md`，改完再
commit + push 一次（純文件變更，不用再部署）。

```bash
git add HANDOFF.md
git commit -m "$(cat <<'EOF'
docs: record verified deploy result for type-weight rollout

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
git push origin main
```
