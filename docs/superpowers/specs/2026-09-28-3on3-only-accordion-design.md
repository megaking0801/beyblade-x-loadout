# 對戰紀錄收斂成純 3on3＋手風琴選裝 Design

**狀態**：已實作並上線。

## 1. 目標與範圍

上一輪把對戰紀錄同時支援 1v1 練習模式與官方 3on3 團體賽（`mode: '1v1' |
'3on3'` union）。這輪使用者決定**只留 3on3**，1v1 整個拿掉：

- 移除 1v1 選裝／計分畫面、模式切換按鈕。
- `BattleMatch` 收斂回單一形狀（不再是 discriminated union），`a`／`b`
  固定是 3 套配裝陣列，`mode` 欄位整個拿掉。
- 舊資料（不管是舊版 1v1 紀錄還是舊版 3on3 紀錄）**整表清空**，IndexedDB
  升到 v9，migration 直接清掉 `battleMatches` 表全部內容——使用者已明確
  同意清空舊紀錄，沿用這個 repo 既有慣例（形狀真的不相容時整表清掉，見
  v5／v7 migration 的先例），不做欄位轉換。

同時解決一個 UX 問題：現在的 3on3 選裝畫面六格（A、B 各 3 隻）全部展開，
畫面非常長。改成手風琴（accordion）收合。

## 2. UX 研究依據

查了幾個常見團隊組建 UI（Pokémon team builder 手機版案例研究、足球陣容
app）。共同結論：手機版不會把每個位置的完整編輯器全部攤開，是用「一排
精簡 slot 縮圖 + 點開才展開該格編輯」的漸進揭露（progressive disclosure）
模式。

來源：
- [The Journey to Mobile: Kingdra Pokemon Teambuilder](https://liambsullivan.com/ux/kingdra-case-study)——手機版 pin 一排 slot，點開展開同一個 sheet 的具體案例。
- [buildlineup.com](https://www.buildlineup.com/)——足球陣容組建的清單／拖放模式參考。

## 3. 資料模型

`src/domain/types.ts` 的 `BattleMatch`（目前是 union）改回單一 interface：

```typescript
export interface BattlePoint {
  scorer: 'a' | 'b'
  finish: BattleFinish
  /**
   * 這一分是三隻陀螺裡第幾隻打的（0=1st／1=2nd／2=3rd）。
   * 只有前三場個別對戰會填，延伸賽（第四場起）不綁定特定陀螺，留空。
   */
  beyIndex?: 0 | 1 | 2
}

/**
 * 一場 3on3 團體賽（先到 4 分獲勝，分數是三場個別對戰累加，不是三戰
 * 兩勝）。`a`／`b` 固定 3 套，索引對應 1st／2nd／3rd 出場順序，賽中不換
 * 順序。純本機資料，不同步、不宣稱官方或社群共識。
 */
export interface BattleMatch {
  id: string
  a: [ComboSlots, ComboSlots, ComboSlots]
  b: [ComboSlots, ComboSlots, ComboSlots]
  points: BattlePoint[]
  playedAt: string
  notes?: string
  createdAt: string
}
```

拿掉的東西：`OneVOneBattleMatch`、`TeamBattleMatch`、`DistributiveOmit`
（沒有 union 就不需要會分流的 `Omit`，`Repository.saveBattleMatch` 參數
型別直接改回 `Omit<BattleMatch, 'id' | 'createdAt'>`）。

`src/domain/battleRecords.ts` 的 `computePartWinRateIndex` 拿掉 1v1 那個
分支（整場歸屬的邏輯），只留 3on3 的逐分歸屬邏輯（`partIdsOf` 也不用再
接受 `ComboSlots | tuple`，回到單純 `ComboSlots`）。`computeMatchScore`／
`isMatchComplete`／`matchWinner` 完全不用改（只讀 `points`）。

### 3.1 IndexedDB migration

`src/data/db.ts` 的 `DB_SCHEMA_VERSION` 從 8 跳到 9：

```typescript
db.version(9).stores({
  // 拿掉 mode 判斷式，1v1／3on3 混合的舊資料形狀不相容，整表清空，
  // 不做欄位轉換（使用者已同意清空舊紀錄）。
  battleMatches: 'id, playedAt',
})
db.version(9).upgrade((tx) => tx.table('battleMatches').clear())
```

`src/data/repository.ts` 的 `exportBackup`／`importBackup` 拿掉所有跟
`mode` 相關的 backfill 邏輯（v7、v8 的那兩段 schemaVersion 判斷式全部
刪掉，`battleMatches` 直接讀寫，不用先 map 補欄位）。

## 4. UI：手風琴選裝

`TeamBattleLog.tsx` 的內容併回 `BattleLogPage.tsx`（不再需要因為「兩種
模式共用歷史紀錄」而拆成兩個元件——只剩一種模式了）。刪掉：
`renderModeToggle`／`modeToggle`、1v1 專用的 `BattleSide`／
`structureA`／`structureB`／`slotsA`／`slotsB`（單一 `ComboSlots` 版本）／
舊的 `handleSave`（1v1 版本）／1v1 的計分板 `view: 'scoring'` 分支。

`TeamSideEditor` 改成手風琴：

- 每側（A、B）各自獨立管理「目前展開第幾格」的 state（`expandedIndex:
  0 | 1 | 2`，預設 `0`），A、B 互不影響，可以同時各展開一格。
- 每一格收合時顯示一行：配裝名稱（用既有 `comboLabel()`，沒選就顯示
  「未選」）＋結構標籤（三件式／CX）＋展開提示文字，點擊整行切換該格是否
  展開（跟目前展開的格子相同就收合，不同就切換過去，同時收掉原本展開的
  那格——同一側同時只會有一格展開）。
  **實作偏離**：原本這裡規劃收合列要有縮圖，final review 抓到程式碼沒做
  （final review：全分支審查）——落地時改成純文字摘要，沒有縮圖。三個
  零件名稱本身已經有辨識度，縮圖要從三顆零件裡選哪一顆當代表也沒有明顯
  答案，權衡後判定不補，補上這行澄清跟實際實作對齊，不是遺漏。
- 展開時顯示目前的結構切換按鈕＋三個零件選擇器（跟現在一樣）。
- 已上場鎖住的格子（`index < lockedCount`，第 3 節的既有邏輯）**永遠
  收合、整行不可點擊**，收合摘要行加註「（已上場，賽中不能更換）」。
- 選完一格的必要零件後**不自動收合、不自動跳下一格**——使用者自己決定
  什麼時候收合去看下一格，避免「選完一個欄位就跳走，看不到剛選好的
  結果」這種意外跳動。

## 5. 測試重點

- `battleRecords.test.ts`：刪掉所有 1v1（`OneVOneBattleMatch`／
  `mode:'1v1'`）相關案例與 `match()` helper，只留 `teamMatch()`；
  `BattleMatch` 型別測試改用新的單一形狀。
- `repository.test.ts`：刪掉 v7→v8（mode backfill）跟匯入 schemaVersion
  7 舊備份的測試；新增 v8→v9 migration 測試（清空 `battleMatches`，不
  影響其他表）；既有 1v1 CRUD 測試（`saveBattleMatch({mode:'1v1',...})`）
  整段刪除或改寫成 3on3 版本。
- e2e：刪掉所有 1v1 專屬與模式切換測試（`pickSlot(..., 'a')` 版本、
  `個人對戰紀錄：...` 那三條、Minor 2 的模式切換確認測試——沒有模式可
  切了）；3on3 既有測試裡選零件的步驟要多一個「先展開那一格」的點擊
  動作；新增手風琴專屬案例：收合摘要正確顯示配裝名稱、點展開會收合原本
  展開的格子、鎖住的格子點了沒反應。

## 6. 已知缺口（沿用上一輪）

- 延伸賽換陀螺順序的官方演算法本身沒寫死，不模擬。
- 3on3 選裝不檢查「同一隊三隻陀螺不能用重複零件」（`DecksPage` 的責任）。
- 不整合已存的 `Deck`（3on3 隊伍）快速選裝。
