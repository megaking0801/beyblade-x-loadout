# 對戰紀錄升級：逐分計分板（取代單局結果）

**狀態**：設計已跟使用者逐段確認，待書面 spec 審核。
**規格對照**：`docs/superpowers/specs/2026-09-24-personal-battle-log-design.md`
（上一輪設計，這輪整個取代它的資料模型，其餘決策——純本機、不同步、不做
統計模型——沿用不變）。

## 1. 背景與動機

上一輪做的「個人對戰紀錄」上線後，使用者實際用起來發現三個問題：

1. 入口不夠顯眼，藏在配裝器裡一個連結，找不到。
2. 一定要先在配裝器存好配裝才能記錄，太麻煩——尤其對手（朋友）的配裝
   根本不會存在自己的已存配裝清單裡。
3. 只記「這局 A 贏還是 B 贏、一種終結方式」，跟真實規則對不上——Beyblade X
   官方個別對戰是「先到 4 分獲勝」，每一分依終結方式給分（查證來源：
   [USA Beyblade X Secret Showdown Tournament Official Rules](https://beyblade.com/assets/pdf/Tournament%20Official%20Rules.pdf)、
   [SEQ Beyblade X Rules](https://bey.au/post/7-rulebook/)）：轉停 1 分、
   出界／爆裂各 2 分、超越 3 分（超越直接結束比賽）。使用者想記的是「這場
   怎麼贏的」，不是單一個籠統結果。

3on3 團體賽脈絡（使用者澄清用）：三隻各打一場個別對戰，若還沒分出勝負才
挑一隻重複打——**配裝在單場個別對戰裡全程固定，不會中途換零件**。這次只做
「單場個別對戰」的逐分記錄，不做 3on3 整場團體賽的比分／重複對戰邏輯，
那是使用者沒要求的更大範圍，之後真的要做再另開一輪。

## 2. 資料模型

`BattleRound`／`BattleRoundResult` 整個刪除，換成：

```typescript
/** 三種終結方式：出界跟爆裂官方同分，合併成一個選項（不再細分）。 */
export type BattleFinish = 'spin' | 'over_burst' | 'xtreme'

export interface BattlePoint {
  scorer: 'a' | 'b'
  finish: BattleFinish
}

/**
 * 一場個別對戰（先到 4 分獲勝）。points 依序記錄每一分怎麼來的，贏家由
 * points 算出來，不另外存——只有真正打完（有一邊到 4 分）才能存檔，勝率
 * 統計不用處理「平手」。
 */
export interface BattleMatch {
  id: string
  a: ComboSlots
  b: ComboSlots
  points: BattlePoint[]
  playedAt: string
  notes?: string
  createdAt: string
}
```

`FINISH_POINTS: Record<BattleFinish, number> = { spin: 1, over_burst: 2, xtreme: 3 }`
（純函式常數，放 `domain/battleRecords.ts`）。

`PartWinRateEntry` 拔掉 `ties` 欄位——新模型下比賽一定有贏家，不會再有平手：

```typescript
export interface PartWinRateEntry {
  wins: number
  losses: number
  winRate?: number  // 樣本數（wins+losses）低於 LOW_SAMPLE_THRESHOLD 時 undefined
}
```

`computePartWinRateIndex(matches: BattleMatch[])`：對每場比賽先算出贏家
（`points` 依序 reduce 累加 `FINISH_POINTS[point.finish]`，哪邊先達到 4 就是
贏家——實務上存檔時就已經是終局，這裡只是重新推導一次，不信任外部傳進來
的「贏家」欄位，因為根本沒有這個欄位），贏家的零件各記一次贏、輸家各記
一次輸，邏輯跟上一輪一樣，只是輸入資料形狀變了。

## 3. IndexedDB

`battleRounds` 表整個換成 `battleMatches`（schema v6→v7，這次是真的資料
形狀不相容，不做欄位轉換——上一輪功能才上線一天，不會有值得保留的真實
紀錄）：

```typescript
db.version(7).stores({
  battleRounds: null,
  battleMatches: 'id, playedAt',
})
```

`repository.ts` 的 `listBattleRounds`／`saveBattleRound`／`deleteBattleRound`
改名對應 `battleMatches`（`listBattleMatches`／`saveBattleMatch`／
`deleteBattleMatch`）。`saveBattleMatch` 的輸入型別要求 `points` 至少要讓
某一方達到 4 分才能存（不完整的對戰不能存檔），驗證邏輯放
`domain/battleRecords.ts` 的 `isMatchComplete(points): boolean`，`repository.ts`
呼叫它擋，不在 repository 層重寫規則。

`exportBackup`／`importBackup` 的 `battleRounds` 欄位換成 `battleMatches`，
同樣的「`schemaVersion < 7` 的備份一律當沒有這個欄位」判斷（上一輪才學到
的教訓：同名欄位跨版本語意不同時絕對不能照單全收，這次直接改名避免同名
問題，但版本判斷還是要留著防禦舊備份）。

## 4. 記錄畫面

`BattleLogPage` 整頁重寫：

- **配裝 A／配裝 B 選擇器**：不再是下拉選單選「已存配裝」，改成兩個並排的
  零件選擇器，直接複用 `PartPickerField`（`idPrefix` 就是為這種「一頁兩個
  選擇器」設計的，見元件自己的既有註解）跟 `getBuilderSlotSchema()` 產生
  槽位定義。**不做結構相容性檢查**（不擋「這樣裝不起來」），因為這裡記的
  是「賽場上實際發生的東西」，不是「我要不要組這套」——對手的配裝你也
  管不著能不能組。使用者可以選系統（BX/UX 三件式 或 CX），槽位照
  `getBuilderSlotSchema(structure)` 給。
- **計分板**：兩套配裝都選好、至少各佔一個槽位後，畫面下方出現即時比分
  「A 0 - B 0」跟兩排各 3 顆按鈕（A 排、B 排各自獨立）：「轉停 +1」
  「出界／爆裂 +2」「極限 +3」。按一下就 `points.push({scorer, finish})`，
  比分即時更新。任一邊達到 4 分：後續得分按鈕全部鎖住（不能超記），顯示
  「A 獲勝」或「B 獲勝」跟「存檔」按鈕；未達 4 分前不能存檔。
- **復原最後一分**：計分板旁邊放一個「復原上一分」按鈕，`points.pop()`，
  比分跟著退回去——現場記分手滑按錯是常態，沒有復原等於逼使用者棄用整場
  重記。`points` 空了按鈕就鎖住（沒有上一分可以復原）。
- **重新開始**：另一個「清除重來」按鈕，把 `points` 清空、比分歸零，但
  保留已選的配裝 A／B 不用重選（換一場對戰、雙方配裝不變的情況很常見）。
- 送出前可選填日期（預設今天，本地時區，可改，跟上一輪同款
  `localDateString()`）跟備註。
- **歷史列表**：每筆顯示「日期 · 配裝 A 名稱 vs 配裝 B 名稱 · 最終比分
  （例如 4:2）· 贏家」，可展開看逐分紀錄（第幾分、誰得的、什麼終結方式），
  刪除要 `window.confirm()` 確認（上一輪全分支審查加的，這輪沿用）。
- **零件勝率簡表**：邏輯不變，只是資料來源換成新的 `computePartWinRateIndex`。

## 5. 配裝器狀態行

`BuilderPage` 上一輪加的「個人對戰紀錄：<狀態>」那行不用改邏輯，只是
`computePartWinRateIndex` 的輸入型別從 `battleRounds` 換成 `battleMatches`，
appStore 的 state 欄位跟著改名。

## 6. 導覽入口

`App.tsx` 的 `TABS` 陣列加一項「對戰」，指到 `/battle-log`（跟現有 5 個分頁
同一層級：首頁／商品／零件／配裝／3on3／**對戰**）。配裝器裡原本連到
`/battle-log` 的「記錄一場對戰」連結保留，當作配裝器內的捷徑，不衝突。

## 7. 範圍界線（YAGNI，這輪不做）

- 3on3 團體賽的整場比分、重複對戰、自動配對——這輪只做單場個別對戰。
- 記錄畫面不驗證配裝結構相容性（跟現有配裝器的驗收邏輯是兩回事，故意
  不共用）。
- 不追加任何拿 `finish` 類型做進一步計分的邏輯（例如「這顆常常造成爆裂」
  這種零件傾向分析）——`points` 裡的 `finish` 這輪只用來算分數，不做
  額外統計維度，之後真的要做再開一輪。
- 舊的 `battleRounds`／`BattleRound` 型別與資料**不做遷移**，直接刪表。

## 8. 測試計畫

- `domain/battleRecords.ts`：`computePartWinRateIndex()` 改吃 `BattleMatch[]`，
  單元測試比照上一輪但涵蓋新案例——4:0／4:3 這種比分算出正確贏家、
  `over_burst` 跟 `spin`／`xtreme` 混合累加正確、`isMatchComplete()` 對
  「還沒到 4 分」回傳 false。
- `repository.ts`：CRUD 改名後的整合測試、v6→v7 migration 測試（沿用上一輪
  v5→v6 那條的驗證模式：舊表刪除、既有 `savedCombos`／`inventoryLots` 不受
  影響）、export/import 改用 `battleMatches` 欄位名的測試。
- `BattleLogPage` 的 e2e：選兩套零件（不透過已存配裝）、按分數按鈕到
  4 分、存檔、歷史列表顯示正確比分、展開看得到逐分紀錄。
- `npm run shots` 加新版 `/battle-log` 截圖（含記分板跟已完成的一場比賽）。
