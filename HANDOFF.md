# 交接筆記

最後更新：2026-09-25 UTC+08:00
交接原因：正式交接（對戰紀錄逐分計分板重寫 + final review 修復 + 計分板
視覺重新設計，全部完成並已上線）

## 目前目標

把「個人對戰紀錄」的資料模型從「一局一個籠統結果」換成「一場個別對戰、
逐分記錄」，符合 Beyblade X 官方個別對戰規則（先到 4 分獲勝：轉停 1／
出界爆裂 2／極限 3）。Spec／Plan：
`docs/superpowers/specs/2026-09-25-battle-match-scoreboard-design.md`／
`docs/superpowers/plans/2026-09-25-battle-match-scoreboard.md`。

**這輪額外做了一次計分板 UI 重新設計**（沒有另外的 spec 文件，走
brainstorming bounded path、對話中approval）：原本單頁塞選裝＋六顆小按鈕＋
純文字比分，視覺沒有焦點。改成同一個 `BattleLogPage` 元件內部兩個畫面
（`view: 'setup' | 'scoring'`，不開新 route、資料模型完全沒變）：

- 選裝畫面：跟以前一樣選 A／B 配裝，兩邊都選好才出現「開始對戰」CTA，
  歷史紀錄／零件勝率表留在這頁。
- 計分畫面：兩側並排卡片（手機疊上下），巨大置中分數數字 + 進度條 +
  各自三個終結技按鈕分組；復原／清除移到卡片外單獨一排；達陣那側卡片
  整張高亮；存檔成功後自動切回選裝畫面。「← 回選裝」不清 `points`，只有
  「清除重來」才清。

**整輪都已完整完成並上線。** 沒有下一步待辦，只有下面「已知缺口」列的
刻意排除範圍。

## 發布狀態

| 層級 | 狀態 |
|---|---|
| 工作區 | 乾淨，僅一個跟本輪無關的既有殘留（見下方「已知缺口」最後一條） |
| 本機 HEAD | `b2203c1` |
| `origin/main` | `b2203c1`（一致） |
| 線上 Pages | `833176d`（計分板重新設計已部署） |

## 已驗證與未驗證

- `npx tsc -b`：通過，乾淨無輸出。
- `npm test`：**481/481 全過**。
- `npm run test:e2e` 全套（非過濾）：**91 passed, 1 skipped**（skip 是既有
  WebKit 離線測試已知 flake，跟本輪無關）。
- `npm run shots`：已用 Read 工具確認
  `desktop-battle-log.png`／`phone-battle-log.png`（選裝畫面）跟
  `desktop-battle-log-scoring.png`／`phone-battle-log-scoring.png`
  （計分畫面）都正常顯示，沒跑版；桌機 fullPage 截圖底部 tabbar 疊到
  「開始對戰」按鈕一小段是截圖已知現象（見下方踩過的坑），不是真的擋住
  點擊。
- `npm run deploy:pages`：完成，gh-pages `833176d`。
- `npm run test:live`：**6/6 全過**（phone/desktop 各 3 條：可開啟＋加商品、
  service worker 註冊、圖片路徑）。

## 阻塞

無。

## 下一個具體動作

無待辦。若要繼續優化，可以考慮 final review 那輪記錄的 deferred Minor
項目（見下方「Final review 發現與修復」），或使用者提出的新需求。

## Final review 發現與修復（這輪新增）

派 fresh opus subagent 對照 plan 的 Review Focus 段落審查
`416b84f..18bfe5d`（Task 1-6 全部 commit），結論：無 Critical，2 個
Important 已修，Minor 記錄 deferred：

- **Important 1**：`FINISH_POINTS` 缺 Review Focus 第 5 項要求的隱性假設
  註解（歷史紀錄比分是即時算的，沒存快照）——已在
  `src/domain/battleRecords.ts` 的 `FINISH_POINTS` 宣告補上註解。
- **Important 2**（真 bug）：`BattleLogPage` 切換 A／B 結構（三件式↔CX）
  沒清 `slotsA`／`slotsB`，殘留的零件 id 會讓 `hasAnyPart()` 誤判、計分板
  可能在其中一邊實際上沒選零件時就跳出來，存檔後還會把看不到的零件混進
  歷史紀錄與 `computePartWinRateIndex` 的零件勝率（污染
  `BuilderPage`／`DecksPage` 的建議邏輯）——已修成跟 `BuilderPage` 既有
  模式一致：切結構按鈕 `onClick` 同時呼叫 `setSlotsA({})`／
  `setSlotsB({})`。先寫失敗的 e2e 測試確認真的會紅（A 選三件式上蓋、切到
  CX、B 選滿零件，計分板不該出現但確實出現），修完再確認變綠。
- Minor 記錄到 ledger 當 deferred（不修）：比賽中途換配裝會把已記的分數
  算到新零件頭上；匯入未驗證資料在贏家 undefined 時會誤顯示「B 獲勝」；
  切到別分頁會遺失進行中的比賽狀態（沒有草稿持久化）；缺日期編輯／5:0
  顯示／spec 第 8 節案例的測試；CX 內建固鎖零件仍可被選（跟 `BuilderPage`
  既有行為一致，spec 本來就排除相容性檢查）。

## 怎麼跑（非顯而易見的）

- 這是用 `superpowers:executing-plans` 執行的 SDD 計畫，直接在 `main` 上做
  （沒有開 worktree／分支）。Ledger（`.superpowers/sdd/2026-09-25-battle-
  match-scoreboard/progress.md`）final review 乾淨後已依計畫刪除，三個
  ruling 摘要見上一版 HANDOFF 歷史／`git log` 這幾個 commit 的說明：Task 1
  測試建構錯（跟程式碼無關）、Task 2 plan 預測的 tsc 錯誤沒真的發生、
  Task 3 漏改 `DB_SCHEMA_VERSION`。
- 計分板 UI 重新設計走的是 `superpowers:brainstorming` 的 bounded path，
  沒有走 SDD 全套（沒開 ledger、沒寫 plan 文件），對話紀錄本身就是設計
  依據，改動範圍只有 `BattleLogPage.tsx`／`index.css`／兩個 e2e 檔案。

## 踩過的坑（這輪新增）

- **測試檔案自己的建構邏輯也會有 bug，紅燈／綠燈都要讀懂為什麼，不能只看
  過不過**——`computePartWinRateIndex` 的「同一顆零件跨場輸贏各自累加」
  測試，第一版用展開運算子覆寫 `a`／`b` 欄位時把兩批案例都覆寫成同一邊
  贏，實際測出 wins:6/losses:0，程式碼本身是對的，是測試資料建構錯了。
- **plan 預測的編譯錯誤不一定真的會發生**——plan 寫「拿掉 `PartWinRateEntry`
  的 `ties` 欄位後，`deck.test.ts` 裡多餘的 `ties: 0` 會讓 `tsc` 報 excess
  property 錯誤」，但巢狀在 `new Map([[...]])` 陣列字面值裡的物件不會觸發
  這個檢查（用 `tsc -b --force` 全量重建驗證過）。TDD 的「先看紅燈」步驟
  如果實測沒有紅燈，不要硬掰一個紅燈出來，誠實記錄、還是照原本的目標做
  修正就好。
- **改 IndexedDB schema 版本時，`DB_SCHEMA_VERSION` 常數要跟 `db.version(N)`
  同步升級，兩者是分開的兩個地方**——這次只顧著加
  `db.version(7).stores({...})`，忘記把 `export const DB_SCHEMA_VERSION`
  從 6 改成 7，被匯出匯入的 round-trip 測試抓到。以後改 schema 版本，這兩
  個地方要一起改，改完可以直接 `grep DB_SCHEMA_VERSION` 確認只有一個數字、
  跟最新的 `db.version()` 一致。
- **UI 改版把「比分文字」的 DOM 結構換掉時，e2e 斷言的比對字串要跟著全部
  改**——計分板重新設計前 `data-testid="score-a"` 的 `textContent` 是
  `"A 4"`（前綴字母＋數字），改成獨立大字數字磚後只剩 `"4"`。原本
  `toHaveText('A 4')` 這種斷言全部要跟著改成 `toHaveText('4')`，不能只改
  程式碼不改測試字串，兩邊要當一組一起看。
- **`fullPage: true` 的截圖會把 `position: fixed` 的底部 tabbar 畫在畫面
  中段，疊住底下的按鈕**——這是既有教訓（HANDOFF 舊版寫過一次），這輪
  計分板重新設計的截圖又踩到一次：`desktop-battle-log.png` 裡「開始對戰」
  CTA 被 tabbar 疊到一角。純粹是全頁截圖的算圖方式問題，實機（不用
  fullPage、或用真的瀏覽器滑動）不會有這個現象，看截圖核對版面時記得
  這一條，不要誤判成真的 bug。

## 踩過的坑（沿用既有，仍然有效）

- **加分訊號的原始值域不含負數時，直接加總等於「有資料就加分，不管資料
  說的是好是壞」**——先找出值域裡代表「中性、沒有訊號」的那個點，加總前
  先減掉那個基準點，負面資料才真的能扣分，不能預設「有資料 = 加分」。
- **新增一個 IndexedDB 新表時，匯出／匯入備份不會自動涵蓋，要自己記得
  補**——`db.ts` 加新表，`BackupPayload`／`exportBackup`／`importBackup`
  三處要一起檢查，不能假設「資料存進 IndexedDB 就等於安全」。
- **舊表刪除後沿用同一個表名做完全不同的新功能時，舊備份裡同名欄位的
  資料形狀可能不相容**——匯入舊備份一定要先判斷 `schemaVersion` 再決定
  要不要讀那個欄位，不能同名就照單全收。
- **寫 plan 的程式碼範例前，一定要先讀元件的真實簽名（prop 名、參數順序），
  不能憑印象或憑語感編**——self-review 階段抓到過不存在的 prop 名。
- **e2e 斷言用純文字比對在畫面上有 `<option>` 或多筆重複資料時會撞到
  strict mode violation**——已全面改用 `data-testid` 而不是 `getByText()`
  來定位互動元件跟需要唯一識別的清單項目。
- `stanyao-raw-records.json` 只有正例沒有負例，也沒有「零件總共被用了幾次」
  的分母，算不出真正的機率——任何想拿這批資料做「預測」的功能，先檢查有沒有
  負例（規格第 50.1 節）。
- 回測「比較哪幾組」的設計本身會決定測不測得出訊號，跟資料量無關；任何相關
  係數結果都要先跑隨機打亂對照組排除方法論假訊號（規格第 50.6 節）。
- 加一個新的「證據補分」訊號時，gain 一定要算「淨新增」不是「商品裡全部
  零件」，否則會打穿「沒有任何增益就不推薦」的防呆機制。
- 刪除一個頁面時，`grep "<Link"` 抓不到所有殘留 import，要靠 `tsc -b` 的
  unused-import 檢查才抓得到。
- 規格宣告「已經拆分職責」不代表程式碼真的拆了——要 grep 舊職責的具體符號
  確認，不能只看規格文字。
- 加總多個維度時，先代入每個純類型手算一次結果，才知道有沒有系統性偏差。

## 已知缺口

- **個人對戰紀錄不做 3on3 團體賽整場比分／重複對戰邏輯**——這輪只記單場
  個別對戰（先到 4 分獲勝），3on3 團體賽脈絡下「三隻打完還沒分勝負要
  重複挑一隻打」這件事本身不記錄，是這輪 spec（第 7 節）刻意排除的範圍。
  之後真的要記團體賽整場比分，是完全獨立的一輪工作。
- **`FINISH_POINTS`（轉停 1／出界爆裂 2／極限 3）之後如果要調整，舊紀錄
  的比分會跟著重算變動**——沒有把每一分的實際點值存進 `BattlePoint`，
  歷史紀錄的比分是即時用目前的 `FINISH_POINTS` 常數算出來的，不是存檔當下
  凍結的快照。只要這個常數本身不變就沒事，但如果之後官方規則改了要調這幾
  個數字，舊紀錄的比分顯示會跟著變，這輪沒有做版本化快照。
- **個人對戰紀錄不做跨裝置同步／多人資料匯聚**——純本機 IndexedDB，別人裝
  這個 PWA 記錄的對戰你完全拿不到，是上一輪 spec 刻意排除的範圍，不是
  遺漏。
- **BBXHub 資料併進零件強度 fallback 已試過，兩種合併策略都沒通過回測，
  沒有合併**（詳細設計見
  `docs/superpowers/specs/2026-09-24-bbxhub-part-strength-merge-design.md`）。
  `mergePodiumCounts()`（`scripts/buildPartStrength.mjs`）兩種模式都已經
  寫好、保留在檔案裡，但沒有接進 `main()`。CX 配置維持沒有 fallback 的
  現狀。結論細節（sum 模式差距 0.094、percentile-average 模式差距 0.051，
  兩者都超出 0.05 容忍值判準）與判準本身的長尾定義模糊地帶，已記在上一版
  HANDOFF 歷史裡，重試合併前先看那份 spec。
- **`bbxhub-meta.json` 本身沒有任何程式消費它**——`grep -rln "bbxhub-meta" src/`
  無結果，前台 T 表走的是完全不同的
  `beybladehub-tier-lists.json`／`beybladehub-tier-ratings.json`。目前還是
  孤兒管線，不影響任何使用者看得到的東西。
- `.claude/worktrees/part-strength-fallback` 與根目錄 `context-audit-v2.md`
  是未追蹤／未 commit 的既有殘留檔案，跟本輪 SDD 無關，本輪沒有動它們，
  接手時不要誤以為是本輪產物；`src/catalog/catalog-audit.json` 目前也有一份
  未 commit 的既有修改，同樣跟本輪無關。
- 零件強度 fallback 的訊號方向已驗證有時間持續性，但只對特定訓練／驗證
  切分成立，賽事 meta 會隨新品發售、規則調整改變，之後要重跑回測再確認。
- `TYPE_WEIGHT`（上蓋 0.5／軸心 0.3／固鎖 0.2 的槽位權重）已測試過不支持用
  零件強度那套方法校正，維持現狀，不用再花時間。

## 資料管線表

`stanyao-raw-records.json`（14,743 筆逐場進前三名次，只有正例沒有負例）→
`scripts/buildPartStrength.mjs`（展開 comboPartIds、按零件聚合、套
`computePercentiles()`）→ `part-strength.generated.json` → `catalog/partStrength.ts`
的 `getPartStrengthIndex()`（模組層級快取）→ `deck.ts` 的
`estimateComboPartStrength()`（身分零件沒資料就回傳 `undefined`）→
`scoreDeck()`（真實證據優先、fallback 加下限不會輸）與 `recommendations.ts`
的獨立 `partStrengthGain`（只算淨新增可用零件）→ 前台三種文字狀態。

個人對戰紀錄：`BattleLogPage` 現場選 A／B 兩套零件 → `points: BattlePoint[]`
逐分記錄（`domain/battleRecords.ts` 的 `FINISH_POINTS` 算分、
`isMatchComplete()`／`matchWinner()` 判定）→ `repository.saveBattleMatch()`
（未達 4 分擋存檔）→ IndexedDB `battleMatches` 表（schema v7）→
`computePartWinRateIndex()` 算每顆零件勝率 → `deck.ts` 的
`personalWinRateGain`（減 0.5 置中之後才加總，只用在
`balanced`／`vs_attack`／`vs_stamina` 三種策略，`evidence` 策略排除）→
`BuilderPage` 狀態行與 `BattleLogPage` 零件勝率簡表。

CX 拆件：`scripts/buildCatalog.mjs` 的 `decomposeCxBlade()` 比對紋章＋主刃中文名
能不能拼出合併名稱，能拆就拆並用 `addAliasZhTW()` 把合併名稱補進兩顆零件的
`aliasesZhTW` → `catalog-audit.json` 的 `cxSplitBlades` 記錄拆件對照表 →
`domain/search.ts` 的 `searchParts()` 吃 `aliasesZhTW` 做比對。

零件類型比重：`analysis.ts` 的 `estimateTypeWeight()` 直接把零件 `type` 標籤
按槽位權重（上蓋 0.5／軸心 0.3／固鎖 0.2）加權混合成四個百分比
（`distributeToHundred()` 用最大餘數法保證加總剛好 100）→
`ComboAnalysis.typeWeight` → `builder.ts`／`buildableRows.ts`／`deck.ts`／
`recommendations.ts`／`reasons.ts`／`BuilderPage.tsx` 全部消費端。
