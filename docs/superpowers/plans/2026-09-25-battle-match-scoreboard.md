# 對戰紀錄逐分計分板 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把「個人對戰紀錄」的資料模型從「一局一個籠統結果」換成「一場個別
對戰、逐分記錄」，記錄畫面不再需要先存配裝，現場選零件記分，符合 Beyblade X
官方個別對戰規則（先到 4 分獲勝，轉停 1／出界爆裂 2／極限 3）。

**Architecture:** `BattleRound` 整個換成 `BattleMatch`（含 `BattlePoint[]`），
贏家由 `points` 算出來不另外存。記錄畫面複用配裝器既有的 `PartPickerField`
（一頁兩個選擇器，元件本來就支援 `idPrefix`），加一塊即時計分板。IndexedDB
v6→v7，舊 `battleRounds` 表刪除、不轉換（上一輪功能才上線一天）。

**Tech Stack:** TypeScript、React、Dexie（IndexedDB）、Vitest、Playwright。

**Spec:** `docs/superpowers/specs/2026-09-25-battle-match-scoreboard-design.md`

## Global Constraints

- 先到 4 分獲勝（`MATCH_WIN_SCORE = 4`），`FINISH_POINTS`：`spin` 1 分、
  `over_burst` 2 分、`xtreme` 3 分（規格第 2 節，來源查證過）。
- `BattleFinish` 只有 `'spin' | 'over_burst' | 'xtreme'` 三種，不再收 `'none'`。
- 只有真正打完（任一邊 `points` 累計 ≥4 分）才能存檔，不留半場紀錄。
- 記錄畫面**不做結構相容性檢查**，A、B 兩邊系統各自獨立選擇（規格第 4 節）。
- `PartWinRateEntry` 拔掉 `ties` 欄位——新模型下比賽一定有贏家。
- `battleRounds` 表整個刪除、不做欄位轉換；`battleMatches` 是全新的表。
- 不做 3on3 團體賽整場比分／重複對戰邏輯（規格第 7 節，YAGNI）。
- 不追加任何拿 `finish` 類型做零件傾向分析的邏輯（規格第 7 節，YAGNI）。

## Review Focus

- 復原最後一分後，比分跟按鈕狀態要立刻反映（不能殘留已達 4 分時鎖住按鈕
  的狀態，復原後如果分數退回 4 分以下，按鈕要重新解鎖）。
- 極限終結（3 分）讓分數從 2 跳到 5（超過 4）時，判定邏輯要用「達到」不是
  「剛好等於」4 分，這種超額比分要能正常存檔、正常顯示（例如「5:1」）。
- 兩邊配裝都還沒選滿任何零件時，不能讓計分板出現、更不能讓「未選配裝」
  的一方被記到分。
- 存檔後（或「清除重來」）要清空 `points` 但保留已選的 A／B 配裝，讓使用者
  連續記錄好幾場不用每次重選零件。
- 歷史列表展開看逐分紀錄時，分數要跟存檔當下一致（不能因為之後零件圖鑑
  更新、`FINISH_POINTS` 常數本身沒變而重算出不同結果——這次沒有把點值存進
  `BattlePoint`，是即時算的，只要 `FINISH_POINTS` 常數本身不再改變就沒事，
  但要留意這個隱性假設：往後如果調整 `FINISH_POINTS`，舊紀錄的比分會跟著
  變。這輪先不處理版本化，只在程式碼註解點出這個限制）。

---

### Task 1：型別與 `domain/battleRecords.ts` 重寫

**Files:**
- Modify: `src/domain/types.ts`（第 446-463 行，整段換掉）
- Modify: `src/domain/battleRecords.ts`（整檔重寫）
- Modify: `tests/unit/battleRecords.test.ts`（整檔重寫）

**Interfaces:**
- Produces（`types.ts`）：
  - `BattleFinish = 'spin' | 'over_burst' | 'xtreme'`
  - `interface BattlePoint { scorer: 'a' | 'b'; finish: BattleFinish }`
  - `interface BattleMatch { id: string; a: ComboSlots; b: ComboSlots; points: BattlePoint[]; playedAt: string; notes?: string; createdAt: string }`
- Produces（`battleRecords.ts`）：
  - `const MATCH_WIN_SCORE = 4`
  - `const FINISH_POINTS: Record<BattleFinish, number>`
  - `function computeMatchScore(points: BattlePoint[]): { a: number; b: number }`
  - `function isMatchComplete(points: BattlePoint[]): boolean`
  - `function matchWinner(points: BattlePoint[]): 'a' | 'b' | undefined`
  - `const LOW_SAMPLE_THRESHOLD = 5`（沿用舊值）
  - `interface PartWinRateEntry { wins: number; losses: number; winRate?: number }`（無 `ties`）
  - `function computePartWinRateIndex(matches: BattleMatch[]): Map<string, PartWinRateEntry>`

- [ ] **Step 1: 改 `types.ts`**

把第 446-463 行：

```typescript
export type BattleRoundResult = 'a' | 'b' | 'tie'
export type BattleFinish = 'spin' | 'over' | 'burst' | 'xtreme' | 'none'

/**
 * 使用者自己（或跟朋友）的 1v1 練習對戰紀錄。純本機資料，不同步、不宣稱
 * 官方或社群共識，見 docs/superpowers/specs/2026-09-24-personal-battle-log-design.md。
 */
export interface BattleRound {
  id: string
  a: ComboSlots
  b: ComboSlots
  result: BattleRoundResult
  finish: BattleFinish
  playedAt: string
  /** 自由文字，使用者自己標記情境，不參與任何運算。 */
  notes?: string
  createdAt: string
}
```

改成：

```typescript
/** 轉停 1 分、出界／爆裂各 2 分（官方同分，合併成一個選項）、極限 3 分。 */
export type BattleFinish = 'spin' | 'over_burst' | 'xtreme'

export interface BattlePoint {
  scorer: 'a' | 'b'
  finish: BattleFinish
}

/**
 * 一場個別對戰（先到 4 分獲勝，見官方規則）。純本機資料，不同步、不宣稱
 * 官方或社群共識，見 docs/superpowers/specs/2026-09-25-battle-match-scoreboard-design.md。
 * A、B 兩邊配裝全程固定，不會中途換零件——3on3 團體賽脈絡下每一場個別
 * 對戰本來就是這樣打的，這裡只記單場，不記團體賽整場比分。
 */
export interface BattleMatch {
  id: string
  a: ComboSlots
  b: ComboSlots
  /** 依序記錄每一分怎麼來的，贏家由這裡算出來，不另外存。 */
  points: BattlePoint[]
  playedAt: string
  /** 自由文字，使用者自己標記情境，不參與任何運算。 */
  notes?: string
  createdAt: string
}
```

- [ ] **Step 2: 寫失敗測試**

整檔取代 `tests/unit/battleRecords.test.ts`：

```typescript
import { describe, expect, it } from 'vitest'
import {
  computeMatchScore,
  computePartWinRateIndex,
  isMatchComplete,
  matchWinner,
  LOW_SAMPLE_THRESHOLD,
  MATCH_WIN_SCORE,
} from '../../src/domain/battleRecords.ts'
import type { BattleMatch, BattlePoint } from '../../src/domain/types.ts'

function match(overrides: Partial<BattleMatch>): BattleMatch {
  return {
    id: 'm1',
    a: { bladeId: 'blade-a' },
    b: { bladeId: 'blade-b' },
    points: [],
    playedAt: '2026-09-25',
    createdAt: '2026-09-25T00:00:00.000Z',
    ...overrides,
  }
}

describe('computeMatchScore／isMatchComplete／matchWinner（第 2 節：先到 4 分獲勝）', () => {
  it('轉停 1 分、出界爆裂 2 分、極限 3 分，依序累加', () => {
    const points: BattlePoint[] = [
      { scorer: 'a', finish: 'spin' },
      { scorer: 'a', finish: 'over_burst' },
      { scorer: 'b', finish: 'xtreme' },
    ]
    expect(computeMatchScore(points)).toEqual({ a: 3, b: 3 })
  })

  it('還沒有一邊到 4 分時，isMatchComplete 是 false，matchWinner 是 undefined', () => {
    const points: BattlePoint[] = [{ scorer: 'a', finish: 'over_burst' }]
    expect(isMatchComplete(points)).toBe(false)
    expect(matchWinner(points)).toBeUndefined()
  })

  it('極限把分數從 2 推到 5（超過 4）時，仍然正確判定達陣，不是卡在剛好等於 4', () => {
    const points: BattlePoint[] = [
      { scorer: 'a', finish: 'over_burst' },
      { scorer: 'a', finish: 'xtreme' },
    ]
    expect(computeMatchScore(points)).toEqual({ a: 5, b: 0 })
    expect(isMatchComplete(points)).toBe(true)
    expect(matchWinner(points)).toBe('a')
  })

  it('MATCH_WIN_SCORE 是 4', () => {
    expect(MATCH_WIN_SCORE).toBe(4)
  })
})

describe('computePartWinRateIndex（第 2 節：零件勝率聚合，改吃 BattleMatch[]）', () => {
  it('空陣列不拋錯，回傳空 Map', () => {
    expect(computePartWinRateIndex([]).size).toBe(0)
  })

  it('A 贏一場（4 分），A 的零件各記一次贏、B 的零件各記一次輸', () => {
    const matches: BattleMatch[] = Array.from({ length: LOW_SAMPLE_THRESHOLD }, (_, i) =>
      match({ id: `m${i}`, points: [{ scorer: 'a', finish: 'xtreme' }, { scorer: 'a', finish: 'spin' }] }),
    )
    const index = computePartWinRateIndex(matches)
    expect(index.get('blade-a')).toEqual({ wins: LOW_SAMPLE_THRESHOLD, losses: 0, winRate: 1 })
    expect(index.get('blade-b')).toEqual({ wins: 0, losses: LOW_SAMPLE_THRESHOLD, winRate: 0 })
  })

  it('同一顆零件同時出現在 A、B 兩邊的不同場，輸贏各自累加不互相污染', () => {
    const winA = () => match({ points: [{ scorer: 'a', finish: 'xtreme' }, { scorer: 'a', finish: 'spin' }] })
    const winB = () => match({ a: { bladeId: 'other-2' }, b: { bladeId: 'shared' }, points: [{ scorer: 'b', finish: 'xtreme' }, { scorer: 'b', finish: 'spin' }] })
    const matches: BattleMatch[] = [
      ...Array.from({ length: 3 }, () => ({ ...winA(), a: { bladeId: 'shared' }, b: { bladeId: 'other-1' } })),
      ...Array.from({ length: 3 }, () => winB()),
    ]
    const index = computePartWinRateIndex(matches)
    expect(index.get('shared')).toEqual({ wins: 3, losses: 3, winRate: 0.5 })
  })

  it('樣本數（wins+losses）低於門檻時 winRate 是 undefined，但 wins/losses 數字仍然正確', () => {
    const matches: BattleMatch[] = Array.from({ length: LOW_SAMPLE_THRESHOLD - 1 }, (_, i) =>
      match({ id: `m${i}`, points: [{ scorer: 'a', finish: 'xtreme' }, { scorer: 'a', finish: 'spin' }] }),
    )
    const entry = computePartWinRateIndex(matches).get('blade-a')!
    expect(entry.wins).toBe(LOW_SAMPLE_THRESHOLD - 1)
    expect(entry.winRate).toBeUndefined()
  })

  it('未完成的比賽（沒有一邊到 4 分）不會被當成任何一方贏，不貢獻任何零件的 wins/losses', () => {
    const matches: BattleMatch[] = [match({ points: [{ scorer: 'a', finish: 'spin' }] })]
    const index = computePartWinRateIndex(matches)
    expect(index.size).toBe(0)
  })
})
```

- [ ] **Step 3: 執行測試確認失敗**

Run: `npm test -- tests/unit/battleRecords.test.ts`
Expected: 找不到 `computeMatchScore`／`isMatchComplete`／`matchWinner`／
`MATCH_WIN_SCORE` 等符號，模組匯入錯誤，全部 FAIL。

- [ ] **Step 4: 重寫 `domain/battleRecords.ts`**

整檔取代：

```typescript
/**
 * 個人對戰紀錄聚合（純函式）。
 *
 * 規格對照：docs/superpowers/specs/2026-09-25-battle-match-scoreboard-design.md。
 */
import type { BattleFinish, BattleMatch, BattlePoint } from './types.ts'

export const LOW_SAMPLE_THRESHOLD = 5

/** 先到這個分數獲勝（官方規則：Beyblade X 個別對戰先到 4 分）。 */
export const MATCH_WIN_SCORE = 4

/** 轉停 1 分、出界／爆裂 2 分（官方同分，合併成一個選項）、極限 3 分。 */
export const FINISH_POINTS: Record<BattleFinish, number> = {
  spin: 1,
  over_burst: 2,
  xtreme: 3,
}

export function computeMatchScore(points: BattlePoint[]): { a: number; b: number } {
  return points.reduce(
    (score, point) => {
      const value = FINISH_POINTS[point.finish]
      return point.scorer === 'a' ? { a: score.a + value, b: score.b } : { a: score.a, b: score.b + value }
    },
    { a: 0, b: 0 },
  )
}

/** 用「達到」不是「剛好等於」——極限終結可能讓分數一口氣超過 4。 */
export function isMatchComplete(points: BattlePoint[]): boolean {
  const score = computeMatchScore(points)
  return score.a >= MATCH_WIN_SCORE || score.b >= MATCH_WIN_SCORE
}

export function matchWinner(points: BattlePoint[]): 'a' | 'b' | undefined {
  const score = computeMatchScore(points)
  if (score.a >= MATCH_WIN_SCORE) return 'a'
  if (score.b >= MATCH_WIN_SCORE) return 'b'
  return undefined
}

export interface PartWinRateEntry {
  wins: number
  losses: number
  /** wins / (wins + losses)，樣本數低於 LOW_SAMPLE_THRESHOLD 時 undefined。 */
  winRate?: number
}

const SLOT_KEYS = [
  'bladeId',
  'lockChipId',
  'mainBladeId',
  'overBladeId',
  'assistBladeId',
  'ratchetId',
  'bitId',
] as const

function partIdsOf(slots: BattleMatch['a']): string[] {
  return SLOT_KEYS.map((key) => slots[key]).filter((id): id is string => Boolean(id))
}

interface MutableCount {
  wins: number
  losses: number
}

function ensure(counts: Map<string, MutableCount>, partId: string): MutableCount {
  const existing = counts.get(partId)
  if (existing) return existing
  const fresh: MutableCount = { wins: 0, losses: 0 }
  counts.set(partId, fresh)
  return fresh
}

export function computePartWinRateIndex(matches: BattleMatch[]): Map<string, PartWinRateEntry> {
  const counts = new Map<string, MutableCount>()

  for (const battleMatch of matches) {
    const winner = matchWinner(battleMatch.points)
    if (!winner) continue // 未完成的比賽不貢獻任何零件的輸贏。

    const aParts = partIdsOf(battleMatch.a)
    const bParts = partIdsOf(battleMatch.b)
    const winners = winner === 'a' ? aParts : bParts
    const losers = winner === 'a' ? bParts : aParts
    for (const partId of winners) ensure(counts, partId).wins += 1
    for (const partId of losers) ensure(counts, partId).losses += 1
  }

  const result = new Map<string, PartWinRateEntry>()
  for (const [partId, count] of counts) {
    const sample = count.wins + count.losses
    result.set(partId, {
      ...count,
      winRate: sample >= LOW_SAMPLE_THRESHOLD ? count.wins / sample : undefined,
    })
  }
  return result
}
```

- [ ] **Step 5: 執行測試確認通過**

Run: `npm test -- tests/unit/battleRecords.test.ts`
Expected: 全部 PASS。

- [ ] **Step 6: 全套驗證**

Run: `npx tsc -b && npm test`
Expected: `tsc` 會在 `deck.test.ts`（用到舊的 `ties` 欄位）、`db.ts`／
`repository.ts`／`appStore.ts`／`BuilderPage.tsx`／`DecksPage.tsx`／
`BattleLogPage.tsx`（都還 import 舊的 `BattleRound`／`BattleRoundResult`）
報一堆型別錯誤——這是預期的，這些檔案在後面的 Task 才會改，Task 1 這一步
**不用等到全部乾淨**，只要確認錯誤都集中在「還沒改到的檔案」，不是
`battleRecords.ts`／`types.ts`／`battleRecords.test.ts` 自己有問題。

Run: `npm test -- tests/unit/battleRecords.test.ts` 再跑一次確認這個檔案
本身是綠的（`npm test` 全跑會因為其他檔案的型別錯誤整批失敗，不能拿來判斷
這個 Task 有沒有做對）。

- [ ] **Step 7: Commit**

```bash
git add src/domain/types.ts src/domain/battleRecords.ts tests/unit/battleRecords.test.ts
git commit -m "$(cat <<'EOF'
feat: replace BattleRound with BattleMatch (point-by-point scoring)

BattleFinish simplified to spin/over_burst/xtreme (3 values, over+burst
merged since they're worth the same 2 points officially). Winner is
derived from points, never stored. This task only touches types.ts and
battleRecords.ts -- downstream consumers (db, repository, appStore, UI)
are updated in later tasks and will show type errors until then.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2：修 `deck.test.ts` 的舊 `ties` 欄位

**Files:**
- Modify: `tests/unit/deck.test.ts`（第 520、539、547 行）

**Interfaces:**
- Consumes: `PartWinRateEntry`（Task 1，已經沒有 `ties` 欄位）。

`deck.ts` 本身不用改——它只讀 `.winRate`，從沒讀過 `.ties`，這個 Task 純粹
是測試檔案裡建構 `PartWinRateEntry` 物件字面值時多寫了一個已經不存在的
欄位，TypeScript 的 excess property check 會擋下來。

- [ ] **Step 1: 執行測試確認失敗（型別錯誤）**

Run: `npx tsc -b`
Expected: `tests/unit/deck.test.ts` 在第 520、539、547 行附近報
`Object literal may only specify known properties, and 'ties' does not exist in type 'PartWinRateEntry'` 這類錯誤。

- [ ] **Step 2: 拿掉多餘的 `ties: 0`**

把第 520 行：

```typescript
    const winRateIndex = new Map([['b-atk', { wins: 8, losses: 2, ties: 0, winRate: 0.8 }]])
```

改成：

```typescript
    const winRateIndex = new Map([['b-atk', { wins: 8, losses: 2, winRate: 0.8 }]])
```

第 539 行：

```typescript
    const winRateIndex = new Map([['b-atk', { wins: 1, losses: 9, ties: 0, winRate: 0.1 }]])
```

改成：

```typescript
    const winRateIndex = new Map([['b-atk', { wins: 1, losses: 9, winRate: 0.1 }]])
```

第 547 行同第 520 行的改法（同一段文字，`replace_all` 這次沒問題，因為
兩處內容完全相同，改完應該只剩兩處相異的 520/539 各自獨立改過）。

- [ ] **Step 3: 執行測試確認通過**

Run: `npx tsc -b && npm test -- tests/unit/deck.test.ts`
Expected: `tsc` 在這個檔案不再報錯（其他檔案的型別錯誤這一步還不用管），
`npm test -- tests/unit/deck.test.ts` 55/55 PASS。

- [ ] **Step 4: Commit**

```bash
git add tests/unit/deck.test.ts
git commit -m "$(cat <<'EOF'
test: drop stale ties field from deck.test.ts PartWinRateEntry literals

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3：IndexedDB schema v7 與 `repository.ts` 改名

**Files:**
- Modify: `src/data/db.ts`
- Modify: `src/data/repository.ts`
- Modify: `tests/integration/repository.test.ts`

**Interfaces:**
- Consumes: `BattleMatch`（Task 1）、`isMatchComplete`（Task 1）。
- Produces（`Repository` interface）：
  - `listBattleMatches(): Promise<BattleMatch[]>`
  - `saveBattleMatch(input: Omit<BattleMatch, 'id' | 'createdAt'>): Promise<string>`（未打完的比賽會 `throw`）
  - `deleteBattleMatch(id: string): Promise<void>`

- [ ] **Step 1: `db.ts` 加 v7 schema**

在 import 區塊，把：

```typescript
import type {
  BattleRound,
  CompatibilityRule,
```

改成：

```typescript
import type {
  BattleMatch,
  CompatibilityRule,
```

`BeybladeDb` interface 裡，把：

```typescript
  battleRounds: EntityTable<BattleRound, 'id'>
```

改成：

```typescript
  battleMatches: EntityTable<BattleMatch, 'id'>
```

`createDb()` 函式裡，`db.version(6).stores({ battleRounds: 'id, playedAt' })`
後面加：

```typescript
  db.version(7).stores({
    // 這次是資料形狀真的不相容（單局結果 → 逐分紀錄），不做欄位轉換，
    // 上一輪功能才上線一天，沒有值得保留的真實紀錄。
    battleRounds: null,
    battleMatches: 'id, playedAt',
  })
```

- [ ] **Step 2: 寫失敗的 CRUD／migration 測試**

打開 `tests/integration/repository.test.ts`，找 `describe('對戰紀錄（個人
1v1 練習對戰，第 3 節）'` 那個區塊（現在大約第 875-940 行），**整段刪掉**，
換成：

```typescript
describe('對戰紀錄（逐分計分板，第 25-battle-match-scoreboard 節）', () => {
  it('可以新增、列出、刪除一場打完的對戰', async () => {
    const repo = createRepository(createDb(`test-battle-match-${Date.now()}`))
    const id = await repo.saveBattleMatch({
      a: { bladeId: 'blade-a' },
      b: { bladeId: 'blade-b' },
      points: [
        { scorer: 'a', finish: 'xtreme' },
        { scorer: 'a', finish: 'spin' },
      ],
      playedAt: '2026-09-25',
    })
    const matches = await repo.listBattleMatches()
    expect(matches).toHaveLength(1)
    expect(matches[0]!.id).toBe(id)
    expect(matches[0]!.a.bladeId).toBe('blade-a')

    await repo.deleteBattleMatch(id)
    expect(await repo.listBattleMatches()).toHaveLength(0)
  })

  it('沒有一邊到 4 分的比賽不能存檔', async () => {
    const repo = createRepository(createDb(`test-battle-match-incomplete-${Date.now()}`))
    await expect(
      repo.saveBattleMatch({
        a: { bladeId: 'blade-a' },
        b: { bladeId: 'blade-b' },
        points: [{ scorer: 'a', finish: 'over_burst' }],
        playedAt: '2026-09-25',
      }),
    ).rejects.toThrow('這場對戰還沒打完')
  })

  it('v6 升級到 v7 會把舊的 battleRounds 表整個刪掉，不轉換資料，且不影響其他既有資料', async () => {
    const dbName = `test-migration-v7-${Date.now()}`
    const oldDb = new Dexie(dbName) as BeybladeDb
    oldDb.version(6).stores({
      parts: 'id, family, system, code',
      partVariants: 'id, partId',
      products: 'id, line, category, sku',
      productVariants: 'id, productId',
      compatibilityRules: 'id, partId',
      images: 'id, [entityType+entityId]',
      ownedProducts: 'id, productId, status',
      inventoryLots: 'id, partId, status, sourceType',
      partPreferences: 'partId, favorite',
      savedCombos: 'id, favorite, physicallyBuilt',
      decks: 'id',
      wishlist: 'id, productId',
      battleRounds: 'id, playedAt',
      tournamentEvents: 'id, date, country',
      tournamentDecks: 'id, eventId',
      tournamentObservations: 'id, eventId',
      meta: 'key',
    })
    await oldDb.open()
    await oldDb.table('inventoryLots').add({
      id: 'lot-1',
      sourceType: 'manual_adjustment',
      partId: 'blade-a',
      quantity: 1,
      status: 'available',
      condition: 'new',
      createdAt: '2026-01-01',
    })
    await oldDb.table('battleRounds').add({
      id: 'old-round-1',
      a: { bladeId: 'blade-a' },
      b: { bladeId: 'blade-b' },
      result: 'a',
      finish: 'spin',
      playedAt: '2026-09-20',
      createdAt: '2026-09-20T00:00:00.000Z',
    })
    oldDb.close()

    const upgraded = createDb(dbName)
    await upgraded.open()
    expect(upgraded.verno).toBe(7)
    expect(await upgraded.inventoryLots.get('lot-1')).toMatchObject({ partId: 'blade-a' })
    expect(upgraded.tables.map((table) => table.name)).not.toContain('battleRounds')
    expect(await upgraded.battleMatches.toArray()).toHaveLength(0)
    upgraded.close()
  })
})
```

在 `describe('IndexedDB v5 migration'` 那個區塊（現在大約第 602-640 行）
最後一行斷言：

```typescript
    expect(await migrated.battleRounds.toArray()).toHaveLength(0)
```

改成：

```typescript
    // v7 已經把 battleRounds 表整個刪掉（見上面的「對戰紀錄（逐分計分板…」
    // 那組 migration 測試），這裡改成確認表真的不存在，不是空表。
    expect(migrated.tables.map((table) => table.name)).not.toContain('battleRounds')
```

`describe('匯出與匯入（第 37 節）'` 裡：

- 第一條測試（大約第 464-480 行）斷言 `Object.keys(backup).sort()` 那個
  陣列，把 `'battleRounds'` 換成 `'battleMatches'`。
- 「個人對戰紀錄會被匯出，匯入後完整回復」那條（大約第 482-503 行），
  `repo.saveBattleRound({...})` 改成 `repo.saveBattleMatch({...})`，
  參數的 `result: 'a', finish: 'spin'` 改成
  `points: [{ scorer: 'a', finish: 'xtreme' }, { scorer: 'a', finish: 'spin' }]`，
  `otherRepo.listBattleRounds()` 改成 `otherRepo.listBattleMatches()`。
- 「舊版（沒有 battleRounds 欄位）的備份可以照常匯入」那條（大約第
  505-519 行），`delete legacyBackup.battleRounds` 改成
  `delete legacyBackup.battleMatches`，`otherRepo.listBattleRounds()` 改成
  `otherRepo.listBattleMatches()`。
- 「匯入 v4 舊備份時忽略逐局欄位」那條（大約第 555-590 行），
  `battleRounds: [{ id: 'legacy-round', notes: '應忽略且不驗證' }] as never`
  這個欄位名維持 `battleRounds`（v4 備份本來就是這個舊名字，這條測試就是
  在驗證「無論舊備份裡的欄位叫什麼名字，只要 schemaVersion 不夠新就不會
  被讀」），但斷言的地方 `otherDb.battleRounds.toArray()` 要改成確認
  `battleMatches` 是空的：`expect(otherDb.tables.map((t) => t.name)).not.toContain('battleRounds')`
  加上 `expect(await otherDb.battleMatches.toArray()).toHaveLength(0)`。

- [ ] **Step 3: 執行測試確認失敗**

Run: `npm test -- tests/integration/repository.test.ts`
Expected: `saveBattleMatch`／`listBattleMatches`／`deleteBattleMatch` 不存在，
大量 FAIL。

- [ ] **Step 4: `repository.ts` 改名與驗證邏輯**

Import 區塊，`BattleRound,` 改成 `BattleMatch,`，並加：

```typescript
import { isMatchComplete } from '../domain/battleRecords.ts'
```

（`repository.ts` 目前沒有 import `domain/battleRecords.ts` 的任何東西，
這是第一次跨進來——確認這不違反第 48.4 節的分層規則：`battleRecords.ts`
是純函式、不 import Dexie，`repository.ts` import 純函式沒有問題，跟
`repository.ts` 既有 import `domain/inventory.ts`／`domain/naming.ts` 的
既有慣例一致。）

`Repository` interface 裡：

```typescript
  listBattleRounds(): Promise<BattleRound[]>
  saveBattleRound(input: Omit<BattleRound, 'id' | 'createdAt'>): Promise<string>
  deleteBattleRound(id: string): Promise<void>
```

改成：

```typescript
  listBattleMatches(): Promise<BattleMatch[]>
  saveBattleMatch(input: Omit<BattleMatch, 'id' | 'createdAt'>): Promise<string>
  deleteBattleMatch(id: string): Promise<void>
```

實作區塊：

```typescript
    listBattleRounds: () => db.battleRounds.toArray(),

    async saveBattleRound(input) {
      const round: BattleRound = { id: newId(), createdAt: nowIso(), ...input }
      await db.battleRounds.add(round)
      return round.id
    },

    async deleteBattleRound(id) {
      await db.battleRounds.delete(id)
    },
```

改成：

```typescript
    listBattleMatches: () => db.battleMatches.toArray(),

    async saveBattleMatch(input) {
      if (!isMatchComplete(input.points)) {
        throw new Error('這場對戰還沒打完（還沒有一邊到 4 分），不能存檔')
      }
      const match: BattleMatch = { id: newId(), createdAt: nowIso(), ...input }
      await db.battleMatches.add(match)
      return match.id
    },

    async deleteBattleMatch(id) {
      await db.battleMatches.delete(id)
    },
```

`exportBackup()`：把三處 `battleRounds` 改成 `battleMatches`（解構變數名、
`Promise.all` 裡的 `db.battleRounds.toArray()` 改 `db.battleMatches.toArray()`、
回傳物件裡的欄位名）。

`importBackup()`：

```typescript
      const battleRounds = payload.schemaVersion >= 6 ? (payload.battleRounds ?? []) : []
      const arrays: [string, unknown][] = [
        ['ownedProducts', payload.ownedProducts],
        ['inventoryLots', payload.inventoryLots],
        ['partPreferences', payload.partPreferences ?? []],
        ['savedCombos', payload.savedCombos],
        ['decks', payload.decks],
        ['wishlist', payload.wishlist],
        ['battleRounds', battleRounds],
      ]
```

改成：

```typescript
      /*
       * schemaVersion < 7 的備份不會有（相容的）battleMatches 欄位——v6 以前
       * 這個位置要嘛沒有這個概念，要嘛是舊版 BattleRound 的資料形狀，跟這次
       * BattleMatch 完全不同，一律當作沒有這個欄位、匯入後留空。
       */
      const battleMatches = payload.schemaVersion >= 7 ? (payload.battleMatches ?? []) : []
      const arrays: [string, unknown][] = [
        ['ownedProducts', payload.ownedProducts],
        ['inventoryLots', payload.inventoryLots],
        ['partPreferences', payload.partPreferences ?? []],
        ['savedCombos', payload.savedCombos],
        ['decks', payload.decks],
        ['wishlist', payload.wishlist],
        ['battleMatches', battleMatches],
      ]
```

`for` 驗證迴圈不用改（照舊）。`db.transaction(...)` 的 store 清單跟
`clear()`／`bulkAdd()` 呼叫，把 `db.battleRounds` 全部改成 `db.battleMatches`，
`bulkAdd(battleRounds)` 改成 `bulkAdd(battleMatches)`。

`BackupPayload` interface（`export interface BackupPayload { ... }`，
第 80-90 行附近）裡的 `battleRounds: BattleRound[]` 改成
`battleMatches: BattleMatch[]`。

- [ ] **Step 5: 執行測試確認通過**

Run: `npm test -- tests/integration/repository.test.ts`
Expected: 全部 PASS。

- [ ] **Step 6: Commit**

```bash
git add src/data/db.ts src/data/repository.ts tests/integration/repository.test.ts
git commit -m "$(cat <<'EOF'
feat: schema v7 -- battleRounds dropped, battleMatches added

saveBattleMatch() rejects incomplete matches (no side reached 4 points
yet) via isMatchComplete() -- can't save a half-finished game. Backup
export/import renamed to battleMatches, gated on schemaVersion >= 7.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4：`appStore.ts` 改名

**Files:**
- Modify: `src/store/appStore.ts`

**Interfaces:**
- Consumes: `repo.listBattleMatches()`（Task 3）。
- Produces: `useAppStore` state 欄位改名成 `battleMatches: BattleMatch[]`。

沒有獨立單元測試，跟上一輪同一個理由（React store 膠水層，靠 Task 6 的
e2e 間接驗證）。

- [ ] **Step 1: 逐處改名**

Import 區塊：`BattleRound,` 改成 `BattleMatch,`。

`AppState` interface：`battleRounds: BattleRound[]` 改成
`battleMatches: BattleMatch[]`。

初始狀態物件：`battleRounds: [],` 改成 `battleMatches: [],`。

`refresh()` 函式三處（陣列解構、`Promise.all` 陣列、`set({...})`）的
`battleRounds` 全部改成 `battleMatches`；`Promise.all` 陣列裡的
`repo.listBattleRounds(),` 改成 `repo.listBattleMatches(),`。**三處的順序
必須完全對應**（跟上一輪同一個提醒：陣列解構照順序賦值）。

- [ ] **Step 2: 驗證**

Run: `npx tsc -b`
Expected: `appStore.ts` 本身不再報錯；`BuilderPage.tsx`／`DecksPage.tsx`／
`BattleLogPage.tsx` 還會報錯（還沒改到），這一步先確認 `appStore.ts` 乾淨
就好。

- [ ] **Step 3: Commit**

```bash
git add src/store/appStore.ts
git commit -m "$(cat <<'EOF'
feat: rename appStore battleRounds -> battleMatches

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5：`BattleLogPage` 全頁重寫、`BuilderPage`／`DecksPage`／`App.tsx` 跟進

**Files:**
- Modify: `src/ui/pages/BattleLogPage.tsx`（整檔重寫）
- Modify: `src/ui/pages/BuilderPage.tsx`
- Modify: `src/ui/pages/DecksPage.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `BattleMatch`／`BattlePoint`／`BattleFinish`（Task 1）、
  `computeMatchScore`／`isMatchComplete`／`matchWinner`／`FINISH_POINTS`／
  `MATCH_WIN_SCORE`／`computePartWinRateIndex`／`LOW_SAMPLE_THRESHOLD`
  （Task 1）、`repo.saveBattleMatch`／`listBattleMatches`／
  `deleteBattleMatch`（Task 3）、`state.battleMatches`（Task 4）、
  `PartPickerField`（既有元件，`src/ui/components/PartPicker.tsx`）、
  `getBuilderSlotSchema`／`BuilderStructure`（既有，
  `src/domain/compatibility.ts`）。

- [ ] **Step 1: 整檔重寫 `BattleLogPage.tsx`**

```typescript
/**
 * 個人對戰紀錄：逐分計分板，記一場個別對戰（先到 4 分獲勝）。
 *
 * 規格對照：docs/superpowers/specs/2026-09-25-battle-match-scoreboard-design.md。
 */
import { useMemo, useState } from 'react'
import { repo, useAppStore } from '../../store/appStore.ts'
import {
  computeMatchScore,
  computePartWinRateIndex,
  isMatchComplete,
  matchWinner,
  FINISH_POINTS,
  LOW_SAMPLE_THRESHOLD,
} from '../../domain/battleRecords.ts'
import { resolveDisplayName } from '../../domain/naming.ts'
import { getBuilderSlotSchema, type BuilderStructure } from '../../domain/compatibility.ts'
import type { BattleFinish, BattlePoint, ComboSlots } from '../../domain/types.ts'
import { EmptyState, PageHeader, Row, Section } from '../components/ui.tsx'
import { PartPickerField } from '../components/PartPicker.tsx'

const FINISH_ZH: Record<BattleFinish, string> = {
  spin: '轉停',
  over_burst: '出界／爆裂',
  xtreme: '極限',
}

const EMPTY_AVAILABILITY = new Map<string, { free: number }>()

/** 本地時區的今天日期（YYYY-MM-DD），不用 UTC（見上一輪的既有教訓）。 */
function localDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function hasAnyPart(slots: ComboSlots): boolean {
  return Object.values(slots).some(Boolean)
}

export function BattleLogPage() {
  const parts = useAppStore((state) => state.parts)
  const images = useAppStore((state) => state.images)
  const battleMatches = useAppStore((state) => state.battleMatches)
  const run = useAppStore((state) => state.run)

  const [structureA, setStructureA] = useState<BuilderStructure>('standard')
  const [structureB, setStructureB] = useState<BuilderStructure>('standard')
  const [slotsA, setSlotsA] = useState<ComboSlots>({})
  const [slotsB, setSlotsB] = useState<ComboSlots>({})
  const [points, setPoints] = useState<BattlePoint[]>([])
  const [playedAt, setPlayedAt] = useState(() => localDateString(new Date()))
  const [notes, setNotes] = useState('')

  const partsById = useMemo(() => new Map(parts.map((part) => [part.id, part])), [parts])
  const nameOf = (partId: string) => {
    const part = partsById.get(partId)
    return part ? resolveDisplayName(part.naming).titleZhTW : partId
  }
  const comboLabel = (slots: ComboSlots) =>
    Object.values(slots)
      .filter((partId): partId is string => Boolean(partId))
      .map(nameOf)
      .join('+')

  const schemaA = useMemo(() => getBuilderSlotSchema(structureA, slotsA, parts), [structureA, slotsA, parts])
  const schemaB = useMemo(() => getBuilderSlotSchema(structureB, slotsB, parts), [structureB, slotsB, parts])

  const winRateIndex = useMemo(() => computePartWinRateIndex(battleMatches), [battleMatches])

  const ready = hasAnyPart(slotsA) && hasAnyPart(slotsB)
  const score = computeMatchScore(points)
  const complete = isMatchComplete(points)
  const winner = matchWinner(points)

  async function handleSave() {
    if (!complete) return
    const ok = await run(() =>
      repo.saveBattleMatch({
        a: slotsA,
        b: slotsB,
        points,
        playedAt,
        ...(notes ? { notes } : {}),
      }),
    )
    if (ok) {
      setPoints([])
      setNotes('')
    }
  }

  const winRateRows = [...winRateIndex.entries()].map(([partId, entry]) => ({
    partId,
    nameZhTW: nameOf(partId),
    ...entry,
  }))

  return (
    <div>
      <PageHeader title="個人對戰紀錄" description="記錄自己或跟朋友的 1v1 對戰，先到 4 分獲勝，非賽事證據" />

      <Section title="配裝 A">
        <Row>
          <button type="button" className={structureA === 'standard' ? 'btn btn-primary' : 'btn'} onClick={() => setStructureA('standard')}>
            三件式（BX／UX）
          </button>
          <button type="button" className={structureA === 'cx' ? 'btn btn-primary' : 'btn'} onClick={() => setStructureA('cx')}>
            CX 模組化
          </button>
        </Row>
        <div className="stack">
          {schemaA.map((def) => (
            <PartPickerField
              key={def.key}
              def={def}
              options={parts.filter((part) => def.families.includes(part.family))}
              selectedPart={parts.find((part) => part.id === slotsA[def.key])}
              availability={EMPTY_AVAILABILITY}
              images={images}
              idPrefix="a"
              onChange={(next) => setSlotsA({ ...slotsA, [def.key]: next || undefined })}
            />
          ))}
        </div>
      </Section>

      <Section title="配裝 B">
        <Row>
          <button type="button" className={structureB === 'standard' ? 'btn btn-primary' : 'btn'} onClick={() => setStructureB('standard')}>
            三件式（BX／UX）
          </button>
          <button type="button" className={structureB === 'cx' ? 'btn btn-primary' : 'btn'} onClick={() => setStructureB('cx')}>
            CX 模組化
          </button>
        </Row>
        <div className="stack">
          {schemaB.map((def) => (
            <PartPickerField
              key={def.key}
              def={def}
              options={parts.filter((part) => def.families.includes(part.family))}
              selectedPart={parts.find((part) => part.id === slotsB[def.key])}
              availability={EMPTY_AVAILABILITY}
              images={images}
              idPrefix="b"
              onChange={(next) => setSlotsB({ ...slotsB, [def.key]: next || undefined })}
            />
          ))}
        </div>
      </Section>

      {ready ? (
        <Section title="計分板">
          <div className="card" data-testid="scoreboard">
            <Row>
              <strong data-testid="score-a">A {score.a}</strong>
              <span>-</span>
              <strong data-testid="score-b">{score.b} B</strong>
            </Row>
            <Row>
              <div className="stack">
                {(Object.keys(FINISH_POINTS) as BattleFinish[]).map((finish) => (
                  <button
                    key={finish}
                    type="button"
                    className="btn"
                    disabled={complete}
                    data-testid={`score-a-${finish}`}
                    onClick={() => setPoints([...points, { scorer: 'a', finish }])}
                  >
                    A {FINISH_ZH[finish]} +{FINISH_POINTS[finish]}
                  </button>
                ))}
              </div>
              <div className="stack">
                {(Object.keys(FINISH_POINTS) as BattleFinish[]).map((finish) => (
                  <button
                    key={finish}
                    type="button"
                    className="btn"
                    disabled={complete}
                    data-testid={`score-b-${finish}`}
                    onClick={() => setPoints([...points, { scorer: 'b', finish }])}
                  >
                    B {FINISH_ZH[finish]} +{FINISH_POINTS[finish]}
                  </button>
                ))}
              </div>
            </Row>
            <Row>
              <button type="button" className="btn" disabled={points.length === 0} onClick={() => setPoints(points.slice(0, -1))}>
                復原上一分
              </button>
              <button type="button" className="btn" disabled={points.length === 0} onClick={() => setPoints([])}>
                清除重來
              </button>
            </Row>
            {complete ? (
              <Row>
                <strong data-testid="match-winner">{winner === 'a' ? 'A 獲勝' : 'B 獲勝'}</strong>
                <label>
                  日期
                  <input type="date" value={playedAt} onChange={(event) => setPlayedAt(event.target.value)} required />
                </label>
                <label>
                  備註
                  <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="例如：跟阿翔在店裡打的" />
                </label>
                <button type="button" data-testid="save-match" onClick={() => void handleSave()}>
                  存檔
                </button>
              </Row>
            ) : null}
          </div>
        </Section>
      ) : null}

      <Section title="歷史紀錄">
        {battleMatches.length === 0 ? (
          <EmptyState title="還沒有任何對戰紀錄" />
        ) : (
          <ul>
            {[...battleMatches]
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
              .map((battleMatch) => {
                const finalScore = computeMatchScore(battleMatch.points)
                const finalWinner = matchWinner(battleMatch.points)
                return (
                  <li key={battleMatch.id} data-testid="battle-match">
                    {battleMatch.playedAt} · {comboLabel(battleMatch.a)}（A）vs {comboLabel(battleMatch.b)}（B） ·{' '}
                    比分 {finalScore.a}:{finalScore.b} ·{' '}
                    {finalWinner === 'a' ? 'A 獲勝' : 'B 獲勝'}
                    {battleMatch.notes ? ` · ${battleMatch.notes}` : ''}
                    <details>
                      <summary>逐分紀錄</summary>
                      <ul>
                        {battleMatch.points.map((point, index) => (
                          <li key={index}>
                            第 {index + 1} 分：{point.scorer === 'a' ? 'A' : 'B'}／{FINISH_ZH[point.finish]}
                          </li>
                        ))}
                      </ul>
                    </details>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm('確定要刪除這筆對戰紀錄嗎？')) {
                          void run(() => repo.deleteBattleMatch(battleMatch.id))
                        }
                      }}
                    >
                      刪除
                    </button>
                  </li>
                )
              })}
          </ul>
        )}
      </Section>

      <Section title="零件勝率（個人紀錄，非賽事證據）">
        {winRateRows.length === 0 ? (
          <EmptyState title="累積對戰紀錄後這裡會顯示每顆零件的勝率" />
        ) : (
          <div className="card" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid var(--border)' }}>零件</th>
                  <th style={{ textAlign: 'right', padding: '6px 10px', borderBottom: '1px solid var(--border)' }}>贏</th>
                  <th style={{ textAlign: 'right', padding: '6px 10px', borderBottom: '1px solid var(--border)' }}>輸</th>
                  <th style={{ textAlign: 'right', padding: '6px 10px', borderBottom: '1px solid var(--border)' }}>勝率</th>
                </tr>
              </thead>
              <tbody>
                {winRateRows.map((row) => (
                  <tr key={row.partId}>
                    <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)' }}>{row.nameZhTW}</td>
                    <td style={{ textAlign: 'right', padding: '6px 10px', borderBottom: '1px solid var(--border)' }}>{row.wins}</td>
                    <td style={{ textAlign: 'right', padding: '6px 10px', borderBottom: '1px solid var(--border)' }}>{row.losses}</td>
                    <td style={{ textAlign: 'right', padding: '6px 10px', borderBottom: '1px solid var(--border)' }}>
                      {row.winRate === undefined
                        ? `樣本不足（需 ${LOW_SAMPLE_THRESHOLD} 場以上）`
                        : `${Math.round(row.winRate * 100)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  )
}
```

- [ ] **Step 2: `App.tsx` 加主分頁**

把第 23-29 行：

```typescript
const TABS: { path: string; label: string }[] = [
  { path: '/', label: '首頁' },
  { path: '/products', label: '商品' },
  { path: '/parts', label: '零件' },
  { path: '/builder', label: '配裝' },
  { path: '/decks', label: '3on3' },
]
```

改成：

```typescript
const TABS: { path: string; label: string }[] = [
  { path: '/', label: '首頁' },
  { path: '/products', label: '商品' },
  { path: '/parts', label: '零件' },
  { path: '/builder', label: '配裝' },
  { path: '/decks', label: '3on3' },
  { path: '/battle-log', label: '對戰' },
]
```

`Page()` 函式的 `case '/battle-log': return <BattleLogPage />` 已經存在，
不用動。

- [ ] **Step 3: `BuilderPage.tsx` 改名**

第 91-92 行：

```typescript
  const battleRounds = useAppStore((state) => state.battleRounds)
  const winRateIndex = useMemo(() => computePartWinRateIndex(battleRounds), [battleRounds])
```

改成：

```typescript
  const battleMatches = useAppStore((state) => state.battleMatches)
  const winRateIndex = useMemo(() => computePartWinRateIndex(battleMatches), [battleMatches])
```

`personalWinRateStatusZhTW()` 函式（第 60-78 行）本身邏輯不用改——它只吃
`winRateIndex: ReturnType<typeof computePartWinRateIndex>`，回傳型別的
`PartWinRateEntry` 已經在 Task 1 拔掉 `ties`，這個函式從來沒讀過 `.ties`，
不受影響。

- [ ] **Step 4: `DecksPage.tsx` 改名**

第 56、68 行同款改名：

```typescript
  const battleRounds = useAppStore((state) => state.battleRounds)
```

改成：

```typescript
  const battleMatches = useAppStore((state) => state.battleMatches)
```

```typescript
  const winRateIndex = useMemo(() => computePartWinRateIndex(battleRounds), [battleRounds])
```

改成：

```typescript
  const winRateIndex = useMemo(() => computePartWinRateIndex(battleMatches), [battleMatches])
```

- [ ] **Step 5: 型別檢查**

Run: `npx tsc -b`
Expected: 乾淨無輸出。

- [ ] **Step 6: Commit**

```bash
git add src/ui/pages/BattleLogPage.tsx src/App.tsx src/ui/pages/BuilderPage.tsx src/ui/pages/DecksPage.tsx
git commit -m "$(cat <<'EOF'
feat: rewrite BattleLogPage as a point-by-point scoreboard

No more picking from saved combos -- inline part pickers (reusing
PartPickerField/getBuilderSlotSchema from the builder) let you set up
both sides on the spot, independent BX/UX/CX per side. Score buttons
per finish type, undo-last-point and reset-points controls, save gated
on the match actually being complete. Added a top-level "對戰" tab.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6：e2e、截圖、文件收尾

**Files:**
- Modify: `tests/e2e/pwa.spec.ts`（第 571-634 行附近，整條測試重寫）
- Modify: `tests/e2e/screenshot.shots.ts`（第 61-90 行附近）
- Modify: `docs/superpowers/specs/2026-09-25-battle-match-scoreboard-design.md`
- Modify: `BEYBLADE_X_codex_prompt.md`
- Modify: `HANDOFF.md`

**Interfaces:** 無新程式碼介面。

- [ ] **Step 1: 重寫 e2e 測試**

`tests/e2e/pwa.spec.ts` 裡找 `test('個人對戰紀錄：記一局後歷史列表與零件
勝率簡表都會更新'` 那條（大約第 571-634 行），整條刪掉換成：

```typescript
test('個人對戰紀錄：現場選零件記分、打完存檔、歷史列表跟零件勝率簡表更新', async ({ page }) => {
  await openApp(page, '/battle-log')

  // 兩邊都還沒選零件時，計分板不該出現（Review Focus 第 3 項）。
  const scoreboard = page.getByTestId('scoreboard')
  await expect(scoreboard).toHaveCount(0)

  // 配裝 A：BX 三件式，直接用零件圖鑑的零件，不用先存配裝。
  await pickSlot(page, 'bladeId', 'blade:ドランソード', 'a')
  await pickSlot(page, 'ratchetId', 'ratchet:3-60', 'a')
  await pickSlot(page, 'bitId', 'bit:F', 'a')

  // A 選完、B 還沒選時，計分板還是不該出現。
  await expect(scoreboard).toHaveCount(0)

  // 配裝 B：另一顆上蓋，同款固鎖軸心。
  await pickSlot(page, 'bladeId', 'blade:ドランバスター', 'b')
  await pickSlot(page, 'ratchetId', 'ratchet:3-60', 'b')
  await pickSlot(page, 'bitId', 'bit:F', 'b')

  await expect(scoreboard).toBeVisible()

  // 先打到剛好 4 分（轉停×4），確認打完鎖住按鈕，再用「復原上一分」退回
  // 3 分，驗證按鈕真的重新解鎖（Review Focus 第 1 項——不能只退比分數字，
  // 沒有真的把按鈕解鎖）。
  for (let i = 0; i < 4; i++) await page.getByTestId('score-a-spin').click()
  await expect(page.getByTestId('score-a')).toHaveText('A 4')
  await expect(page.getByTestId('score-a-spin')).toBeDisabled()
  await expect(page.getByTestId('score-b-xtreme')).toBeDisabled()
  await expect(page.getByTestId('match-winner')).toHaveText('A 獲勝')

  await page.getByRole('button', { name: '復原上一分' }).click()
  await expect(page.getByTestId('score-a')).toHaveText('A 3')
  await expect(page.getByTestId('score-a-spin')).toBeEnabled()
  await expect(page.getByTestId('score-b-xtreme')).toBeEnabled()
  await expect(page.getByTestId('match-winner')).toHaveCount(0)

  // 清除重來，改用極限＋轉停湊到 4 分，同時測極限一次跳 3 分正確累加。
  await page.getByRole('button', { name: '清除重來' }).click()
  await expect(page.getByTestId('score-a')).toHaveText('A 0')
  await page.getByTestId('score-a-xtreme').click()
  await expect(page.getByTestId('score-a')).toHaveText('A 3')
  await page.getByTestId('score-a-spin').click()
  await expect(page.getByTestId('score-a')).toHaveText('A 4')
  await expect(page.getByTestId('match-winner')).toHaveText('A 獲勝')

  await page.getByTestId('save-match').click()

  await expect(page.getByTestId('battle-match').first()).toContainText('比分 4:0')
  await expect(page.getByTestId('battle-match').first()).toContainText('A 獲勝')
  await page.getByTestId('battle-match').first().locator('summary').click()
  await expect(page.getByTestId('battle-match').first()).toContainText('第 1 分：A／極限')
  await expect(page.getByTestId('battle-match').first()).toContainText('第 2 分：A／轉停')

  // 只打完 1 場，遠低於 LOW_SAMPLE_THRESHOLD（5），零件勝率簡表要顯示樣本不足。
  await expect(page.getByText(/樣本不足/).first()).toBeVisible()

  // 存檔後 points 要清空、配裝維持（Review Focus 第 4 項）：計分板回到
  // 0:0 可以連續記下一場，且配裝 A 的零件選擇器仍顯示剛剛選的上蓋，
  // 不用重選。
  await expect(page.getByTestId('score-a')).toHaveText('A 0')
  await expect(page.getByTestId('score-a-spin')).toBeEnabled()
  await expect(page.getByTestId('slot-trigger-a-bladeId')).toContainText('蒼龍神劍')
})

test('個人對戰紀錄：配裝器狀態行反映樣本不足的狀態', async ({ page }) => {
  await openApp(page, '/battle-log')
  await pickSlot(page, 'bladeId', 'blade:ドランソード', 'a')
  await pickSlot(page, 'ratchetId', 'ratchet:3-60', 'a')
  await pickSlot(page, 'bitId', 'bit:F', 'a')
  await pickSlot(page, 'bladeId', 'blade:ドランバスター', 'b')
  await pickSlot(page, 'ratchetId', 'ratchet:3-60', 'b')
  await pickSlot(page, 'bitId', 'bit:F', 'b')
  await page.getByTestId('score-a-xtreme').click()
  await page.getByTestId('score-a-spin').click()
  await page.getByTestId('save-match').click()
  await expect(page.getByTestId('battle-match').first()).toBeVisible()

  await openApp(page, '/builder')
  await page.getByRole('button', { name: '顯示全部圖鑑' }).click()
  await pickSlot(page, 'bladeId', 'blade:ドランソード')
  await pickSlot(page, 'ratchetId', 'ratchet:3-60')
  await pickSlot(page, 'bitId', 'bit:F')
  await expect(page.getByText(/個人對戰紀錄：已有對戰紀錄，樣本還不夠/)).toBeVisible()
})
```

檢查 `tests/e2e/helpers.ts` 的 `pickSlot()` 簽名（`pickSlot(page, slotKey,
partId, prefix?)`）已經支援第四個 `prefix` 參數，直接傳 `'a'`／`'b'`
就會對應到 `PartPickerField` 的 `idPrefix`，不用改 `helpers.ts`。

- [ ] **Step 2: 執行 e2e**

Run: `npx playwright test tests/e2e/pwa.spec.ts -g "個人對戰紀錄"`
Expected: 全部 PASS（手機／桌機兩個寬度）。

- [ ] **Step 3: 改截圖腳本**

`tests/e2e/screenshot.shots.ts` 裡找第 61-90 行附近「個人對戰紀錄要看有
資料時的版面」那段，整段換成：

```typescript
  /*
   * 個人對戰紀錄要看有資料時的版面：現場選兩套零件、打完一場、截
   * /battle-log。
   */
  await page.evaluate(() => {
    window.location.hash = '/battle-log'
  })
  await pickSlot(page, 'bladeId', 'blade:ドランソード', 'a')
  await pickSlot(page, 'ratchetId', 'ratchet:3-60', 'a')
  await pickSlot(page, 'bitId', 'bit:F', 'a')
  await pickSlot(page, 'bladeId', 'blade:ドランバスター', 'b')
  await pickSlot(page, 'ratchetId', 'ratchet:3-60', 'b')
  await pickSlot(page, 'bitId', 'bit:F', 'b')
  await page.getByTestId('score-a-xtreme').click()
  await page.getByTestId('score-a-spin').click()
  await page.getByTestId('save-match').click()
  await expect(page.getByTestId('battle-match').first()).toContainText('A 獲勝')
  await page.waitForTimeout(400)
  await page.screenshot({
    path: `${testInfo.project.outputDir}/../shots/${testInfo.project.name}-battle-log.png`,
    fullPage: true,
  })
```

- [ ] **Step 4: 執行截圖並人工核對**

Run: `npm run shots`
用 Read 工具打開 `desktop-battle-log.png`／`phone-battle-log.png`，確認
配裝 A／B 選擇器、計分板、按鈕、歷史列表、零件勝率表都正常顯示，手機寬度
不跑版，沒有殘留英文或未翻譯字串。

- [ ] **Step 5: 更新 spec 狀態列**

把 `docs/superpowers/specs/2026-09-25-battle-match-scoreboard-design.md`
第 3 行：

```
**狀態**：設計已跟使用者逐段確認，待書面 spec 審核。
```

改成：

```
**狀態**：已實作並上線，實作計畫見
`docs/superpowers/plans/2026-09-25-battle-match-scoreboard.md`。
```

- [ ] **Step 6: 更新 `BEYBLADE_X_codex_prompt.md`**

找第 51 節（「個人對戰紀錄（1v1 練習對戰 → 零件勝率）」），在段落最後加一句：

```
2026-09-25 更新：資料模型從「一局一個籠統結果」換成逐分計分板
（`BattleMatch`／`BattlePoint`），符合官方先到 4 分獲勝規則（轉停 1／
出界爆裂 2／極限 3）。記錄畫面不再需要先存配裝，現場選零件記分，加入
主分頁「對戰」。詳細設計見
`docs/superpowers/specs/2026-09-25-battle-match-scoreboard-design.md`。
```

- [ ] **Step 7: 更新 `HANDOFF.md`**

先跑 `git status --short`、`git rev-parse --short HEAD`、
`git rev-parse --short origin/main`。把「目前目標」改成這輪做完逐分計分板
升級，「發布狀態」表格換成最新 SHA，「已知缺口」維持上一輪那條（不做
3on3 團體賽整場比分、不做同步）不變，補一條「`FINISH_POINTS` 之後如果
要調整，舊紀錄的比分會跟著重算變動，這輪沒有做版本化快照」。

- [ ] **Step 8: Commit**

```bash
git add tests/e2e/pwa.spec.ts tests/e2e/screenshot.shots.ts docs/superpowers/specs/2026-09-25-battle-match-scoreboard-design.md BEYBLADE_X_codex_prompt.md HANDOFF.md
git commit -m "$(cat <<'EOF'
test: add e2e/screenshot coverage for scoreboard rewrite; docs sync

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 9: Push**

```bash
git push origin main
```

- [ ] **Step 10: 部署**

Run: `npm run deploy:pages`

- [ ] **Step 11: 線上驗證**

Run: `npm run test:live`
Expected: 全部通過。

- [ ] **Step 12: 補最終部署結果到 HANDOFF**

把 Step 10、11 實際跑出來的 `gh-pages` commit SHA 與 `test:live` 結果寫回
`HANDOFF.md`，commit + push（純文件變更，不用再部署）：

```bash
git add HANDOFF.md
git commit -m "$(cat <<'EOF'
docs: record verified deploy result for battle match scoreboard

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
git push origin main
```
