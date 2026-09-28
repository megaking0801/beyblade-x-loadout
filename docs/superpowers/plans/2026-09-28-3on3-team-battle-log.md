# 3on3 團體賽對戰紀錄 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 對戰頁加「1v1／3on3」模式切換，3on3 依官方規則記三場個別對戰
（1st/2nd/3rd 陀螺各打一場，終結技分數直接累加，先到 4 分贏整場），零件
勝率統計正確歸屬到實際打那一分的陀螺。

**Architecture:** `BattleMatch` 改成 discriminated union（`mode: '1v1' |
'3on3'`），`BattlePoint` 加 `beyIndex?: 0|1|2` 標記 3on3 逐分歸屬哪一隻。
新增獨立元件 `TeamBattleLog.tsx` 處理 3on3 選裝＋計分（跟現有 1v1 流程
分開，共用歷史紀錄／零件勝率表的渲染邏輯，由 `BattleLogPage.tsx` 當
coordinator 透過 props 傳入）。IndexedDB v7→v8，migration 幫舊 1v1 紀錄
補 `mode: '1v1'`。

**Tech Stack:** TypeScript、React、Dexie（IndexedDB）、Vitest、Playwright。

**Spec:** `docs/superpowers/specs/2026-09-28-3on3-team-battle-log-design.md`

## Global Constraints

- 官方規則來源：[BEYBLADE X Regulations 6th edition](https://www.takaratomyasia.com/img/beybladex/1732149844_BEYBLADE%20X%20-%20REGULATION%206th%20Edition.pdf)。
- 3on3 一場個別對戰（1st/2nd/3rd 其中一場）只有一個終結技就分勝負，不是
  1v1 練習模式那種「同一套配裝連續得分」。
- `FINISH_POINTS`（轉停 1／出界爆裂 2／極限 3）與 `MATCH_WIN_SCORE`（4）
  兩種模式共用同一套常數，不重新定義。
- 三場個別對戰打完仍未到 4 分：只做常見情況，顯示「未分勝負，需要延伸
  賽」，沿用不綁定陀螺的通用加分介面（延伸賽分數 `beyIndex` 留空）。
- 3on3 選裝**不**檢查「同一隊三隻陀螺不能用重複零件」（那是 `DecksPage`
  隊伍組建的責任，這裡是現場記分工具）。
- 3on3 零件勝率**逐分歸屬**，不是整場歸屬：只有 `beyIndex` 有值的分數
  才算零件輸贏，延伸賽分數不歸屬任何零件。1v1 邏輯完全不變。
- 舊 1v1 對戰紀錄沒有 `mode` 欄位，IndexedDB v8 migration 要自動補
  `mode: '1v1'`，匯入舊備份（schemaVersion < 8）也要一樣補。

## Review Focus

- 三場個別對戰其中一場（例如第 2 場）打完就讓累計分數達到 4 分時，不該
  還跳出第 3 場的畫面——要立刻判定整場結束、顯示存檔區塊（`isMatchComplete`
  用「達到」不是「剛好等於」的既有邏輯要在 3on3 這邊也生效）。
- 延伸賽階段記的分數，零件勝率表**不能**把那些分數算給任何零件（沒辦法
  知道是哪隻陀螺打的），也不能讓延伸賽分數污染 1v1 的零件勝率邏輯（兩者
  必須用 `battleMatch.mode` 完全分流，不是共用同一段判斷式加 if）。
- 3on3 選裝畫面六組配裝（A/B 各 3 隻）只要有任何一隻還沒選滿零件，就不能
  出現「開始對戰」——不能只檢查 A、B 各自「至少一隻有選」就放行。
- 切換 3on3 某一側某一隻陀螺的結構（三件式↔CX）要清掉那一隻的殘留零件
  （這輪稍早在 1v1 修過同一類 bug：`hasAnyPart` 誤判殘留零件還算已選）。
- 舊 1v1 資料（`mode` 欄位不存在）不管是本機 IndexedDB migration 還是
  匯入舊備份，都要能正常顯示在歷史紀錄與零件勝率裡，不能因為少一個欄位
  就在 `battleMatch.mode === '3on3'` 判斷式炸掉或被誤判成 3on3。

---

### Task 1：型別與零件勝率歸屬邏輯

**Files:**
- Modify: `src/domain/types.ts`（第 446-470 行，`BattleFinish`／`BattlePoint`／
  `BattleMatch` 整段換掉，另外新增 `DistributiveOmit` 工具型別）
- Modify: `src/domain/battleRecords.ts`（`partIdsOf`／`computePartWinRateIndex`）
- Modify: `tests/unit/battleRecords.test.ts`（新增 3on3 案例）

**Interfaces:**
- Produces（`types.ts`）：
  - `export interface BattlePoint { scorer: 'a' | 'b'; finish: BattleFinish; beyIndex?: 0 | 1 | 2 }`
  - `export interface OneVOneBattleMatch { id: string; mode: '1v1'; a: ComboSlots; b: ComboSlots; points: BattlePoint[]; playedAt: string; notes?: string; createdAt: string }`
  - `export interface TeamBattleMatch { id: string; mode: '3on3'; a: [ComboSlots, ComboSlots, ComboSlots]; b: [ComboSlots, ComboSlots, ComboSlots]; points: BattlePoint[]; playedAt: string; notes?: string; createdAt: string }`
  - `export type BattleMatch = OneVOneBattleMatch | TeamBattleMatch`
  - `export type DistributiveOmit<T, K extends keyof any> = T extends unknown ? Omit<T, K> : never`
    （標準庫 `Omit` 對 union 不會分流，`Omit<BattleMatch,'id'>` 會把
    `a`／`b`／`mode` 攤平成單一形狀、失去 mode 對應正確欄位形狀的關聯——
    Task 2 的 `saveBattleMatch` 參數型別要用這個，不能直接用 `Omit`）
- Consumes（`battleRecords.ts`）：Task 1 自己新增的型別，無跨 Task 依賴。
- Produces（`battleRecords.ts`，供 Task 3、4 消費，簽名不變）：
  `computePartWinRateIndex(matches: BattleMatch[]): Map<string, PartWinRateEntry>`

- [ ] **Step 1: 改 `types.ts`**

把第 446-470 行：

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

改成：

```typescript
/** 轉停 1 分、出界／爆裂各 2 分（官方同分，合併成一個選項）、極限 3 分。 */
export type BattleFinish = 'spin' | 'over_burst' | 'xtreme'

export interface BattlePoint {
  scorer: 'a' | 'b'
  finish: BattleFinish
  /**
   * 3on3 專用：這一分是三隻陀螺裡第幾隻打的（0=1st／1=2nd／2=3rd）。
   * 只有 3on3 的前三場個別對戰會填，延伸賽（第四場起）不綁定特定陀螺、
   * 留空；1v1 對戰永遠不填。零件勝率統計靠這個欄位分辨要不要歸屬。
   */
  beyIndex?: 0 | 1 | 2
}

interface BattleMatchBase {
  id: string
  /** 依序記錄每一分怎麼來的，贏家由這裡算出來，不另外存。 */
  points: BattlePoint[]
  playedAt: string
  /** 自由文字，使用者自己標記情境，不參與任何運算。 */
  notes?: string
  createdAt: string
}

/**
 * 1v1 個別對戰（先到 4 分獲勝，見官方規則）。A、B 兩邊配裝全程固定，
 * 不會中途換零件。純本機資料，不同步、不宣稱官方或社群共識，見
 * docs/superpowers/specs/2026-09-25-battle-match-scoreboard-design.md。
 */
export interface OneVOneBattleMatch extends BattleMatchBase {
  mode: '1v1'
  a: ComboSlots
  b: ComboSlots
}

/**
 * 3on3 團體賽（先到 4 分獲勝，分數是三場個別對戰累加，不是三戰兩勝）。
 * `a`／`b` 固定 3 套，索引對應 1st／2nd／3rd 出場順序，賽中不換順序。
 * 見 docs/superpowers/specs/2026-09-28-3on3-team-battle-log-design.md。
 */
export interface TeamBattleMatch extends BattleMatchBase {
  mode: '3on3'
  a: [ComboSlots, ComboSlots, ComboSlots]
  b: [ComboSlots, ComboSlots, ComboSlots]
}

export type BattleMatch = OneVOneBattleMatch | TeamBattleMatch

/**
 * 標準庫 `Omit<T, K>` 對 union type 不會分流（`keyof (A|B)` 只取共同鍵，
 * `Pick` 會把每個鍵的型別攤平成聯集，失去「哪個 mode 對應哪種 a/b 形狀」
 * 的關聯）。存檔輸入型別需要保留這個關聯，所以自己定義會分流的版本。
 */
export type DistributiveOmit<T, K extends keyof any> = T extends unknown ? Omit<T, K> : never
```

- [ ] **Step 2: 執行測試確認失敗（型別錯誤）**

Run: `npx tsc -b`
Expected: `battleRecords.ts`（`partIdsOf` 用到舊的 `BattleMatch['a']`）、
`repository.ts`／`db.ts`／`BattleLogPage.tsx` 一堆型別錯誤——這是預期的，
這些檔案 Task 2、3、4 才會改，這一步先確認錯誤集中在還沒改的檔案。

- [ ] **Step 3: 寫失敗測試（`computePartWinRateIndex` 的 3on3 案例）**

打開 `tests/unit/battleRecords.test.ts`，找 `match()` 這個 helper 函式，
改成同時支援兩種 mode（原本只建構 1v1）：

```typescript
function match(overrides: Partial<OneVOneBattleMatch>): OneVOneBattleMatch {
  return {
    id: 'm1',
    mode: '1v1',
    a: { bladeId: 'blade-a' },
    b: { bladeId: 'blade-b' },
    points: [],
    playedAt: '2026-09-25',
    createdAt: '2026-09-25T00:00:00.000Z',
    ...overrides,
  }
}

function teamMatch(overrides: Partial<TeamBattleMatch>): TeamBattleMatch {
  return {
    id: 'tm1',
    mode: '3on3',
    a: [{ bladeId: 'a1' }, { bladeId: 'a2' }, { bladeId: 'a3' }],
    b: [{ bladeId: 'b1' }, { bladeId: 'b2' }, { bladeId: 'b3' }],
    points: [],
    playedAt: '2026-09-28',
    createdAt: '2026-09-28T00:00:00.000Z',
    ...overrides,
  }
}
```

把 import 那一行的型別改成：

```typescript
import type { BattleMatch, BattlePoint, OneVOneBattleMatch, TeamBattleMatch } from '../../src/domain/types.ts'
```

在檔案最後（`describe('computePartWinRateIndex(...)'` 那個區塊結尾）加一個
新的 describe 區塊：

```typescript
describe('computePartWinRateIndex（3on3：逐分歸屬，不是整場歸屬）', () => {
  it('前三場個別對戰，每一分只算給那一分實際打的陀螺，不是整場贏家的三隻陀螺全部算贏', () => {
    // 1st 陀螺：a1 贏（scorer a, beyIndex 0）；2nd 陀螺：b2 贏（scorer b, beyIndex 1）；
    // 3rd 陀螺：a3 打到極限直接讓 A 隊累計到 4 分（scorer a, beyIndex 2, xtreme +3）。
    const matches: TeamBattleMatch[] = [
      teamMatch({
        points: [
          { scorer: 'a', finish: 'spin', beyIndex: 0 },
          { scorer: 'b', finish: 'over_burst', beyIndex: 1 },
          { scorer: 'a', finish: 'xtreme', beyIndex: 2 },
        ],
      }),
    ]
    const index = computePartWinRateIndex(matches)
    // A 隊贏了整場（1+3=4 分），但 a2（2nd 陀螺）那一場其實輸了，不該算贏。
    expect(index.get('a1')).toEqual({ wins: 1, losses: 0, winRate: undefined })
    expect(index.get('a2')).toEqual({ wins: 0, losses: 1, winRate: undefined })
    expect(index.get('a3')).toEqual({ wins: 1, losses: 0, winRate: undefined })
    // B 隊同理：b2 那一場贏了（不該算輸），b1、b3 才是真的輸。
    expect(index.get('b1')).toEqual({ wins: 0, losses: 1, winRate: undefined })
    expect(index.get('b2')).toEqual({ wins: 1, losses: 0, winRate: undefined })
    expect(index.get('b3')).toEqual({ wins: 0, losses: 1, winRate: undefined })
  })

  it('延伸賽（沒有 beyIndex）的分數不歸屬給任何零件', () => {
    const matches: TeamBattleMatch[] = [
      teamMatch({
        points: [
          { scorer: 'a', finish: 'spin', beyIndex: 0 },
          { scorer: 'b', finish: 'spin', beyIndex: 1 },
          { scorer: 'a', finish: 'spin', beyIndex: 2 },
          // 三場打完 2:1，還沒到 4 分，延伸賽兩分沒有 beyIndex。
          { scorer: 'a', finish: 'xtreme' },
          { scorer: 'a', finish: 'spin' },
        ],
      }),
    ]
    const index = computePartWinRateIndex(matches)
    // 前三場照樣正確歸屬。
    expect(index.get('a1')).toEqual({ wins: 1, losses: 0, winRate: undefined })
    expect(index.get('b1')).toEqual({ wins: 0, losses: 1, winRate: undefined })
    // 延伸賽的兩分（讓 A 隊從 2 分衝到 6 分）不歸屬給任何零件，
    // 所以整體 counts 裡只有前三場涉及的 6 顆零件，沒有其他新零件冒出來。
    expect(index.size).toBe(6)
  })

  it('3on3 跟 1v1 的紀錄混在同一批輸入時，兩種模式的歸屬邏輯互不干擾', () => {
    const oneVOne = match({
      id: 'ovo1',
      points: [
        { scorer: 'a', finish: 'xtreme' },
        { scorer: 'a', finish: 'spin' },
      ],
    })
    const team = teamMatch({
      points: [{ scorer: 'b', finish: 'xtreme', beyIndex: 0 }],
    })
    const index = computePartWinRateIndex([oneVOne, team])
    // 1v1 那場 A 整場贏，blade-a 記一勝、blade-b 記一敗（沿用既有邏輯）。
    expect(index.get('blade-a')).toEqual({ wins: 1, losses: 0, winRate: undefined })
    expect(index.get('blade-b')).toEqual({ wins: 0, losses: 1, winRate: undefined })
    // 3on3 那場只打了 1st 陀螺一分，b1 贏、a1 輸，其他 5 顆零件完全沒出現。
    expect(index.get('b1')).toEqual({ wins: 1, losses: 0, winRate: undefined })
    expect(index.get('a1')).toEqual({ wins: 0, losses: 1, winRate: undefined })
    expect(index.has('a2')).toBe(false)
  })
})
```

- [ ] **Step 4: 執行測試確認失敗**

Run: `npm test -- tests/unit/battleRecords.test.ts`
Expected: 型別錯誤或新案例 FAIL（`partIdsOf`／`computePartWinRateIndex`
還沒改，`match()`／`teamMatch()` 用到的 `mode` 欄位還沒存在於實作）。

- [ ] **Step 5: 改 `battleRecords.ts`**

把 import 那一行：

```typescript
import type { BattleFinish, BattleMatch, BattlePoint } from './types.ts'
```

改成：

```typescript
import type { BattleFinish, BattleMatch, BattlePoint, ComboSlots } from './types.ts'
```

把 `partIdsOf` 函式：

```typescript
function partIdsOf(slots: BattleMatch['a']): string[] {
  return SLOT_KEYS.map((key) => slots[key]).filter((id): id is string => Boolean(id))
}
```

改成（參數型別從 `BattleMatch['a']` 改成 `ComboSlots`——union 的
`BattleMatch['a']` 現在是 `ComboSlots | [ComboSlots, ComboSlots, ComboSlots]`，
呼叫端要自己拆成單一 `ComboSlots` 再傳進來）：

```typescript
function partIdsOf(slots: ComboSlots): string[] {
  return SLOT_KEYS.map((key) => slots[key]).filter((id): id is string => Boolean(id))
}
```

把 `computePartWinRateIndex` 函式：

```typescript
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

改成：

```typescript
export function computePartWinRateIndex(matches: BattleMatch[]): Map<string, PartWinRateEntry> {
  const counts = new Map<string, MutableCount>()

  for (const battleMatch of matches) {
    if (battleMatch.mode === '3on3') {
      // 3on3 逐分歸屬：每一分只算給那一分實際打的陀螺，不是整場贏家的
      // 三隻陀螺全部算贏——隊伍贏了不代表每一場個別對戰都贏。
      for (const point of battleMatch.points) {
        if (point.beyIndex === undefined) continue // 延伸賽不綁定陀螺，不歸屬任何零件。
        const loserScorer = point.scorer === 'a' ? 'b' : 'a'
        const winnerParts = partIdsOf(battleMatch[point.scorer][point.beyIndex])
        const loserParts = partIdsOf(battleMatch[loserScorer][point.beyIndex])
        for (const partId of winnerParts) ensure(counts, partId).wins += 1
        for (const partId of loserParts) ensure(counts, partId).losses += 1
      }
      continue
    }

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

- [ ] **Step 6: 執行測試確認通過**

Run: `npm test -- tests/unit/battleRecords.test.ts`
Expected: 全部 PASS（含既有 1v1 案例——1v1 分支邏輯完全沒動，只是套進
`if (battleMatch.mode === '3on3') { ... continue }` 之後的既有程式碼）。

- [ ] **Step 7: Commit**

```bash
git add src/domain/types.ts src/domain/battleRecords.ts tests/unit/battleRecords.test.ts
git commit -m "$(cat <<'EOF'
feat: add 3on3 team battle types and per-point win-rate attribution

BattleMatch is now a discriminated union (mode: '1v1' | '3on3').
BattlePoint gains an optional beyIndex marking which of the 3 ordered
beys scored a 3on3 point -- computePartWinRateIndex uses it to credit
wins/losses per individual battle instead of crediting the whole
team's parts on match win, matching the official rule that a team win
doesn't mean every one of its 3 beys won its own battle. Extension
battles (beyIndex absent) aren't attributed to any part. 1v1 logic is
unchanged.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013446hhPoXsXVYCpPWBrvZf
EOF
)"
```

---

### Task 2：IndexedDB schema v8 migration 與 repository

**Files:**
- Modify: `src/data/db.ts`
- Modify: `src/data/repository.ts`
- Modify: `tests/integration/repository.test.ts`

**Interfaces:**
- Consumes: `BattleMatch`／`DistributiveOmit`（Task 1）。
- Produces：`Repository.saveBattleMatch` 參數型別改成
  `DistributiveOmit<BattleMatch, 'id' | 'createdAt'>`（供 Task 3、4 的 UI
  呼叫端使用，回傳型別不變 `Promise<string>`）。

- [ ] **Step 1: `db.ts` 加 v8 migration**

在 `db.version(7).stores({...})` 那個區塊後面（第 132-137 行之後）加：

```typescript
  db.version(8)
    .stores({
      // 索引不變（還是用 id 當主鍵、playedAt 建索引），只是資料形狀多了
      // 必填的 mode 欄位，用 .upgrade() 幫舊紀錄補上，不用改 .stores()。
      battleMatches: 'id, playedAt',
    })
    .upgrade((tx) =>
      tx
        .table('battleMatches')
        .toCollection()
        .modify((match) => {
          if (!match.mode) match.mode = '1v1'
        }),
    )
```

- [ ] **Step 2: 寫失敗的 migration／CRUD 測試**

打開 `tests/integration/repository.test.ts`，找
`describe('對戰紀錄（逐分計分板，第 25-battle-match-scoreboard 節）'`
那個區塊，在最後一條測試後面加：

```typescript
  it('v7 升級到 v8 會幫沒有 mode 欄位的舊 1v1 紀錄自動補 mode: \'1v1\'，不影響其他資料', async () => {
    const dbName = `test-migration-v8-${Date.now()}`
    const oldDb = new Dexie(dbName) as BeybladeDb
    oldDb.version(7).stores({
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
      battleMatches: 'id, playedAt',
      tournamentEvents: 'id, date, country',
      tournamentDecks: 'id, eventId',
      tournamentObservations: 'id, eventId',
      meta: 'key',
    })
    await oldDb.open()
    await oldDb.table('battleMatches').add({
      id: 'old-1v1-1',
      // 沒有 mode 欄位，模擬 v7 時代存的舊紀錄。
      a: { bladeId: 'blade-a' },
      b: { bladeId: 'blade-b' },
      points: [
        { scorer: 'a', finish: 'xtreme' },
        { scorer: 'a', finish: 'spin' },
      ],
      playedAt: '2026-09-25',
      createdAt: '2026-09-25T00:00:00.000Z',
    })
    oldDb.close()

    const upgraded = createDb(dbName)
    await upgraded.open()
    expect(upgraded.verno).toBe(8)
    const migrated = await upgraded.battleMatches.get('old-1v1-1')
    expect(migrated?.mode).toBe('1v1')
    upgraded.close()
  })

  it('可以新增、列出一場打完的 3on3 對戰', async () => {
    const repo = createRepository(createDb(`test-battle-3on3-${Date.now()}`))
    const id = await repo.saveBattleMatch({
      mode: '3on3',
      a: [{ bladeId: 'a1' }, { bladeId: 'a2' }, { bladeId: 'a3' }],
      b: [{ bladeId: 'b1' }, { bladeId: 'b2' }, { bladeId: 'b3' }],
      points: [
        { scorer: 'a', finish: 'xtreme', beyIndex: 0 },
        { scorer: 'a', finish: 'spin', beyIndex: 1 },
      ],
      playedAt: '2026-09-28',
    })
    const matches = await repo.listBattleMatches()
    expect(matches).toHaveLength(1)
    expect(matches[0]!.id).toBe(id)
    expect(matches[0]!.mode).toBe('3on3')
  })

  it('3on3 沒到 4 分不能存檔（isMatchComplete 檢查兩種 mode 共用）', async () => {
    const repo = createRepository(createDb(`test-battle-3on3-incomplete-${Date.now()}`))
    await expect(
      repo.saveBattleMatch({
        mode: '3on3',
        a: [{ bladeId: 'a1' }, { bladeId: 'a2' }, { bladeId: 'a3' }],
        b: [{ bladeId: 'b1' }, { bladeId: 'b2' }, { bladeId: 'b3' }],
        points: [{ scorer: 'a', finish: 'spin', beyIndex: 0 }],
        playedAt: '2026-09-28',
      }),
    ).rejects.toThrow('這場對戰還沒打完')
  })

  it('匯入 schemaVersion 7 的舊備份時，battleMatches 裡沒有 mode 欄位的紀錄會自動補 mode: \'1v1\'', async () => {
    const repo = createRepository(createDb(`test-import-v7-backfill-${Date.now()}`))
    const legacyBackup = {
      schemaVersion: 7,
      catalogVersion: null,
      ownedProducts: [],
      inventoryLots: [],
      partPreferences: [],
      savedCombos: [],
      decks: [],
      wishlist: [],
      battleMatches: [
        {
          id: 'legacy-1v1',
          // v7 匯出格式本來就沒有 mode 欄位。
          a: { bladeId: 'blade-a' },
          b: { bladeId: 'blade-b' },
          points: [
            { scorer: 'a', finish: 'xtreme' },
            { scorer: 'a', finish: 'spin' },
          ],
          playedAt: '2026-09-25',
          createdAt: '2026-09-25T00:00:00.000Z',
        },
      ],
      settings: { mode: 'beginner' as const },
    }
    await repo.importBackup(legacyBackup as unknown as BackupPayload)
    const matches = await repo.listBattleMatches()
    expect(matches).toHaveLength(1)
    expect(matches[0]!.mode).toBe('1v1')
  })
```

在檔案最上方確認 `import Dexie` 跟 `BeybladeDb`、`createDb`、
`createRepository` 都已經 import（這個區塊既有的 v7 migration 測試已經
在用了，不用新增 import）。

- [ ] **Step 3: 執行測試確認失敗**

Run: `npm test -- tests/integration/repository.test.ts`
Expected: `upgraded.verno` 還是 7（`db.ts` 還沒加 v8）、3on3 存檔測試因為
型別／執行期錯誤 FAIL。

- [ ] **Step 4: 改 `repository.ts`**

`saveBattleMatch` 的參數型別改用 `DistributiveOmit`。找 `Repository`
interface 裡：

```typescript
  listBattleMatches(): Promise<BattleMatch[]>
  saveBattleMatch(input: Omit<BattleMatch, 'id' | 'createdAt'>): Promise<string>
  deleteBattleMatch(id: string): Promise<void>
```

改成：

```typescript
  listBattleMatches(): Promise<BattleMatch[]>
  saveBattleMatch(input: DistributiveOmit<BattleMatch, 'id' | 'createdAt'>): Promise<string>
  deleteBattleMatch(id: string): Promise<void>
```

import 那一段加 `DistributiveOmit`：

```typescript
import type {
  BattleMatch,
  CompatibilityRule,
  Deck,
  DistributiveOmit,
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

`importBackup` 裡幫舊備份的 `battleMatches` 補 `mode`（找
`const battleMatches = payload.schemaVersion >= 7 ? (payload.battleMatches ?? []) : []`
這一行）：

```typescript
      /*
       * schemaVersion < 7 的備份不會有（相容的）battleMatches 欄位——v6 以前
       * 這個位置要嘛沒有這個概念，要嘛是舊版 BattleRound 的資料形狀，跟這次
       * BattleMatch 完全不同，一律當作沒有這個欄位、匯入後留空。
       */
      const battleMatches = payload.schemaVersion >= 7 ? (payload.battleMatches ?? []) : []
```

改成：

```typescript
      /*
       * schemaVersion < 7 的備份不會有（相容的）battleMatches 欄位——v6 以前
       * 這個位置要嘛沒有這個概念，要嘛是舊版 BattleRound 的資料形狀，跟這次
       * BattleMatch 完全不同，一律當作沒有這個欄位、匯入後留空。
       * schemaVersion < 8 的備份（v7 時代）有 battleMatches 但每筆都沒有
       * mode 欄位，比照 db.ts 的 v8 migration 補上 '1v1'，不然匯入後這些
       * 紀錄會沒有 mode 可供判斷是哪種比賽類型。
       */
      const battleMatches = (payload.schemaVersion >= 7 ? (payload.battleMatches ?? []) : []).map(
        (match) => ('mode' in match ? match : { ...match, mode: '1v1' as const }),
      )
```

`saveBattleMatch` 的實作本體（`isMatchComplete(input.points)` 檢查、
`{ id: newId(), createdAt: nowIso(), ...input }` 那幾行）不用改——
`DistributiveOmit` 只是型別標註，執行期行為不變。

- [ ] **Step 5: 執行測試確認通過**

Run: `npx tsc -b && npm test -- tests/integration/repository.test.ts`
Expected: `tsc` 乾淨無輸出，測試全部 PASS。

- [ ] **Step 6: Commit**

```bash
git add src/data/db.ts src/data/repository.ts tests/integration/repository.test.ts
git commit -m "$(cat <<'EOF'
feat: schema v8 -- battleMatches gains mode, migrate legacy 1v1 records

Old battleMatches rows (pre-3on3) had no mode field; the v8 upgrade
and the importBackup path for schemaVersion < 8 backups both backfill
mode: '1v1' so every stored/imported record satisfies the new
discriminated union. saveBattleMatch's input type switches to
DistributiveOmit so callers keep the mode<->shape correlation instead
of collapsing to a flattened union via the standard Omit.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013446hhPoXsXVYCpPWBrvZf
EOF
)"
```

---

### Task 3：`TeamBattleLog` 元件（3on3 選裝＋計分）

**Files:**
- Create: `src/ui/components/TeamBattleLog.tsx`

**Interfaces:**
- Consumes: `BattlePoint`／`TeamBattleMatch`（Task 1）、
  `computeMatchScore`／`isMatchComplete`／`matchWinner`／`FINISH_POINTS`／
  `MATCH_WIN_SCORE`（既有，`domain/battleRecords.ts`）、
  `repo.saveBattleMatch`（Task 2）、`getBuilderSlotSchema`／
  `BuilderStructure`（既有，`domain/compatibility.ts`）、
  `PartPickerField`（既有，`ui/components/PartPicker.tsx`）。
- Produces：`export function TeamBattleLog(props: TeamBattleLogProps)`，
  `interface TeamBattleLogProps { modeToggle: ReactNode; historyAndWinRate: ReactNode; comboLabel: (slots: ComboSlots) => string }`
  （供 Task 4 的 `BattleLogPage.tsx` 呼叫）。

- [ ] **Step 1: 建立 `TeamBattleLog.tsx`**

```typescript
/**
 * 3on3 團體賽對戰紀錄：三場個別對戰（1st/2nd/3rd 陀螺各一場）依序記分，
 * 每場只有一個終結技就分勝負，分數直接累加到官方的 4 分門檻。
 *
 * 規格對照：docs/superpowers/specs/2026-09-28-3on3-team-battle-log-design.md。
 */
import { useMemo, useState, type ReactNode } from 'react'
import { repo, useAppStore } from '../../store/appStore.ts'
import { computeMatchScore, isMatchComplete, matchWinner, FINISH_POINTS, MATCH_WIN_SCORE } from '../../domain/battleRecords.ts'
import { getBuilderSlotSchema, type BuilderStructure } from '../../domain/compatibility.ts'
import type { BattleFinish, BattlePoint, ComboSlots } from '../../domain/types.ts'
import { PageHeader, Row, Section } from './ui.tsx'
import { PartPickerField } from './PartPicker.tsx'

const FINISH_ZH: Record<BattleFinish, string> = {
  spin: '轉停',
  over_burst: '出界／爆裂',
  xtreme: '極限',
}

const EMPTY_AVAILABILITY = new Map<string, { free: number }>()
const BEY_LABELS = ['第 1 隻', '第 2 隻', '第 3 隻'] as const

function localDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function hasAnyPart(slots: ComboSlots): boolean {
  return Object.values(slots).some(Boolean)
}

function emptyTriple(): [ComboSlots, ComboSlots, ComboSlots] {
  return [{}, {}, {}]
}

interface TeamSideEditorProps {
  label: string
  idPrefix: string
  structures: [BuilderStructure, BuilderStructure, BuilderStructure]
  slots: [ComboSlots, ComboSlots, ComboSlots]
  onChangeStructure: (index: 0 | 1 | 2, structure: BuilderStructure) => void
  onChangeSlots: (index: 0 | 1 | 2, slots: ComboSlots) => void
}

/** 一側（A 或 B）的三隻陀螺選裝，每隻獨立的結構切換＋零件選擇器。 */
function TeamSideEditor({ label, idPrefix, structures, slots, onChangeStructure, onChangeSlots }: TeamSideEditorProps) {
  const parts = useAppStore((state) => state.parts)
  const images = useAppStore((state) => state.images)

  return (
    <Section title={label}>
      <div className="stack" style={{ gap: 18 }}>
        {([0, 1, 2] as const).map((index) => {
          const structure = structures[index]
          const beySlots = slots[index]
          const schema = getBuilderSlotSchema(structure, beySlots, parts)
          return (
            <div key={index} className="card">
              <div className="battle-side-label">{BEY_LABELS[index]}陀螺</div>
              <Row>
                <button
                  type="button"
                  className={structure === 'standard' ? 'btn btn-primary' : 'btn'}
                  onClick={() => {
                    onChangeStructure(index, 'standard')
                    onChangeSlots(index, {})
                  }}
                >
                  三件式（BX／UX）
                </button>
                <button
                  type="button"
                  className={structure === 'cx' ? 'btn btn-primary' : 'btn'}
                  onClick={() => {
                    onChangeStructure(index, 'cx')
                    onChangeSlots(index, {})
                  }}
                >
                  CX 模組化
                </button>
              </Row>
              <div className="stack">
                {schema.map((def) => (
                  <PartPickerField
                    key={def.key}
                    def={def}
                    options={parts.filter((part) => def.families.includes(part.family))}
                    selectedPart={parts.find((part) => part.id === beySlots[def.key])}
                    availability={EMPTY_AVAILABILITY}
                    images={images}
                    idPrefix={`${idPrefix}-${index}`}
                    onChange={(next) => onChangeSlots(index, { ...beySlots, [def.key]: next || undefined })}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </Section>
  )
}

export interface TeamBattleLogProps {
  modeToggle: ReactNode
  historyAndWinRate: ReactNode
  comboLabel: (slots: ComboSlots) => string
}

export function TeamBattleLog({ modeToggle, historyAndWinRate, comboLabel }: TeamBattleLogProps) {
  const run = useAppStore((state) => state.run)

  const [view, setView] = useState<'setup' | 'scoring'>('setup')
  const [structuresA, setStructuresA] = useState<[BuilderStructure, BuilderStructure, BuilderStructure]>(['standard', 'standard', 'standard'])
  const [structuresB, setStructuresB] = useState<[BuilderStructure, BuilderStructure, BuilderStructure]>(['standard', 'standard', 'standard'])
  const [slotsA, setSlotsA] = useState<[ComboSlots, ComboSlots, ComboSlots]>(emptyTriple())
  const [slotsB, setSlotsB] = useState<[ComboSlots, ComboSlots, ComboSlots]>(emptyTriple())
  const [points, setPoints] = useState<BattlePoint[]>([])
  const [playedAt, setPlayedAt] = useState(() => localDateString(new Date()))
  const [notes, setNotes] = useState('')

  const ready = slotsA.every(hasAnyPart) && slotsB.every(hasAnyPart)
  const score = computeMatchScore(points)
  const complete = isMatchComplete(points)
  const winner = matchWinner(points)
  const scheduledIndex: 0 | 1 | 2 | undefined = points.length < 3 ? (points.length as 0 | 1 | 2) : undefined

  function updateSlot(
    setSlots: typeof setSlotsA,
    index: 0 | 1 | 2,
    next: ComboSlots,
  ) {
    setSlots((current) => {
      const updated = [...current] as [ComboSlots, ComboSlots, ComboSlots]
      updated[index] = next
      return updated
    })
  }

  function updateStructure(
    setStructures: typeof setStructuresA,
    index: 0 | 1 | 2,
    next: BuilderStructure,
  ) {
    setStructures((current) => {
      const updated = [...current] as [BuilderStructure, BuilderStructure, BuilderStructure]
      updated[index] = next
      return updated
    })
  }

  async function handleSave() {
    if (!complete) return
    const ok = await run(() =>
      repo.saveBattleMatch({
        mode: '3on3',
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
      setView('setup')
    }
  }

  if (view === 'scoring') {
    return (
      <div>
        <PageHeader title="3on3 計分板" description="三場個別對戰累加分數，先到 4 分贏整場，非賽事證據" />
        <div className="stack" style={{ gap: 18 }}>
          <Row>
            <button type="button" className="btn" data-testid="team-back-to-setup" onClick={() => setView('setup')}>
              ← 回選裝
            </button>
          </Row>

          <div className="meta" data-testid="team-score">
            隊伍累計比分 A {score.a} - {score.b} B（先到 {MATCH_WIN_SCORE} 分獲勝）
          </div>

          {scheduledIndex !== undefined ? (
            <Section title={`第 ${points.length + 1} 場：${BEY_LABELS[scheduledIndex]}陀螺對戰`}>
              <div className="battle-scoreboard" data-testid="team-scoreboard">
                <div className="battle-side">
                  <div className="battle-side-label">配裝 A</div>
                  <div className="battle-side-combo clamp-2">{comboLabel(slotsA[scheduledIndex]) || '（未選配裝）'}</div>
                  <div className="battle-finish-row">
                    {(Object.keys(FINISH_POINTS) as BattleFinish[]).map((finish) => (
                      <button
                        key={finish}
                        type="button"
                        className="btn btn-compact"
                        data-testid={`team-score-a-${finish}`}
                        onClick={() => setPoints([...points, { scorer: 'a', finish, beyIndex: scheduledIndex }])}
                      >
                        {FINISH_ZH[finish]}
                        <br />
                        +{FINISH_POINTS[finish]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="battle-side">
                  <div className="battle-side-label">配裝 B</div>
                  <div className="battle-side-combo clamp-2">{comboLabel(slotsB[scheduledIndex]) || '（未選配裝）'}</div>
                  <div className="battle-finish-row">
                    {(Object.keys(FINISH_POINTS) as BattleFinish[]).map((finish) => (
                      <button
                        key={finish}
                        type="button"
                        className="btn btn-compact"
                        data-testid={`team-score-b-${finish}`}
                        onClick={() => setPoints([...points, { scorer: 'b', finish, beyIndex: scheduledIndex }])}
                      >
                        {FINISH_ZH[finish]}
                        <br />
                        +{FINISH_POINTS[finish]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </Section>
          ) : null}

          {points.length >= 3 && !complete ? (
            <Section title="未分勝負，需要延伸賽">
              <p className="meta">三場個別對戰打完仍未到 4 分，官方規則要重新排陀螺順序繼續打。這裡不綁定特定陀螺，直接用下面的按鈕繼續記分。</p>
              <div className="battle-scoreboard">
                <div className="battle-side">
                  <div className="battle-side-label">A 隊</div>
                  <div className="battle-finish-row">
                    {(Object.keys(FINISH_POINTS) as BattleFinish[]).map((finish) => (
                      <button
                        key={finish}
                        type="button"
                        className="btn btn-compact"
                        disabled={complete}
                        data-testid={`team-ext-a-${finish}`}
                        onClick={() => setPoints([...points, { scorer: 'a', finish }])}
                      >
                        {FINISH_ZH[finish]}
                        <br />
                        +{FINISH_POINTS[finish]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="battle-side">
                  <div className="battle-side-label">B 隊</div>
                  <div className="battle-finish-row">
                    {(Object.keys(FINISH_POINTS) as BattleFinish[]).map((finish) => (
                      <button
                        key={finish}
                        type="button"
                        className="btn btn-compact"
                        disabled={complete}
                        data-testid={`team-ext-b-${finish}`}
                        onClick={() => setPoints([...points, { scorer: 'b', finish }])}
                      >
                        {FINISH_ZH[finish]}
                        <br />
                        +{FINISH_POINTS[finish]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </Section>
          ) : null}

          <Row>
            <button type="button" className="btn btn-compact" disabled={points.length === 0} onClick={() => setPoints(points.slice(0, -1))}>
              復原上一分
            </button>
            <button type="button" className="btn btn-compact" disabled={points.length === 0} onClick={() => setPoints([])}>
              清除重來
            </button>
          </Row>

          {complete ? (
            <Section title="存檔">
              <div className="card stack">
                <strong data-testid="team-match-winner">{winner === 'a' ? 'A 隊獲勝' : 'B 隊獲勝'}</strong>
                <Row>
                  <label>
                    日期
                    <input type="date" value={playedAt} onChange={(event) => setPlayedAt(event.target.value)} required />
                  </label>
                  <label>
                    備註
                    <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="例如：跟阿翔的隊伍打的" />
                  </label>
                </Row>
                <button type="button" className="btn btn-primary" data-testid="team-save-match" onClick={() => void handleSave()}>
                  存檔
                </button>
              </div>
            </Section>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="個人對戰紀錄" description="記錄自己或跟朋友的 3on3 團體賽，先到 4 分獲勝，非賽事證據" />
      {modeToggle}

      <TeamSideEditor
        label="配裝 A"
        idPrefix="team-a"
        structures={structuresA}
        slots={slotsA}
        onChangeStructure={(index, structure) => updateStructure(setStructuresA, index, structure)}
        onChangeSlots={(index, slots) => updateSlot(setSlotsA, index, slots)}
      />
      <TeamSideEditor
        label="配裝 B"
        idPrefix="team-b"
        structures={structuresB}
        slots={slotsB}
        onChangeStructure={(index, structure) => updateStructure(setStructuresB, index, structure)}
        onChangeSlots={(index, slots) => updateSlot(setSlotsB, index, slots)}
      />

      {ready ? (
        <div style={{ marginBottom: 22 }}>
          <button type="button" className="btn btn-primary" data-testid="team-start-scoring" onClick={() => setView('scoring')}>
            開始對戰 →
          </button>
        </div>
      ) : null}

      {historyAndWinRate}
    </div>
  )
}
```

- [ ] **Step 2: 型別檢查**

Run: `npx tsc -b`
Expected: `TeamBattleLog.tsx` 本身乾淨無輸出（`BattleLogPage.tsx` 這一步
還沒改，還沒有任何地方呼叫 `TeamBattleLog`，不會報「未使用」以外的錯誤——
如果報未使用的匯出，是正常的，Task 4 會消費它）。

- [ ] **Step 3: Commit**

```bash
git add src/ui/components/TeamBattleLog.tsx
git commit -m "$(cat <<'EOF'
feat: add TeamBattleLog component for 3on3 setup and scoring

Six independent PartPickerField groups (A/B x 1st/2nd/3rd), each with
its own structure toggle that clears its slots on switch (same bug
class fixed for 1v1 earlier this round). Scoring screen plays the
first 3 scheduled battles one point at a time (one finish click = one
battle, auto-advances via points.length), falls back to an unbound
"extension" scoring UI when 3 battles don't reach 4 cumulative points.
Not yet wired into BattleLogPage -- that's Task 4.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013446hhPoXsXVYCpPWBrvZf
EOF
)"
```

---

### Task 4：`BattleLogPage` 加模式切換、歷史紀錄／零件勝率跨模式渲染

**Files:**
- Modify: `src/ui/pages/BattleLogPage.tsx`

**Interfaces:**
- Consumes: `TeamBattleLog`／`TeamBattleLogProps`（Task 3）、
  `BattleMatch`（Task 1，含 `mode` 欄位）。

- [ ] **Step 1: 加 import 與 `matchMode` state**

在既有 import 區塊加一行：

```typescript
import { TeamBattleLog } from '../components/TeamBattleLog.tsx'
```

在 `export function BattleLogPage() {` 函式體最前面，`const [view, setView] = useState<'setup' | 'scoring'>('setup')` 那一行前面加：

```typescript
  const [matchMode, setMatchMode] = useState<'1v1' | '3on3'>('1v1')
```

- [ ] **Step 2: 把歷史紀錄／零件勝率抽成共用區塊**

找 `Section title="歷史紀錄"` 到 `Section title="零件勝率（個人紀錄，非賽事證據）"`
結尾（現有檔案第 304-378 行），這整段先原地保留，等 Step 4 再抽出來變成
`historyAndWinRate` 變數——這一步只改歷史紀錄那個 `<li>` 的內容，讓它能
正確顯示 3on3 的摘要與逐分明細。

`{battleMatch.playedAt} · {comboLabel(battleMatch.a)}（A）vs {comboLabel(battleMatch.b)}（B） ·{' '}` 這一行（1v1 專用格式，現在要判斷 mode）連同下面的
`比分`／`{finalWinner === 'a' ? 'A 獲勝' : 'B 獲勝'}` 一起換成：

```typescript
                    {battleMatch.playedAt} ·{' '}
                    {battleMatch.mode === '3on3'
                      ? '3on3'
                      : `${comboLabel(battleMatch.a)}（A）vs ${comboLabel(battleMatch.b)}（B）`}{' '}
                    · 比分 {finalScore.a}:{finalScore.b} ·{' '}
                    {finalWinner === 'a'
                      ? battleMatch.mode === '3on3' ? 'A 隊獲勝' : 'A 獲勝'
                      : battleMatch.mode === '3on3' ? 'B 隊獲勝' : 'B 獲勝'}
```

逐分紀錄的 `<li>`（`第 {index + 1} 分：{point.scorer === 'a' ? 'A' : 'B'}／{FINISH_ZH[point.finish]}`）
改成同時顯示 3on3 的陀螺歸屬：

```typescript
                        {battleMatch.points.map((point, index) => (
                          <li key={index}>
                            第 {index + 1} 分
                            {battleMatch.mode === '3on3'
                              ? `（${point.beyIndex !== undefined ? `第 ${point.beyIndex + 1} 隻陀螺` : '延伸賽'}）`
                              : ''}
                            ：{point.scorer === 'a' ? 'A' : 'B'}／{FINISH_ZH[point.finish]}
                          </li>
                        ))}
```

- [ ] **Step 3: 型別檢查（確認 mode 判斷式沒打錯字）**

Run: `npx tsc -b`
Expected: 乾淨無輸出。

- [ ] **Step 4: 抽出 `historyAndWinRate`、加模式切換按鈕、串起 `TeamBattleLog`**

把整個元件的 `return` 之前，加一段組出共用 JSX 的變數（放在
`const winRateRows = [...]` 那一行後面）：

```typescript
  const modeToggle = (
    <Row>
      <button
        type="button"
        className={matchMode === '1v1' ? 'btn btn-primary' : 'btn'}
        onClick={() => setMatchMode('1v1')}
      >
        1v1
      </button>
      <button
        type="button"
        className={matchMode === '3on3' ? 'btn btn-primary' : 'btn'}
        onClick={() => setMatchMode('3on3')}
      >
        3on3
      </button>
    </Row>
  )

  const historyAndWinRate = (
    <>
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
                    {battleMatch.playedAt} ·{' '}
                    {battleMatch.mode === '3on3'
                      ? '3on3'
                      : `${comboLabel(battleMatch.a)}（A）vs ${comboLabel(battleMatch.b)}（B）`}{' '}
                    · 比分 {finalScore.a}:{finalScore.b} ·{' '}
                    {finalWinner === 'a'
                      ? battleMatch.mode === '3on3' ? 'A 隊獲勝' : 'A 獲勝'
                      : battleMatch.mode === '3on3' ? 'B 隊獲勝' : 'B 獲勝'}
                    {battleMatch.notes ? ` · ${battleMatch.notes}` : ''}
                    <details>
                      <summary>逐分紀錄</summary>
                      <ul>
                        {battleMatch.points.map((point, index) => (
                          <li key={index}>
                            第 {index + 1} 分
                            {battleMatch.mode === '3on3'
                              ? `（${point.beyIndex !== undefined ? `第 ${point.beyIndex + 1} 隻陀螺` : '延伸賽'}）`
                              : ''}
                            ：{point.scorer === 'a' ? 'A' : 'B'}／{FINISH_ZH[point.finish]}
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
    </>
  )

  if (matchMode === '3on3') {
    return <TeamBattleLog modeToggle={modeToggle} historyAndWinRate={historyAndWinRate} comboLabel={comboLabel} />
  }
```

把原本第 304-378 行（`<Section title="歷史紀錄">` 到
`<Section title="零件勝率...">` 結尾那一整段）**刪掉**，換成
`{historyAndWinRate}`。

在 1v1 setup 畫面（`view !== 'scoring'` 那個 `return` 區塊）的
`<PageHeader .../>` 後面加 `{modeToggle}`：

```typescript
      <PageHeader title="個人對戰紀錄" description="記錄自己或跟朋友的 1v1 對戰，先到 4 分獲勝，非賽事證據" />
      {modeToggle}

      <Section title="配裝 A">
```

- [ ] **Step 5: 型別檢查與既有測試**

Run: `npx tsc -b && npm test`
Expected: `tsc` 乾淨無輸出，`npm test` 481+ 全過（既有 1v1 單元測試不受
影響，因為 1v1 分支的程式碼幾乎原封不動搬過去）。

- [ ] **Step 6: Commit**

```bash
git add src/ui/pages/BattleLogPage.tsx
git commit -m "$(cat <<'EOF'
feat: wire 3on3 mode into BattleLogPage

Adds a 1v1/3on3 toggle above the setup screen (and above TeamBattleLog's
own setup screen). History list and part win-rate table are now shared
JSX passed into TeamBattleLog as props, rendered identically for both
modes -- a 3on3 match's history line reads "3on3" instead of the combo
vs combo summary, and its expanded per-point detail labels which of
the 3 beys (or "延伸賽") scored each point.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013446hhPoXsXVYCpPWBrvZf
EOF
)"
```

---

### Task 5：e2e、截圖、文件收尾

**Files:**
- Modify: `tests/e2e/pwa.spec.ts`
- Modify: `tests/e2e/screenshot.shots.ts`
- Modify: `docs/superpowers/specs/2026-09-28-3on3-team-battle-log-design.md`
- Modify: `HANDOFF.md`

**Interfaces:** 無新程式碼介面。

- [ ] **Step 1: 寫 3on3 e2e 測試**

在 `tests/e2e/pwa.spec.ts` 現有 `test('個人對戰紀錄：配裝器狀態行反映樣本不足的狀態'` 那條後面加：

```typescript
test('3on3 團體賽：三場個別對戰累加分數，先到 4 分判定隊伍贏家', async ({ page }) => {
  await openApp(page, '/battle-log')
  await page.getByRole('button', { name: '3on3' }).click()

  // A、B 各 3 隻陀螺都要選滿才出現「開始對戰」。
  const startScoring = page.getByTestId('team-start-scoring')
  await expect(startScoring).toHaveCount(0)

  await pickSlot(page, 'bladeId', 'blade:ドランソード', 'team-a-0')
  await pickSlot(page, 'ratchetId', 'ratchet:3-60', 'team-a-0')
  await pickSlot(page, 'bitId', 'bit:F', 'team-a-0')
  await pickSlot(page, 'bladeId', 'blade:ドランバスター', 'team-a-1')
  await pickSlot(page, 'ratchetId', 'ratchet:3-60', 'team-a-1')
  await pickSlot(page, 'bitId', 'bit:F', 'team-a-1')
  await pickSlot(page, 'bladeId', 'blade:ドランソード', 'team-a-2')
  await pickSlot(page, 'ratchetId', 'ratchet:3-60', 'team-a-2')
  await pickSlot(page, 'bitId', 'bit:F', 'team-a-2')

  // A 三隻選完、B 還沒選時，CTA 還是不該出現。
  await expect(startScoring).toHaveCount(0)

  await pickSlot(page, 'bladeId', 'blade:ドランバスター', 'team-b-0')
  await pickSlot(page, 'ratchetId', 'ratchet:3-60', 'team-b-0')
  await pickSlot(page, 'bitId', 'bit:F', 'team-b-0')
  await pickSlot(page, 'bladeId', 'blade:ドランソード', 'team-b-1')
  await pickSlot(page, 'ratchetId', 'ratchet:3-60', 'team-b-1')
  await pickSlot(page, 'bitId', 'bit:F', 'team-b-1')
  await pickSlot(page, 'bladeId', 'blade:ドランバスター', 'team-b-2')
  await pickSlot(page, 'ratchetId', 'ratchet:3-60', 'team-b-2')
  await pickSlot(page, 'bitId', 'bit:F', 'team-b-2')

  await expect(startScoring).toBeVisible()
  await startScoring.click()

  // 第 1 場（1st 陀螺）：A 極限（+3）。累計 A 3 - 0 B，還沒到 4 分。
  await expect(page.getByText('第 1 場：第 1 隻陀螺對戰')).toBeVisible()
  await page.getByTestId('team-score-a-xtreme').click()
  await expect(page.getByTestId('team-score')).toContainText('A 3 - 0 B')

  // 第 2 場（2nd 陀螺）：A 轉停（+1），累計 4 分，立刻判定結束，
  // 不該還跳出第 3 場（Review Focus 第 1 項）。
  await expect(page.getByText('第 2 場：第 2 隻陀螺對戰')).toBeVisible()
  await page.getByTestId('team-score-a-spin').click()
  await expect(page.getByText('第 3 場：第 3 隻陀螺對戰')).toHaveCount(0)
  await expect(page.getByTestId('team-match-winner')).toHaveText('A 隊獲勝')

  await page.getByTestId('team-save-match').click()

  await expect(page.getByTestId('battle-match').first()).toContainText('3on3')
  await expect(page.getByTestId('battle-match').first()).toContainText('比分 4:0')
  await expect(page.getByTestId('battle-match').first()).toContainText('A 隊獲勝')
  await page.getByTestId('battle-match').first().locator('summary').click()
  await expect(page.getByTestId('battle-match').first()).toContainText('第 1 分（第 1 隻陀螺）：A／極限')
  await expect(page.getByTestId('battle-match').first()).toContainText('第 2 分（第 2 隻陀螺）：A／轉停')
})

test('3on3 團體賽：三場打完未到 4 分要進延伸賽，延伸賽分數不歸屬零件勝率', async ({ page }) => {
  await openApp(page, '/battle-log')
  await page.getByRole('button', { name: '3on3' }).click()

  for (const [prefix, blade] of [
    ['team-a-0', 'blade:ドランソード'],
    ['team-a-1', 'blade:ドランバスター'],
    ['team-a-2', 'blade:ドランソード'],
    ['team-b-0', 'blade:ドランバスター'],
    ['team-b-1', 'blade:ドランソード'],
    ['team-b-2', 'blade:ドランバスター'],
  ] as const) {
    await pickSlot(page, 'bladeId', blade, prefix)
    await pickSlot(page, 'ratchetId', 'ratchet:3-60', prefix)
    await pickSlot(page, 'bitId', 'bit:F', prefix)
  }

  await page.getByTestId('team-start-scoring').click()

  // 三場都用轉停（+1），三場後累計 A 2 - 1 B，還沒到 4 分。
  await page.getByTestId('team-score-a-spin').click()
  await page.getByTestId('team-score-b-spin').click()
  await page.getByTestId('team-score-a-spin').click()

  await expect(page.getByText('未分勝負，需要延伸賽')).toBeVisible()
  await expect(page.getByTestId('team-score')).toContainText('A 2 - 1 B')

  // 延伸賽用極限直接讓 A 到 4 分以上。
  await page.getByTestId('team-ext-a-xtreme').click()
  await expect(page.getByTestId('team-match-winner')).toHaveText('A 隊獲勝')

  await page.getByTestId('team-save-match').click()
  await expect(page.getByTestId('battle-match').first()).toContainText('比分 5:1')
  await page.getByTestId('battle-match').first().locator('summary').click()
  await expect(page.getByTestId('battle-match').first()).toContainText('第 4 分（延伸賽）：A／極限')
})
```

檢查 `tests/e2e/helpers.ts` 的 `pickSlot()` 第四個參數是任意字串前綴
（不是型別限定 `'a' | 'b'`），`'team-a-0'` 這種前綴不用改 `helpers.ts`。

再加一條，對應 Review Focus 第 4 項（切換某一隻陀螺的結構要清掉那一隻
殘留零件，跟這輪稍早修過的 1v1 同一類 bug）：

```typescript
test('3on3 團體賽：切換某一隻陀螺的結構要清掉那一隻的殘留零件，不能讓舊零件混進「開始對戰」判定', async ({ page }) => {
  await openApp(page, '/battle-log')
  await page.getByRole('button', { name: '3on3' }).click()

  // A 隊第 1 隻先選三件式的上蓋。
  await pickSlot(page, 'bladeId', 'blade:ドランソード', 'team-a-0')

  // 切到 CX，殘留的三件式 bladeId 不能還算「已選零件」。
  await page
    .locator('.card', { hasText: '第 1 隻陀螺' })
    .getByRole('button', { name: 'CX 模組化' })
    .click()

  // 其餘 5 隻都選滿，讓其他 5 隻 ready；此時如果 A 隊第 1 隻的殘留零件
  // 沒被清掉，「開始對戰」CTA 會誤判全部 6 隻都 ready 而跳出來。
  for (const [prefix, blade] of [
    ['team-a-1', 'blade:ドランバスター'],
    ['team-a-2', 'blade:ドランソード'],
    ['team-b-0', 'blade:ドランバスター'],
    ['team-b-1', 'blade:ドランソード'],
    ['team-b-2', 'blade:ドランバスター'],
  ] as const) {
    await pickSlot(page, 'bladeId', blade, prefix)
    await pickSlot(page, 'ratchetId', 'ratchet:3-60', prefix)
    await pickSlot(page, 'bitId', 'bit:F', prefix)
  }

  await expect(page.getByTestId('team-start-scoring')).toHaveCount(0)
})
```

- [ ] **Step 2: 執行 e2e**

Run: `npx playwright test tests/e2e/pwa.spec.ts -g "3on3"`
Expected: 全部 PASS（手機／桌機兩個寬度）。

- [ ] **Step 3: 更新截圖腳本**

打開 `tests/e2e/screenshot.shots.ts`，找上一輪加的「個人對戰紀錄兩畫面
都要截」那段（`window.location.hash = '/battle-log'` 之後、
`await page.getByTestId('start-scoring').click()` 之前），在那段 1v1
截圖結束後（`battle-log.png` 那張截完）加一段 3on3 截圖：

```typescript
  /*
   * 3on3 團體賽也要截一張：切模式、六邊選滿、打完第 1 場看畫面版面。
   */
  await page.getByRole('button', { name: '3on3' }).click()
  for (const [prefix, blade] of [
    ['team-a-0', 'blade:ドランソード'],
    ['team-a-1', 'blade:ドランバスター'],
    ['team-a-2', 'blade:ドランソード'],
    ['team-b-0', 'blade:ドランバスター'],
    ['team-b-1', 'blade:ドランソード'],
    ['team-b-2', 'blade:ドランバスター'],
  ] as const) {
    await pickSlot(page, 'bladeId', blade, prefix)
    await pickSlot(page, 'ratchetId', 'ratchet:3-60', prefix)
    await pickSlot(page, 'bitId', 'bit:F', prefix)
  }
  await page.getByTestId('team-start-scoring').click()
  await page.getByTestId('team-score-a-xtreme').click()
  await page.waitForTimeout(400)
  await page.screenshot({
    path: `${testInfo.project.outputDir}/../shots/${testInfo.project.name}-battle-log-3on3.png`,
    fullPage: true,
  })
```

`pickSlot` 已經在檔案頂部 import 過，不用重複 import。

- [ ] **Step 4: 執行截圖並人工核對**

Run: `npm run shots`
用 Read 工具打開 `desktop-battle-log-3on3.png`／`phone-battle-log-3on3.png`，
確認模式切換按鈕、第幾場標題、計分板、延伸賽區塊（若有觸發）都正常顯示，
手機寬度不跑版，沒有殘留英文或未翻譯字串，區塊之間有間距（這輪稍早修過
的「Row 沒有 margin」那個 bug class，新畫面要再次確認沒犯）。

- [ ] **Step 5: 更新 spec 狀態列**

把 `docs/superpowers/specs/2026-09-28-3on3-team-battle-log-design.md`
第 3 行：

```
**狀態**：設計已跟使用者逐段確認，待實作。
```

改成：

```
**狀態**：已實作並上線，實作計畫見
`docs/superpowers/plans/2026-09-28-3on3-team-battle-log.md`。
```

- [ ] **Step 6: 更新 `HANDOFF.md`**

先跑 `git status --short`、`git rev-parse --short HEAD`、
`git rev-parse --short origin/main`。把「目前目標」改成這輪做完 3on3
團體賽對戰紀錄，「發布狀態」表格換成最新 SHA，補一條「踩過的坑」：
`Omit<Union, K>` 不會分流、要用自訂 `DistributiveOmit`（如果這輪真的
踩到才寫，沒踩到就不用編）。

- [ ] **Step 7: Commit**

```bash
git add tests/e2e/pwa.spec.ts tests/e2e/screenshot.shots.ts docs/superpowers/specs/2026-09-28-3on3-team-battle-log-design.md HANDOFF.md
git commit -m "$(cat <<'EOF'
test: add e2e/screenshot coverage for 3on3 team battle log; docs sync

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013446hhPoXsXVYCpPWBrvZf
EOF
)"
```

- [ ] **Step 8: Push**

```bash
git push origin main
```

- [ ] **Step 9: 部署**

Run: `npm run deploy:pages`

- [ ] **Step 10: 線上驗證**

Run: `npm run test:live`
Expected: 全部通過。

- [ ] **Step 11: 補最終部署結果到 HANDOFF**

把 Step 9、10 實際跑出來的 `gh-pages` commit SHA 與 `test:live` 結果寫回
`HANDOFF.md`，commit + push（純文件變更，不用再部署）：

```bash
git add HANDOFF.md
git commit -m "$(cat <<'EOF'
docs: record verified deploy result for 3on3 team battle log

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013446hhPoXsXVYCpPWBrvZf
EOF
)"
git push origin main
```
