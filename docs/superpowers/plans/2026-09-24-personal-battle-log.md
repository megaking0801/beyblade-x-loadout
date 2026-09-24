# 個人對戰紀錄 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓使用者記錄自己（或朋友之間）的 1v1 練習對戰結果，累積成一份
「零件勝率」訊號，回頭當配裝分析的第三種獨立 fallback（跟現有零件強度
fallback、高手 T 表評級平行存在，不合併）。

**Architecture:** 新增一張 IndexedDB 表存對戰紀錄（純本機，不同步），一支
純函式把紀錄聚合成 `Map<partId, PartWinRateEntry>`，接進 `deck.ts` 現有的
`scoreDeck()` 架構（跟 `expertTierGain` 同一種「獨立訊號各自加分」模式），
前台開一個新頁面記錄＋看統計。

**Tech Stack:** TypeScript、React、Dexie（IndexedDB）、Vitest（單元測試）、
Playwright（e2e／截圖）。

**Spec:** `docs/superpowers/specs/2026-09-24-personal-battle-log-design.md`

## Global Constraints

- 純本機 IndexedDB，不做跨裝置同步、不匯聚多人資料（規格第 1 節）。
- 不做影片證據、來源分級——全部自報，統一同一種信任等級（規格第 6 節）。
- 不做 Bradley–Terry 或任何統計模型，只用簡單比率＋樣本門檻
  `LOW_SAMPLE_THRESHOLD = 5`（規格第 3、6 節）。
- `PERSONAL_WIN_RATE_WEIGHT = 2`，這個常數不需要回測校準（規格第 4 節）。
- 平手（`tie`）不進 `winRate` 分母，只計進 `ties`（規格第 3 節）。
- `a`／`b` 存 `ComboSlots` 快照，不存 `savedComboId` 參照（規格第 2 節）。
- 不重建被刪掉的 Compare 頁面（規格第 5 節）。
- `computePartWinRateIndex()` 整批重算，不做增量更新（規格第 3 節）。

## Review Focus

- 同一顆零件同時出現在配裝 A 跟配裝 B（例如兩套都用同一種固鎖）——輸贏要
  各自算對自己那一邊，不能互相污染。
- 使用者刪除一局紀錄後，零件勝率要正確反映刪除後的結果，不能殘留刪除前的
  計數（整批重算的正確性）。
- IndexedDB 從舊版（沒有 `battleRounds` 表）升級到新版，既有的
  `savedCombos`／`decks`／庫存資料不能被動到——這個專案曾經因為 migration
  處理不當動到使用者庫存吃過虧（`HANDOFF.md` 的「踩過的坑」多次提到）。
- 平手局在 UI 上要看得到（不能因為不進 `winRate` 分母就從歷史列表消失），
  使用者才知道自己記的東西有沒有被吃掉。
- 沒有任何對戰紀錄時，`personalWinRateGain` 要是 0（不影響總分排序），不能
  讓「完全沒記錄過」被當成負面訊號懲罰任何配裝。

---

### Task 1: 型別與純函式 `domain/battleRecords.ts`

**Files:**
- Modify: `src/domain/types.ts`（加型別，緊接在 `SavedCombo` 之後，約第 444 行）
- Create: `src/domain/battleRecords.ts`
- Test: `tests/unit/battleRecords.test.ts`

**Interfaces:**
- Produces:
  - `BattleRoundResult = 'a' | 'b' | 'tie'`
  - `BattleFinish = 'spin' | 'over' | 'burst' | 'xtreme' | 'none'`
  - `interface BattleRound { id: string; a: ComboSlots; b: ComboSlots; result: BattleRoundResult; finish: BattleFinish; playedAt: string; notes?: string; createdAt: string }`
  - `interface PartWinRateEntry { wins: number; losses: number; ties: number; winRate?: number }`
  - `function computePartWinRateIndex(rounds: BattleRound[]): Map<string, PartWinRateEntry>`
  - `const LOW_SAMPLE_THRESHOLD = 5`（export，供之後的測試與其他模組核對用）

- [ ] **Step 1: 在 `types.ts` 加型別**

在 `src/domain/types.ts` 的 `SavedCombo` interface 後面（目前第 444 行
`}` 之後）插入：

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

- [ ] **Step 2: 寫失敗測試**

建立 `tests/unit/battleRecords.test.ts`：

```typescript
import { describe, expect, it } from 'vitest'
import { computePartWinRateIndex, LOW_SAMPLE_THRESHOLD } from '../../src/domain/battleRecords.ts'
import type { BattleRound } from '../../src/domain/types.ts'

function round(overrides: Partial<BattleRound>): BattleRound {
  return {
    id: 'r1',
    a: { bladeId: 'blade-a' },
    b: { bladeId: 'blade-b' },
    result: 'a',
    finish: 'spin',
    playedAt: '2026-09-24',
    createdAt: '2026-09-24T00:00:00.000Z',
    ...overrides,
  }
}

describe('computePartWinRateIndex（第 3 節：零件勝率聚合）', () => {
  it('空陣列不拋錯，回傳空 Map', () => {
    const index = computePartWinRateIndex([])
    expect(index.size).toBe(0)
  })

  it('A 贏時，A 的零件各記一次贏、B 的零件各記一次輸', () => {
    const rounds: BattleRound[] = Array.from({ length: LOW_SAMPLE_THRESHOLD }, (_, i) =>
      round({ id: `r${i}`, result: 'a' }),
    )
    const index = computePartWinRateIndex(rounds)
    expect(index.get('blade-a')).toEqual({ wins: LOW_SAMPLE_THRESHOLD, losses: 0, ties: 0, winRate: 1 })
    expect(index.get('blade-b')).toEqual({ wins: 0, losses: LOW_SAMPLE_THRESHOLD, ties: 0, winRate: 0 })
  })

  it('平手不進 winRate 分母，只計進 ties', () => {
    const rounds: BattleRound[] = Array.from({ length: LOW_SAMPLE_THRESHOLD }, (_, i) =>
      round({ id: `r${i}`, result: 'tie' }),
    )
    const index = computePartWinRateIndex(rounds)
    expect(index.get('blade-a')).toEqual({ wins: 0, losses: 0, ties: LOW_SAMPLE_THRESHOLD, winRate: undefined })
  })

  it('同一顆零件同時出現在 A、B 兩邊的不同局，輸贏各自累加不互相污染', () => {
    const rounds: BattleRound[] = [
      ...Array.from({ length: 3 }, (_, i) =>
        round({ id: `w${i}`, a: { bladeId: 'shared' }, b: { bladeId: 'other-1' }, result: 'a' }),
      ),
      ...Array.from({ length: 3 }, (_, i) =>
        round({ id: `l${i}`, a: { bladeId: 'other-2' }, b: { bladeId: 'shared' }, result: 'a' }),
      ),
    ]
    const index = computePartWinRateIndex(rounds)
    // shared 在前 3 局是 a 方且贏了 3 次；在後 3 局是 b 方且輸了 3 次（因為 result 仍是 'a'，b 輸）
    expect(index.get('shared')).toEqual({ wins: 3, losses: 3, ties: 0, winRate: 0.5 })
  })

  it('樣本數（wins+losses）低於門檻時 winRate 是 undefined，但 wins/losses 數字仍然正確', () => {
    const rounds: BattleRound[] = Array.from({ length: LOW_SAMPLE_THRESHOLD - 1 }, (_, i) =>
      round({ id: `r${i}`, result: 'a' }),
    )
    const index = computePartWinRateIndex(rounds)
    const entry = index.get('blade-a')!
    expect(entry.wins).toBe(LOW_SAMPLE_THRESHOLD - 1)
    expect(entry.winRate).toBeUndefined()
  })

  it('CX 配置（多槽位）的每一顆零件都各自累加', () => {
    const rounds: BattleRound[] = Array.from({ length: LOW_SAMPLE_THRESHOLD }, (_, i) =>
      round({
        id: `r${i}`,
        a: { lockChipId: 'chip-1', mainBladeId: 'main-1', assistBladeId: 'assist-1', ratchetId: 'r-60', bitId: 'bit-f' },
        b: { bladeId: 'blade-b' },
        result: 'a',
      }),
    )
    const index = computePartWinRateIndex(rounds)
    for (const partId of ['chip-1', 'main-1', 'assist-1', 'r-60', 'bit-f']) {
      expect(index.get(partId)?.wins).toBe(LOW_SAMPLE_THRESHOLD)
    }
  })
})
```

- [ ] **Step 3: 執行測試確認失敗**

Run: `npm test -- tests/unit/battleRecords.test.ts`
Expected: 找不到 `src/domain/battleRecords.ts` 模組，全部測試 FAIL（或 import
錯誤）。

- [ ] **Step 4: 實作 `domain/battleRecords.ts`**

```typescript
/**
 * 個人對戰紀錄聚合（純函式）。
 *
 * 規格對照：docs/superpowers/specs/2026-09-24-personal-battle-log-design.md 第 3 節。
 */
import type { BattleRound } from './types.ts'

export const LOW_SAMPLE_THRESHOLD = 5

export interface PartWinRateEntry {
  wins: number
  losses: number
  ties: number
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

function partIdsOf(slots: BattleRound['a']): string[] {
  return SLOT_KEYS.map((key) => slots[key]).filter((id): id is string => Boolean(id))
}

interface MutableCount {
  wins: number
  losses: number
  ties: number
}

function ensure(counts: Map<string, MutableCount>, partId: string): MutableCount {
  const existing = counts.get(partId)
  if (existing) return existing
  const fresh: MutableCount = { wins: 0, losses: 0, ties: 0 }
  counts.set(partId, fresh)
  return fresh
}

export function computePartWinRateIndex(rounds: BattleRound[]): Map<string, PartWinRateEntry> {
  const counts = new Map<string, MutableCount>()

  for (const round of rounds) {
    const aParts = partIdsOf(round.a)
    const bParts = partIdsOf(round.b)

    if (round.result === 'tie') {
      for (const partId of [...aParts, ...bParts]) ensure(counts, partId).ties += 1
      continue
    }

    const winners = round.result === 'a' ? aParts : bParts
    const losers = round.result === 'a' ? bParts : aParts
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
Expected: `tsc` 乾淨，`npm test` 全部通過（新增這幾個測試不應該影響任何既有
測試，`types.ts` 只新增型別沒有改動既有欄位）。

- [ ] **Step 7: Commit**

```bash
git add src/domain/types.ts src/domain/battleRecords.ts tests/unit/battleRecords.test.ts
git commit -m "$(cat <<'EOF'
feat: add BattleRound type and computePartWinRateIndex()

Pure domain function only, not wired into IndexedDB or scoring yet.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: IndexedDB schema 與 repository CRUD

**Files:**
- Modify: `src/data/db.ts`
- Modify: `src/data/repository.ts`
- Test: `tests/integration/repository.test.ts`

**Interfaces:**
- Consumes: `BattleRound` from `src/domain/types.ts`（Task 1）。
- Produces（加進 `Repository` interface）：
  - `listBattleRounds(): Promise<BattleRound[]>`
  - `saveBattleRound(input: Omit<BattleRound, 'id' | 'createdAt'>): Promise<string>`
  - `deleteBattleRound(id: string): Promise<void>`

- [ ] **Step 1: 寫失敗的 migration／CRUD 測試**

打開 `tests/integration/repository.test.ts`，找現有 `saveCombo`／`deleteCombo`
的測試區塊（`describe` 標題含「配裝」或類似字樣），在同一個檔案裡新增：

```typescript
describe('對戰紀錄（個人 1v1 練習對戰，第 3 節）', () => {
  it('可以新增、列出、刪除對戰紀錄', async () => {
    const repo = createRepository(createDb(`test-battle-${Date.now()}`))
    const id = await repo.saveBattleRound({
      a: { bladeId: 'blade-a' },
      b: { bladeId: 'blade-b' },
      result: 'a',
      finish: 'spin',
      playedAt: '2026-09-24',
    })
    const rounds = await repo.listBattleRounds()
    expect(rounds).toHaveLength(1)
    expect(rounds[0]!.id).toBe(id)
    expect(rounds[0]!.a.bladeId).toBe('blade-a')

    await repo.deleteBattleRound(id)
    expect(await repo.listBattleRounds()).toHaveLength(0)
  })

  it('v5 升級到 v6 不會動到既有配裝與庫存資料', async () => {
    const dbName = `test-migration-battle-${Date.now()}`
    // 先用舊版本（沒有 battleRounds 表）寫一些既有資料。
    const oldDb = new Dexie(dbName) as BeybladeDb
    oldDb.version(5).stores({
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
    oldDb.close()

    // 用目前的 schema（含 battleRounds）重新開啟同一個資料庫名稱，觸發升級。
    const upgraded = createDb(dbName)
    await upgraded.open()
    const lots = await upgraded.inventoryLots.toArray()
    expect(lots).toHaveLength(1)
    expect(lots[0]!.id).toBe('lot-1')
    const rounds = await upgraded.battleRounds.toArray()
    expect(rounds).toHaveLength(0)
    upgraded.close()
  })
})
```

在檔案最上面確認有 `import Dexie from 'dexie'` 與
`import { createDb, type BeybladeDb } from '../../src/data/db.ts'`（如果既有
的 migration 測試區塊已經 import 過，直接沿用，不要重複 import）。

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm test -- tests/integration/repository.test.ts`
Expected: `saveBattleRound`／`listBattleRounds`／`deleteBattleRound` 不存在，
TypeScript 編譯錯誤或執行期 `undefined is not a function`。

- [ ] **Step 3: `db.ts` 加 schema**

在 `src/data/db.ts` 的 import 區塊加上 `BattleRound`：

```typescript
import type {
  BattleRound,
  CompatibilityRule,
  Deck,
  ImageAsset,
  InventoryLot,
  OwnedProduct,
  Part,
  PartPreference,
  PartVariant,
  Product,
  ProductVariant,
  SavedCombo,
  TournamentDeck,
  TournamentEvent,
  TournamentObservation,
  WishlistItem,
} from '../domain/types.ts'
```

`DB_SCHEMA_VERSION` 從 `5` 改成 `6`：

```typescript
export const DB_SCHEMA_VERSION = 6
```

`BeybladeDb` interface 裡，在 `wishlist: EntityTable<WishlistItem, 'id'>` 後面
加一行：

```typescript
  battleRounds: EntityTable<BattleRound, 'id'>
```

在 `createDb()` 函式裡，`db.version(5).stores({ battleRounds: null })` 這段
後面加：

```typescript
  db.version(6).stores({
    battleRounds: 'id, playedAt',
  })
```

- [ ] **Step 4: `repository.ts` 加 CRUD**

在 `Repository` interface 裡，`deleteCombo(id: string): Promise<void>` 後面
（配裝區塊結尾）加：

```typescript
  listBattleRounds(): Promise<BattleRound[]>
  saveBattleRound(input: Omit<BattleRound, 'id' | 'createdAt'>): Promise<string>
  deleteBattleRound(id: string): Promise<void>
```

在 import 區塊把 `BattleRound` 加進既有的 type import 清單。

在實作區塊（`deleteCombo` 的實作，目前第 682-684 行）後面加：

```typescript
    /* -------------------------------------------------------- 個人對戰紀錄 */

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

- [ ] **Step 5: 執行測試確認通過**

Run: `npm test -- tests/integration/repository.test.ts`
Expected: 全部 PASS，包含新增的 migration 測試（v5→v6 既有資料不受影響）。

- [ ] **Step 6: 全套驗證**

Run: `npx tsc -b && npm test`
Expected: 全過。

- [ ] **Step 7: Commit**

```bash
git add src/data/db.ts src/data/repository.ts tests/integration/repository.test.ts
git commit -m "$(cat <<'EOF'
feat: add battleRounds IndexedDB table and repository CRUD

Schema v5 -> v6, additive only (no existing store touched). Migration test
confirms v5 -> v6 upgrade leaves existing inventoryLots untouched.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `appStore.ts` 接進全域狀態

**Files:**
- Modify: `src/store/appStore.ts`

**Interfaces:**
- Consumes: `repo.listBattleRounds()`（Task 2）。
- Produces: `useAppStore` state 多一個欄位 `battleRounds: BattleRound[]`，
  供 Task 5 的 UI 與 Task 4 的計分邏輯讀取。

這個 Task 沒有獨立的單元測試——`appStore.ts` 是 React store 膠水層，正確性
由 Task 5 的 e2e 測試（記一局後畫面更新）間接驗證，跟這個檔案裡其他欄位
（`combos`／`decks`）的既有測試覆蓋模式一致（它們也沒有獨立單元測試）。

- [ ] **Step 1: 加型別與初始值**

在 `AppState` interface 裡，`wishlist: WishlistItem[]` 後面加：

```typescript
  battleRounds: BattleRound[]
```

在 import 區塊把 `BattleRound` 加進既有的 type import 清單。

在 `useAppStore` 的初始狀態物件裡，`wishlist: [],` 後面加：

```typescript
  battleRounds: [],
```

- [ ] **Step 2: 接進 `refresh()`**

在 `refresh()` 的 `Promise.all([...])` 陣列裡，`repo.listWishlist(),` 後面加：

```typescript
      repo.listBattleRounds(),
```

對應地，在解構陣列（`const [settings, parts, ..., wishlist, summary, ...]`）
的 `wishlist,` 後面加 `battleRounds,`，並在 `set({...})` 呼叫裡的
`wishlist,` 後面加 `battleRounds,`。**這三處的順序必須完全對應**（陣列
解構是照順序賦值，順序錯了會導致變數對應到錯誤的資料）。

- [ ] **Step 3: 驗證**

Run: `npx tsc -b`
Expected: 乾淨無輸出（TypeScript 會抓到陣列解構數量對不上 `Promise.all`
回傳的數量，這是這一步唯一需要的驗證——`tsc` 過了就代表三處對應正確）。

Run: `npm test`
Expected: 463/463（或之後累加的數量）全過，不應該有既有測試因為這步而紅
（這步只新增欄位，沒有改動任何既有欄位的讀寫順序）。

- [ ] **Step 4: Commit**

```bash
git add src/store/appStore.ts
git commit -m "$(cat <<'EOF'
feat: wire battleRounds into appStore

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `deck.ts` 計分整合

**Files:**
- Modify: `src/domain/deck.ts`
- Test: `tests/unit/deck.test.ts`

**Interfaces:**
- Consumes: `computePartWinRateIndex`、`PartWinRateEntry` from
  `domain/battleRecords.ts`（Task 1）。
- Produces: `scoreDeck()` 新增第 5 個參數
  `winRateIndex?: Map<string, PartWinRateEntry>`；`suggestDecks()` 的
  `SuggestDecksArgs` 新增可選欄位 `winRateIndex?: Map<string, PartWinRateEntry>`
  並轉傳給 `scoreDeck()`。

- [ ] **Step 1: 寫失敗測試**

打開 `tests/unit/deck.test.ts`，找 `describe('scoreDeck'` 那個區塊（如果
existing 測試檔案裡是用其他方式組織，找呼叫 `scoreDeck(` 的既有測試群組），
在裡面新增：

```typescript
it('balanced 策略：個人勝率高的配裝分數比沒有紀錄的配裝高（第 4 節）', () => {
  const memberWithData: DeckMember = {
    slots: { bladeId: 'blade-high-winrate' },
    analysis: { ...baseAnalysis }, // 沿用檔案裡既有的 baseAnalysis fixture
    roleZhTW: '主攻',
    reasonZhTW: '',
  }
  const memberWithoutData: DeckMember = {
    slots: { bladeId: 'blade-no-data' },
    analysis: { ...baseAnalysis },
    roleZhTW: '主攻',
    reasonZhTW: '',
  }
  const winRateIndex = new Map([
    ['blade-high-winrate', { wins: 8, losses: 2, ties: 0, winRate: 0.8 }],
  ])
  const scoreWithData = scoreDeck('balanced', [memberWithData], undefined, undefined, winRateIndex)
  const scoreWithoutData = scoreDeck('balanced', [memberWithoutData], undefined, undefined, winRateIndex)
  expect(scoreWithData).toBeGreaterThan(scoreWithoutData)
})

it('沒有任何對戰紀錄時（winRateIndex 是 undefined），不影響總分（第 6 節：不能懲罰沒記錄過的配裝）', () => {
  const member: DeckMember = {
    slots: { bladeId: 'blade-a' },
    analysis: { ...baseAnalysis },
    roleZhTW: '主攻',
    reasonZhTW: '',
  }
  const scoreWithoutIndex = scoreDeck('balanced', [member])
  const scoreWithEmptyIndex = scoreDeck('balanced', [member], undefined, undefined, new Map())
  expect(scoreWithoutIndex).toBe(scoreWithEmptyIndex)
})

it('evidence 策略不吃個人勝率（跟不吃 expertTierGain 同一個理由：策略名稱承諾最高賽事證據）', () => {
  const member: DeckMember = {
    slots: { bladeId: 'blade-high-winrate' },
    analysis: { ...baseAnalysis },
    roleZhTW: '主攻',
    reasonZhTW: '',
  }
  const winRateIndex = new Map([
    ['blade-high-winrate', { wins: 8, losses: 2, ties: 0, winRate: 0.8 }],
  ])
  const scoreWith = scoreDeck('evidence', [member], undefined, undefined, winRateIndex)
  const scoreWithout = scoreDeck('evidence', [member])
  expect(scoreWith).toBe(scoreWithout)
})
```

如果檔案裡沒有現成的 `baseAnalysis` fixture，改用檔案裡既有測試已經在用的
最小 `ComboAnalysis` 建構方式（找檔案裡任一個呼叫 `scoreDeck(` 的既有測試，
複製它建 `DeckMember` 的寫法，只替換 `slots`）。

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm test -- tests/unit/deck.test.ts`
Expected: `scoreDeck` 只接受 4 個參數（TypeScript 型別錯誤），或執行期
忽略第 5 個參數導致 `scoreWithData` 等於 `scoreWithoutData`（FAIL）。

- [ ] **Step 3: 實作**

在 `src/domain/deck.ts` 加 import（跟既有的 `PartStrengthEntry` import
放在一起）：

```typescript
import type { PartWinRateEntry } from './battleRecords.ts'
```

在 `PART_STRENGTH_FALLBACK_FLOOR` 常數後面（第 382 行後）加：

```typescript
/**
 * 個人對戰紀錄的權重。不需要像 PART_STRENGTH_FALLBACK_WEIGHT 那樣回測校準——
 * 這份資料是使用者自己的第一手經驗，沒有「準不準」的問題，只有「該佔多重」
 * 的產品判斷。刻意設得比 EXPERT_TIER_WEIGHT 小，見規格第 4 節。
 */
const PERSONAL_WIN_RATE_WEIGHT = 2
```

把 `scoreDeck()` 的簽名（第 384-389 行）：

```typescript
export function scoreDeck(
  strategy: DeckStrategy,
  members: DeckMember[],
  expertPartRatingIndex?: Map<string, ExpertPartRatingRank>,
  partStrengthIndex?: Map<string, PartStrengthEntry>,
): number {
```

改成：

```typescript
export function scoreDeck(
  strategy: DeckStrategy,
  members: DeckMember[],
  expertPartRatingIndex?: Map<string, ExpertPartRatingRank>,
  partStrengthIndex?: Map<string, PartStrengthEntry>,
  winRateIndex?: Map<string, PartWinRateEntry>,
): number {
```

在 `expertTierGain` 的計算（第 412-423 行）後面加一段 `personalWinRateGain`。
**這裡刻意不跟 `expertTierGain` 同一個「全部零件加總」模式**——CX 配置有
5 個槽位、BX/UX 只有 3 個，零件數量多的配置會系統性拿到更多加總項，等於
「槽位多」被誤當成「勝率高」。改成跟 `estimateComboPartStrength()` 同一種
「先在單一配裝內平均，再跨隊員加總」（規格第 4 節的設計本來就是這個形狀）：

```typescript
  // 個人對戰紀錄勝率：每套配裝先把有資料的零件平均成一個 0～1 的值
  // （避免 CX 5 槽位配裝只因為零件數量多就贏過 BX/UX 3 槽位配裝），
  // 再跨隊員加總——跟 estimateComboPartStrength() 同一種「先平均再加總」
  // 的形狀，不是 expertTierGain 那種「全部零件直接加總」的形狀。
  const personalWinRateGain = winRateIndex
    ? members.reduce((sum, member) => {
        const rates = OCCUPYING_SLOT_KEYS.map((key) => member.slots[key])
          .filter((partId): partId is string => Boolean(partId))
          .map((partId) => winRateIndex.get(partId)?.winRate)
          .filter((rate): rate is number => rate !== undefined)
        if (rates.length === 0) return sum
        return sum + rates.reduce((a, b) => a + b, 0) / rates.length
      }, 0)
    : 0
```

把 `balanced`（第 436-442 行）、`vs_attack`（第 450 行）、`vs_stamina`
（第 452 行）三個 case 加上 `personalWinRateGain * PERSONAL_WIN_RATE_WEIGHT`，
跟現有的 `expertTierGain * EXPERT_TIER_WEIGHT` 並列相加：

```typescript
    case 'balanced':
      return (
        Math.max(...axis('attack')) +
        Math.max(...axis('stamina')) +
        Math.max(...axis('defense')) +
        competitiveEvidenceWithFallback +
        expertTierGain * EXPERT_TIER_WEIGHT +
        personalWinRateGain * PERSONAL_WIN_RATE_WEIGHT
      )
    case 'evidence':
      return competitiveEvidence
    case 'vs_attack':
      return (
        average(axis('defense')) * 2 +
        competitiveEvidenceWithFallback * 0.35 +
        expertTierGain * EXPERT_TIER_WEIGHT +
        personalWinRateGain * PERSONAL_WIN_RATE_WEIGHT
      )
    case 'vs_stamina':
      return (
        average(axis('attack')) * 2 +
        competitiveEvidenceWithFallback * 0.35 +
        expertTierGain * EXPERT_TIER_WEIGHT +
        personalWinRateGain * PERSONAL_WIN_RATE_WEIGHT
      )
```

`evidence` 策略維持 `return competitiveEvidence` 不變（不吃這個訊號，跟不吃
`expertTierGain` 同一個理由）。`aggressive`／`stable`／`beginner` 三個 case
不動。

在 `SuggestDecksArgs` interface 裡，`partStrengthIndex?: Map<string, PartStrengthEntry>`
（第 352 行）後面加：

```typescript
  /** 個人對戰紀錄的零件勝率，見 domain/battleRecords.ts 的 computePartWinRateIndex()。 */
  winRateIndex?: Map<string, PartWinRateEntry>
```

在 `suggestDecks()` 函式裡，找解構 `args` 的地方（第 456-469 行附近）把
`partStrengthIndex,` 後面加 `winRateIndex,`，並在呼叫 `scoreDeck(strategy, ...)`
的兩個地方（第 517、535 行附近，`rough.push` 跟最終 `score:` 那兩處）補上
第 5 個參數 `winRateIndex`。

- [ ] **Step 4: 執行測試確認通過**

Run: `npm test -- tests/unit/deck.test.ts`
Expected: 全部 PASS。

- [ ] **Step 5: 全套驗證**

Run: `npx tsc -b && npm test`
Expected: 全過。

- [ ] **Step 6: Commit**

```bash
git add src/domain/deck.ts tests/unit/deck.test.ts
git commit -m "$(cat <<'EOF'
feat: wire personal win-rate into scoreDeck as a fourth independent signal

Follows the same additive pattern as expertTierGain — only balanced/vs_attack/
vs_stamina consume it, evidence strategy stays pure, PERSONAL_WIN_RATE_WEIGHT
= 2 needs no backtest calibration (design spec section 4).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: UI——`BattleLogPage` 與導覽入口

**Files:**
- Create: `src/ui/pages/BattleLogPage.tsx`
- Modify: `src/App.tsx`
- Modify: `src/ui/pages/BuilderPage.tsx`
- Modify: `src/ui/pages/DecksPage.tsx`

**Interfaces:**
- Consumes: `useAppStore` 的 `battleRounds`、`combos`、`parts`（Task 3）；
  `repo.saveBattleRound`／`repo.deleteBattleRound`（Task 2）；
  `computePartWinRateIndex` from `domain/battleRecords.ts`（Task 1）；
  `scoreDeck`／`suggestDecks` 的 `winRateIndex` 參數（Task 4）。

- [ ] **Step 1: 建立 `BattleLogPage.tsx`**

參考 `src/ui/pages/WishlistPage.tsx` 的頁面骨架（`PageHeader`／`Section`／
`EmptyState` 這幾個既有元件），新建：

```typescript
/**
 * 個人對戰紀錄：使用者自己（或跟朋友）的 1v1 練習對戰結果。
 *
 * 規格對照：docs/superpowers/specs/2026-09-24-personal-battle-log-design.md。
 */
import { useMemo, useState } from 'react'
import { repo, useAppStore } from '../../store/appStore.ts'
import { computePartWinRateIndex, LOW_SAMPLE_THRESHOLD } from '../../domain/battleRecords.ts'
import { resolveDisplayName } from '../../domain/naming.ts'
import type { BattleFinish, BattleRoundResult, ComboSlots } from '../../domain/types.ts'
import { EmptyState, PageHeader, Section } from '../components/ui.tsx'

const FINISH_ZH: Record<BattleFinish, string> = {
  spin: '轉出',
  over: '出界',
  burst: '爆裂',
  xtreme: '超越',
  none: '未知',
}

export function BattleLogPage() {
  const parts = useAppStore((state) => state.parts)
  const combos = useAppStore((state) => state.combos)
  const battleRounds = useAppStore((state) => state.battleRounds)
  const run = useAppStore((state) => state.run)

  const [comboAId, setComboAId] = useState('')
  const [comboBId, setComboBId] = useState('')
  const [result, setResult] = useState<BattleRoundResult>('a')
  const [finish, setFinish] = useState<BattleFinish>('spin')
  const [notes, setNotes] = useState('')

  const partsById = useMemo(() => new Map(parts.map((part) => [part.id, part])), [parts])
  const nameOf = (partId: string) => {
    const part = partsById.get(partId)
    return part ? resolveDisplayName(part.naming).titleZhTW : partId
  }

  const winRateIndex = useMemo(() => computePartWinRateIndex(battleRounds), [battleRounds])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const comboA = combos.find((combo) => combo.id === comboAId)
    const comboB = combos.find((combo) => combo.id === comboBId)
    if (!comboA || !comboB) return
    await run(() =>
      repo.saveBattleRound({
        a: comboA.slots,
        b: comboB.slots,
        result,
        finish,
        playedAt: new Date().toISOString().slice(0, 10),
        ...(notes ? { notes } : {}),
      }),
    )
    setNotes('')
  }

  const winRateRows = [...winRateIndex.entries()].map(([partId, entry]) => ({
    partId,
    nameZhTW: nameOf(partId),
    ...entry,
  }))

  return (
    <div>
      <PageHeader title="個人對戰紀錄" description="記錄自己或跟朋友的 1v1 練習對戰，非賽事證據" />

      <Section title="記一局">
        {combos.length < 2 ? (
          <EmptyState title="至少要有兩套已存配裝才能記錄對戰" />
        ) : (
          <form onSubmit={handleSubmit}>
            <label>
              配裝 A
              <select value={comboAId} onChange={(event) => setComboAId(event.target.value)} required>
                <option value="">選擇配裝</option>
                {combos.map((combo) => (
                  <option key={combo.id} value={combo.id}>
                    {combo.nameZhTW}
                  </option>
                ))}
              </select>
            </label>
            <label>
              配裝 B
              <select value={comboBId} onChange={(event) => setComboBId(event.target.value)} required>
                <option value="">選擇配裝</option>
                {combos.map((combo) => (
                  <option key={combo.id} value={combo.id}>
                    {combo.nameZhTW}
                  </option>
                ))}
              </select>
            </label>
            <label>
              結果
              <select value={result} onChange={(event) => setResult(event.target.value as BattleRoundResult)}>
                <option value="a">A 贏</option>
                <option value="b">B 贏</option>
                <option value="tie">平手</option>
              </select>
            </label>
            <label>
              終結方式
              <select value={finish} onChange={(event) => setFinish(event.target.value as BattleFinish)}>
                {Object.entries(FINISH_ZH).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              備註
              <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="例如：跟阿翔在店裡打的" />
            </label>
            <button type="submit">記錄這一局</button>
          </form>
        )}
      </Section>

      <Section title="歷史紀錄">
        {battleRounds.length === 0 ? (
          <EmptyState title="還沒有任何對戰紀錄" />
        ) : (
          <ul>
            {[...battleRounds]
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
              .map((round) => (
                <li key={round.id}>
                  {round.playedAt} · {round.result === 'tie' ? '平手' : round.result === 'a' ? 'A 贏' : 'B 贏'} ·{' '}
                  {FINISH_ZH[round.finish]}
                  {round.notes ? ` · ${round.notes}` : ''}
                  <button type="button" onClick={() => run(() => repo.deleteBattleRound(round.id))}>
                    刪除
                  </button>
                </li>
              ))}
          </ul>
        )}
      </Section>

      <Section title="零件勝率（個人紀錄，非賽事證據）">
        {winRateRows.length === 0 ? (
          <EmptyState title="累積對戰紀錄後這裡會顯示每顆零件的勝率" />
        ) : (
          <table>
            <thead>
              <tr>
                <th>零件</th>
                <th>贏</th>
                <th>輸</th>
                <th>平手</th>
                <th>勝率</th>
              </tr>
            </thead>
            <tbody>
              {winRateRows.map((row) => (
                <tr key={row.partId}>
                  <td>{row.nameZhTW}</td>
                  <td>{row.wins}</td>
                  <td>{row.losses}</td>
                  <td>{row.ties}</td>
                  <td>
                    {row.winRate === undefined
                      ? `樣本不足（需 ${LOW_SAMPLE_THRESHOLD} 場以上）`
                      : `${Math.round(row.winRate * 100)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  )
}
```

檢查 `ComboSlots` 是否真的有被用到（上面的程式碼用 `comboA.slots`／
`comboB.slots`，型別是 `SavedCombo['slots']`，等於 `ComboSlots`——如果
TypeScript 沒有抱怨缺 import 就不用另外 import `ComboSlots` 型別，上面
範例保留這個 import 只是保險，實作時以 `tsc` 的實際錯誤訊息為準，沒用到
就刪掉這個 import 避免 unused-import 錯誤）。

- [ ] **Step 2: 加路由**

在 `src/App.tsx`：加 import

```typescript
import { BattleLogPage } from './ui/pages/BattleLogPage.tsx'
```

在 `Page()` 函式的 `switch` 裡，`case '/wishlist':` 那個 case 後面加：

```typescript
    case '/battle-log':
      return <BattleLogPage />
```

**不加進 `TABS` 陣列**（規格第 5 節：這次刻意不佔用主要分頁位置）。

- [ ] **Step 3: 加入口連結**

`BuilderPage.tsx` 目前沒有 import `Link`（只 import 了 `navigate`），在
既有的

```typescript
import { navigate, useRoute } from '../router.tsx'
```

改成：

```typescript
import { Link, navigate, useRoute } from '../router.tsx'
```

在「配裝結果」卡片裡（第 532 行 `<Section title="配裝結果">` 底下），
第 555 行 `</Row>`（類型／結構／旋向／高度那個 `<Row>` 的結尾）後面加：

```typescript
        <Link to="/battle-log" className="btn btn-compact">
          記錄一場對戰
        </Link>
```

（`className="btn btn-compact"` 沿用 `PageHeader` 裡 `backTo` 連結的既有
樣式慣例，見 `src/ui/components/ui.tsx` 第 33 行。）

在 `src/ui/pages/DecksPage.tsx` 裡接進 `winRateIndex`：加 import

```typescript
import { computePartWinRateIndex } from '../../domain/battleRecords.ts'
```

在檔案裡讀 `battleRounds` state（比照 `combos`／`decks` 的既有讀法）：

```typescript
  const battleRounds = useAppStore((state) => state.battleRounds)
```

加 `useMemo`（跟既有的 `partStrengthIndex` 那行放在一起）：

```typescript
  const winRateIndex = useMemo(() => computePartWinRateIndex(battleRounds), [battleRounds])
```

在呼叫 `suggestDecks({...})` 的參數物件裡，`partStrengthIndex,` 後面加
`winRateIndex,`；並在這個 `useMemo` 的依賴陣列裡加上 `winRateIndex`。

- [ ] **Step 4: 型別檢查**

Run: `npx tsc -b`
Expected: 乾淨無輸出。

- [ ] **Step 5: Commit**

```bash
git add src/ui/pages/BattleLogPage.tsx src/App.tsx src/ui/pages/BuilderPage.tsx src/ui/pages/DecksPage.tsx
git commit -m "$(cat <<'EOF'
feat: add BattleLogPage and wire winRateIndex into DecksPage suggestions

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: e2e、截圖與文件收尾

**Files:**
- Modify: `tests/e2e/pwa.spec.ts`
- Modify: `tests/e2e/screenshot.shots.ts`
- Modify: `docs/superpowers/specs/2026-09-24-personal-battle-log-design.md`
- Modify: `BEYBLADE_X_codex_prompt.md`
- Modify: `HANDOFF.md`

**Interfaces:** 無新程式碼介面，這個 Task 是端到端驗證與文件同步。

- [ ] **Step 1: 寫 e2e 測試**

打開 `tests/e2e/pwa.spec.ts`，在檔案裡找一個既有的、會先建立兩套配裝的測試
當範本（例如 3on3 相關的測試會示範怎麼透過 UI 存兩套配裝），仿照它的寫法，
在檔案末尾加一條新測試：

```typescript
test('個人對戰紀錄：記一局後歷史列表與零件勝率簡表都會更新', async ({ page }) => {
  // 1. 透過既有的配裝流程存兩套配裝（沿用檔案裡既有測試建配裝的寫法）。
  // 2. 前往 /battle-log。
  await page.goto('/battle-log')
  // 3. 選配裝 A、配裝 B，選「A 贏」，選終結方式，送出表單。
  // 4. 斷言歷史列表出現剛剛那一局。
  // 5. 斷言零件勝率簡表顯示「樣本不足」（因為只記了 1 局，低於 LOW_SAMPLE_THRESHOLD）。
})
```

（實際的配裝建立步驟要照這個檔案裡既有測試的真實選擇器與流程寫，不要憑空
猜測欄位名稱——這是既有測試套件已經在維護的既有 UI 流程，照抄既有模式。）

- [ ] **Step 2: 加截圖**

打開 `tests/e2e/screenshot.shots.ts`，仿照既有截圖項目的寫法，加一項針對
`/battle-log`（有一些歷史資料時）的截圖，輸出到
`test-results/shots/desktop-battle-log.png`／`phone-battle-log.png`（沿用
既有的命名慣例）。

- [ ] **Step 3: 執行 e2e**

Run: `npm run test:e2e`
Expected: 全部通過，新增的測試也通過。

- [ ] **Step 4: 執行截圖並人工核對**

Run: `npm run shots`
用 Read 工具打開新產出的 `desktop-battle-log.png`／`phone-battle-log.png`，
確認表單、歷史列表、零件勝率簡表都正常顯示、手機寬度不跑版、沒有殘留
英文或未翻譯字串。

- [ ] **Step 5: 更新 spec 狀態列**

把 `docs/superpowers/specs/2026-09-24-personal-battle-log-design.md` 第 3 行：

```
**狀態**：設計已跟使用者逐段確認，待書面 spec 審核。
```

改成：

```
**狀態**：已實作並上線，實作計畫見
`docs/superpowers/plans/2026-09-24-personal-battle-log.md`。
```

- [ ] **Step 6: 更新規格文件**

`BEYBLADE_X_codex_prompt.md` 加一節（找檔案裡最後一個編號小節，接續編號），
簡述這個功能：資料模型、跟現有三種訊號（賽事證據、零件強度 fallback、高手
T 表評級）並列的第四種獨立訊號、純本機不同步。

- [ ] **Step 7: 更新 `HANDOFF.md`**

先跑 `git status --short`、`git rev-parse --short HEAD`、
`git rev-parse --short origin/main` 取得目前實際狀態。把「目前目標」改成
這輪做完個人對戰紀錄功能，「發布狀態」表格換成最新 SHA，「已知缺口」補一條
「同步／多人資料匯聚」還沒做（規格第 1 節已經講明是刻意排除，不是遺漏）。

- [ ] **Step 8: Commit**

```bash
git add tests/e2e/pwa.spec.ts tests/e2e/screenshot.shots.ts docs/superpowers/specs/2026-09-24-personal-battle-log-design.md BEYBLADE_X_codex_prompt.md HANDOFF.md
git commit -m "$(cat <<'EOF'
test: add e2e and screenshot coverage for personal battle log; docs sync

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
docs: record verified deploy result for personal battle log

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
git push origin main
```
