# 個人對戰紀錄（1v1 練習對戰 → 零件勝率 fallback）

**狀態**：已實作並上線，實作計畫見
`docs/superpowers/plans/2026-09-24-personal-battle-log.md`。
**規格對照**：`BEYBLADE_X_codex_prompt.md` 第 50 節（零件強度 fallback 既有設計）、
第 1.5 節（不得編造）、第 41 節（來源與驗證）。

## 1. 背景與動機

同類 app（BeyMate、BeyBattle Labs、Beyblade X Manager）都有「使用者自己記錄對戰
結果」這個功能，我們沒有。2026-09-24 這輪先查過一次：這個功能**之前做過一次**
（`63a9566`「建立逐局實戰資料流程」），後來被使用者明確否決、整組刪掉
（`28f7a83`「replace manual battles with verified video evidence」），改走
「維護端拿 Gemini API 分析可信 YouTube 頻道」的自動化路線——但那條路線也沒走完，
`domain/videoEvidence.ts`／`domain/trustedVideoSources.ts` 現在還在，是沒有任何
前台頁面在用的孤兒程式碼，缺 API 金鑰跟後續管線，卡在半成品狀態。

這次否決的理由已經不成立：當時是想直接拿影片分析出一個「配裝預測勝率」的模型，
這次的目標不同——**不訓練模型，只是讓使用者選擇性地記下自己（或跟朋友）的
1v1 練習對戰結果**，回頭當一個「零件強度」等級的獨立 fallback 訊號，跟現有的
`estimateComboPartStrength()`（`deck.ts`）同一種角色，但資料來源不同。

**跟現有零件強度資料的關鍵差異**：`stanyao-raw-records.json`／`bbxhub-meta.json`
都只有賽事名次（正例），HANDOFF 反覆提醒「沒有負例，算不出真正的機率」。1v1
配對對戰天生就有負例（A 贏 = B 輸），這是現有架構第一次有這種資料型態。

**部署限制（跟前一版否決無關，是這次新確認的）**：純 GitHub Pages 靜態網站，
沒有後端、沒有帳號系統，資料存在使用者自己裝置的 IndexedDB。這次**刻意不做
跨裝置同步／多人資料匯聚**——只影響記錄者自己裝置上的推薦分數。之後如果想把
多人資料匯聚成共用訊號（跟 stan-yao／bbxhub 那樣），需要匯出／匯入或後端，
是完全獨立的另一輪工作，不在這次範圍內。

## 2. 資料模型

新增一張 IndexedDB 表 `battleRounds`（沿用被刪掉的舊表名，但欄位大幅簡化——
拿掉 `source`／`evidenceLevel`／`sourceUrl`／`timestampSeconds`／`stadium`／
`format` 這幾個是為了「影片證據分級」設計的欄位，這次沒有影片，不需要）：

```typescript
export type BattleRoundResult = 'a' | 'b' | 'tie'
export type BattleFinish = 'spin' | 'over' | 'burst' | 'xtreme' | 'none'

export interface BattleRound {
  id: string
  a: ComboSlots
  b: ComboSlots
  result: BattleRoundResult
  finish: BattleFinish
  playedAt: string
  /** 自由文字，使用者自己標記情境（跟誰打、在哪打），不參與任何運算。 */
  notes?: string
  createdAt: string
}
```

`finish` 沿用真實 Beyblade X 的終結類型（轉出／出界／爆裂／超越／未知），
是既有玩家詞彙，不是這次發明的。`a`／`b` 直接存 `ComboSlots` 快照（不是存
`savedComboId` 參照）——理由跟 `TournamentObservation.slots` 同一個：配裝可能
之後被改掉或刪掉，紀錄要保留「當時打的是哪顆」，不能因為使用者事後改了
已存配裝就讓歷史紀錄跟著變。

## 3. 零件勝率索引

新的純函式 `computePartWinRateIndex(rounds: BattleRound[]): Map<string, PartWinRateEntry>`
（放在新檔 `domain/battleRecords.ts`，不放進 `deck.ts`，維持既有的職責分離）：

```typescript
export interface PartWinRateEntry {
  wins: number
  losses: number
  ties: number
  /** wins / (wins + losses)，樣本數（wins+losses）低於門檻回傳 undefined。 */
  winRate?: number
}
```

每一局：`result === 'a'` 時，`a` 裡的每顆零件各記一次贏、`b` 裡的每顆零件各記
一次輸；`result === 'b'` 反過來；`tie` 兩邊都只記 `ties`，不算進 `winRate`
的分母（平手不代表誰強誰弱，比照這輪不確定的資料不硬湊進機率）。樣本數門檻
沿用 `buildPartStrength.mjs` 的 `LOW_SAMPLE_THRESHOLD` 精神，這裡另訂一個
`LOW_SAMPLE_THRESHOLD = 5`（wins+losses 至少 5 場才採用），避免兩三場的偶然
結果被當成穩定訊號。

這個函式**整批重算**，不是逐局累加更新——跟 `buildPartStrength.mjs` 同一個
理由：使用者可能事後刪掉一局記錯的紀錄，整批重算比維護增量狀態不容易出錯，
資料量（使用者自己的對戰次數）也小到重算沒有效能問題。

## 4. 接進配裝器評分

`deck.ts` 的 `scoreDeck()` 現有架構本來就是「好幾種獨立訊號各自加分，不相加
換算」（零件強度 fallback、高手 T 表評級分開），這次照同一個模式插入第三種：

```typescript
const personalWinRateGain = average(
  OCCUPYING_SLOT_KEYS.map((key) => slots[key])
    .filter((partId): partId is string => Boolean(partId))
    .map((partId) => winRateIndex.get(partId)?.winRate)
    .filter((rate): rate is number => rate !== undefined),
)
```

`personalWinRateGain` 是 0～1 的比率（不是百分位），跟 `expertTierGain`／
`competitiveEvidenceWithFallback` 的量級不同，需要自己的權重常數
`PERSONAL_WIN_RATE_WEIGHT`。這個常數**不需要像 `PART_STRENGTH_FALLBACK_WEIGHT`
那樣回測校準**——因為這份資料不是要「預測」真實賽果、也沒有第二份獨立資料
可以拿來交叉驗證，它就是使用者自己的第一手經驗，資料本身沒有「準不準」的
問題，只有「該讓它在總分裡佔多重」這個產品判斷，不是統計問題。初值定
`PERSONAL_WIN_RATE_WEIGHT = 2`（`deck.ts` 現有的 `EXPERT_TIER_WEIGHT = 5`
是三級評等的乘數，這裡的 `personalWinRateGain` 本身已經是 0～1 的比率，
量級不同，直接沿用同一個數字沒有意義；`2` 是刻意選得比賽事規模證據的
影響力小，讓個人少量樣本的紀錄不會蓋過賽事規模的訊號，之後使用者自己
記錄夠多場、覺得該調高再調，是產品層級的常數，不需要回測校準）。

前台顯示：配裝分析結果裡加一行「個人對戰紀錄」文字狀態（比照現有零件強度
fallback 三種文字狀態的寫法），跟其他證據來源一樣要明確標示「個人紀錄，
非賽事證據」，不能讓使用者以為這是官方或社群共識。

## 5. 前台入口

**不重建被刪掉的 Compare 頁面**（使用者之前判斷它跟 BuilderPage 重複，
理由現在還成立——這個功能的用途是「記錄結果」不是「並排分析兩套配裝」，
兩者目的不同，不代表要用同一個頁面骨架）。

新增一個獨立頁面 `BattleLogPage`（比照 `WishlistPage` 的規模，輕量、專注
單一用途）：

- 選配裝 A、配裝 B（從已存配裝挑，或直接用配裝器目前組的那套）。
- 選結果（A 贏／B 贏／平手）、終結方式、日期（預設今天）、備註（可選）。
- 送出後append進歷史列表，列表下方顯示零件勝率簡表（`partId`／贏／輸／
  勝率，樣本不足的顯示「樣本不足」而不是顯示不準的數字）。
- 導覽列加一個入口（比照現有 5 個分頁的模式，這次不佔用主要分頁位置，
  從「配裝」分頁的次要動作進入，或首頁快速動作——實際 UI 位置留給 plan
  階段決定，不在這份 spec 鎖死）。

## 6. 範圍界線（YAGNI）

- **不做**跨裝置同步、匯出匯聚多人資料——這次刻意維持純本機（第 1 節已講）。
- **不做**影片證據、來源分級——這次全部是自報，統一當同一種信任等級，不
  分「本機記錄」跟「附證據」（上一版否決的核心複雜度來源之一）。
- **不做**真正的統計模型（Bradley–Terry、pairwise logistic）——維持專案
  一貫的簡單比率＋樣本門檻，跟 `partStrength` 百分位同一種可解釋、不黑盒
  的風格。
- **不修改**現有 `stanyao`／`bbxhub` 資料管線，這是完全獨立的第三種訊號，
  不跟它們合併、不共用同一個 `partStrengthIndex`。

## 7. 測試計畫

- `computePartWinRateIndex()`：純函式單元測試，涵蓋——同一顆零件出現在
  A、B 兩邊不同局要正確累加；平手不進 `winRate` 分母但要算進 `ties`；
  樣本數低於門檻回傳 `undefined`；空陣列輸入不拋錯。
- `scoreDeck()` 加 `personalWinRateGain` 這條路徑：比照現有
  `estimateComboPartStrength()` 的測試風格，驗證有資料時正確平均、沒資料
  時不影響總分（不能讓沒記錄過的零件被當成 0 分懲罰）。
- `BattleLogPage`：新增 e2e 測試涵蓋記一局、看到歷史列表更新、零件勝率簡表
  正確更新；`npm run shots` 加一張新頁面截圖，人工核對版面在手機寬度不跑版。
- IndexedDB migration 測試：新增 `battleRounds` store 這次要小心——上一版
  刪表時特別提醒「舊備份逐局欄位會被忽略」，這次是全新加表，要確認舊版本
  資料庫升級到新 schema 不會動到既有 `savedCombos`／`decks`（複製上一版
  migration 測試的驗證模式）。
