# 3on3 團體賽對戰紀錄 Design

**狀態**：設計已跟使用者逐段確認，待實作。

## 1. 目標與範圍

個人對戰紀錄（`BattleLogPage`）目前只記 1v1 個別對戰。這輪加入官方 3on3
團體賽的正確計分方式——不是「三戰兩勝」，是**三場個別對戰的分數直接累加，
先到 4 分贏整場**，跟 1v1 練習模式「同一套配裝連續得分到 4 分」的操作邏輯
不一樣（見第 2 節）。

範圍內：
- 對戰頁加「1v1／3on3」模式切換。
- 3on3 選裝：A、B 各選 3 套配裝（1st／2nd／3rd），沿用 1v1 現有的
  `PartPickerField` 選擇器與結構切換（三件式／CX）。
- 3on3 計分：三場個別對戰依序打，每場**只有一個終結技就分勝負**，自動
  累加到官方的 4 分門檻，自動判斷團隊贏家。
- 三場打完仍未到 4 分（官方的「延伸賽」情況）：只做常見情況，不綁定特定
  陀螺，沿用一套通用加分按鈕讓使用者手動繼續記分（範圍排除見第 7 節）。
- 零件勝率統計要能正確歸屬 3on3 每一分是哪隻陀螺打的（見第 5 節），不能
  沿用 1v1「整場贏家全部零件都算贏」的算法。
- 歷史紀錄、零件勝率表跟 1v1 混合顯示。

範圍外：官方規則裡「三場不分勝負後怎麼換陀螺順序」的機制本身沒寫死（比賽
現場由雙方協調），不實作；`Deck`（已存 3on3 隊伍）整合；跨場次「隊伍對隊伍
戰績」統計。

## 2. 規則依據

來源：[BEYBLADE X Regulations 6th edition (Nov 2024)](https://www.takaratomyasia.com/img/beybladex/1732149844_BEYBLADE%20X%20-%20REGULATION%206th%20Edition.pdf)（官方 PDF，Regarding Results of 3on3 Battles 節）。

- 賽前排定三隻陀螺的順序（1st／2nd／3rd），同一隊三隻陀螺不能用重複零件
  （這條由 `DecksPage` 既有的隊伍組建驗證負責，這輪對戰紀錄本身**不**
  重新驗證重複零件——3on3 對戰紀錄是現場記分工具，不是隊伍組建工具）。
- 「Battle」是官方定義的最小勝負單位：**一個終結技就決定一場 Battle**
  （跟 1v1 練習模式現在的「同一套配裝連續得分」不同，1v1 練習模式模擬的
  其實是同一隻陀螺連續打好幾場 Battle）。
- 「Battles are conducted one by one between Beys with matching numbers」：
  1st 對 1st 打一場、2nd 對 2nd 打一場、3rd 對 3rd 打一場，每場的終結技
  分數（轉停 1／出界爆裂 2／極限 3，跟 1v1 同一套 `FINISH_POINTS`）直接
  累加到整場 3on3 比賽的總分。
- 「The Blader who first accumulates a total of 4 points wins」：先到 4 分
  贏整場（`MATCH_WIN_SCORE` 沿用 1v1 的 4，同一套官方數字）。
- 「If the winner is not determined after three battles, the order of
  battles is rearranged, and the match continues」：三場打完沒人到 4 分，
  重新排列陀螺順序繼續打——這段規則官方文件本身沒有寫死怎麼換順序，
  這輪不實作，範圍見第 1 節。

## 3. 資料模型

`src/domain/types.ts` 的 `BattleMatch` 改成 discriminated union：

```typescript
export interface BattlePoint {
  scorer: 'a' | 'b'
  finish: BattleFinish
  /**
   * 3on3 專用：這一分是三隻陀螺裡第幾隻打的（0=1st／1=2nd／2=3rd）。
   * 只有前三場個別對戰會填，延伸賽（第四場起）不綁定特定陀螺，留空。
   * 1v1 對戰永遠不填。
   */
  beyIndex?: 0 | 1 | 2
}

interface BattleMatchBase {
  id: string
  points: BattlePoint[]
  playedAt: string
  notes?: string
  createdAt: string
}

export interface OneVOneBattleMatch extends BattleMatchBase {
  mode: '1v1'
  a: ComboSlots
  b: ComboSlots
}

export interface TeamBattleMatch extends BattleMatchBase {
  mode: '3on3'
  /** 固定 3 套，索引對應 1st／2nd／3rd 出場順序。 */
  a: [ComboSlots, ComboSlots, ComboSlots]
  b: [ComboSlots, ComboSlots, ComboSlots]
}

export type BattleMatch = OneVOneBattleMatch | TeamBattleMatch
```

`computeMatchScore`／`isMatchComplete`／`matchWinner`（`domain/battleRecords.ts`）
只讀 `points`，兩種模式共用、不用改。

### 3.1 IndexedDB migration

`db.ts` 的 `DB_SCHEMA_VERSION` 從 7 跳到 8。既有 `battleMatches` 資料沒有
`mode` 欄位，用 Dexie 的 `.upgrade()` 幫舊紀錄一律補 `mode: '1v1'`：

```typescript
db.version(8)
  .stores({ battleMatches: 'id, playedAt' }) // 索引不變，只是資料形狀多一個必填欄位
  .upgrade((tx) =>
    tx
      .table('battleMatches')
      .toCollection()
      .modify((match) => {
        if (!match.mode) match.mode = '1v1'
      }),
  )
```

`exportBackup`／`importBackup` 的 `schemaVersion` 判斷比照上一輪 v7 的
先例（`payload.schemaVersion >= 8` 才信任 `mode` 欄位存在，否則視同舊
1v1 資料）。

## 4. 零件勝率歸屬（跟 1v1 算法不同，這是這輪最容易算錯的地方）

`computePartWinRateIndex`（`domain/battleRecords.ts`）現有邏輯：一場
`BattleMatch` 打完，直接用 `matchWinner()` 判斷整場贏家，把贏家 `a`／`b`
（單一 `ComboSlots`）裡的**全部**零件記一勝、輸家全部零件記一敗。這在
1v1 是對的——整場自始至終只有一隻陀螺。

3on3 不能沿用這個算法：隊伍贏了不代表三隻陀螺都贏，1st 陀螺可能輸了那一場
個別對戰，只是隊伍靠 2nd／3rd 拿到的分數比較多而已。正確算法是**逐分
歸屬**，不是整場歸屬：

- 對每個 `BattlePoint`：
  - 若 `beyIndex` 有值（前三場個別對戰）：`scorer` 那一側的
    `a[beyIndex]`／`b[beyIndex]` 零件記一勝，對側同索引的零件記一敗——
    這一分本身就代表「那一場 1st 對 1st（或 2nd/3rd）的個別對戰，某一方
    的陀螺贏了」，贏家由 `scorer` 直接決定，不用等整場結束。
  - 若 `beyIndex` 沒有值（延伸賽，沒綁定陀螺）：這一分不歸屬給任何零件，
    不計入零件勝率（沒辦法知道是哪隻陀螺打的，寧可不算也不能亂算）。
- 1v1 比賽（`mode === '1v1'`）完全維持現有邏輯不變。

## 5. UI 流程

### 5.1 模式切換

`BattleLogPage` 選裝畫面頂部加「1v1／3on3」兩個按鈕（樣式比照現有的
「三件式／CX」結構切換）。切換模式時清空當時正在編輯的配裝狀態（避免
1v1 選好的零件殘留污染 3on3 選裝，做法比照這輪稍早修過的結構切換清
slots 那個 bug）。

### 5.2 3on3 選裝畫面

A、B 兩欄，各自往下展開「1st 陀螺」「2nd 陀螺」「3rd 陀螺」三個子區塊，
每個子區塊都是一組獨立的「三件式／CX」切換 + `PartPickerField`（沿用
1v1 現有元件，`idPrefix` 改成 `a-1`／`a-2`／`a-3`／`b-1`／`b-2`／`b-3`
避免六組選擇器的 DOM id 互撞）。A、B 兩側都三套配裝都選滿（每套至少一個
零件）才出現「開始對戰」CTA。

### 5.3 3on3 計分畫面

跟 1v1 計分畫面（`BattleSide`／`.battle-scoreboard`）共用整體卡片視覺，
但流程不同：

- 畫面標題顯示「第 N 場：{第幾隻} 陀螺對戰」（N=1 時顯示「1st 陀螺對戰」，
  以此類推），只顯示當前這一場的 A／B 兩隻配裝名稱跟終結技按鈕。
- 終結技按鈕點一下直接**結束這一場**（沒有「復原上一分」「清除重來」的
  連續加分邏輯——因為官方規則一場 Battle 本來就只有一個終結技），
  自動把這一分（含 `beyIndex`）推進 `points`，自動前進到下一場。
- 累計比分（`computeMatchScore(points)`）用一條小字或進度條顯示在畫面
  角落，不是這個畫面的視覺焦點（畫面焦點是「這一場在打哪兩隻」）。
- 三場都打完（`points.length >= 3`）但 `isMatchComplete(points)` 仍是
  `false`：顯示「未分勝負，需要延伸賽」+ 沿用 1v1 那種「A／B 各三個終結
  技按鈕、可連續加分」的通用介面（這些延伸賽的分數不帶 `beyIndex`）。
- `isMatchComplete(points)` 變 `true`（不管是前三場其中一場剛好讓某方
  過 4 分，或延伸賽補上的）：顯示存檔區塊，跟 1v1 共用同一套（日期／
  備註／存檔按鈕）。

### 5.4 歷史紀錄與零件勝率

歷史列表項目依 `mode` 顯示不同摘要格式：1v1 維持現有「{日期}·{A 配裝}
vs {B 配裝}·比分·贏家」；3on3 顯示「{日期}·3on3·比分·贏家」，展開
逐分紀錄時每一分要標示是第幾隻陀螺打的（`beyIndex` 有值時顯示
「1st／2nd／3rd」，沒有值時顯示「延伸賽」）。零件勝率表沿用現有版面，
資料來源換成第 4 節的新算法，兩種比賽類型的紀錄混在同一份索引裡（一顆
零件不管是在 1v1 還是 3on3 打贏，都算進同一個勝率）。

## 6. 測試重點

- `battleRecords.test.ts`：`computePartWinRateIndex` 新增 3on3 案例
  （逐分歸屬正確、延伸賽分數不歸屬任何零件、1v1 案例維持全部通過不受
  影響）。
- `repository.test.ts`：v7→v8 migration（舊 1v1 紀錄自動補
  `mode: '1v1'`，其他表不受影響）、`saveBattleMatch` 對 3on3 的
  `isMatchComplete` 檢查（未到 4 分不能存檔，兩種模式都要測）。
- e2e：3on3 選裝六組選擇器都選滿才出現 CTA、逐場自動前進、延伸賽介面
  正確出現、存檔後歷史紀錄／零件勝率正確反映。

## 7. 已知缺口（這輪刻意排除）

- 三場不分勝負後「怎麼換陀螺順序」的官方演算法本身沒寫死，這輪只給
  通用加分介面，不模擬換序邏輯。
- 3on3 選裝不檢查「同一隊三隻陀螺不能用重複零件」——那是 `DecksPage`
  隊伍組建階段的責任，這裡是現場記分工具，不重新做一次驗證。
- 不整合已存的 `Deck`（3on3 隊伍）快速選裝，這輪維持「跟 1v1 一樣現場
  選 6 套」。
- 官方規則裡「若同一場出現多個終結技同時發生視為平手重打」「陀螺檢查」
  「發射錯誤判罰」等純現場裁判規則，跟純記分無關，不實作。
