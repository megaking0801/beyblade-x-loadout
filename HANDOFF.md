# 交接筆記

最後更新：2026-09-28 UTC+08:00
交接原因：正式交接（3on3 團體賽對戰紀錄，全部完成並已上線）

## 目前目標

這輪主題：對戰紀錄加官方 3on3 團體賽計分（跟 1v1「同一套配裝連續得分到
4 分」不一樣——3on3 是三場個別對戰，每場只有一個終結技就分勝負，分數
累加到 4 分判定整場團隊贏家）。Spec／Plan：
`docs/superpowers/specs/2026-09-28-3on3-team-battle-log-design.md`／
`docs/superpowers/plans/2026-09-28-3on3-team-battle-log.md`。規則依據見
spec 第 2 節（官方 Regulations 6th edition PDF 逐字節錄）。

`BattleMatch` 改成 discriminated union（`mode: '1v1' | '3on3'`），
`BattlePoint` 加 `beyIndex?: 0|1|2` 標記 3on3 哪一分是哪隻陀螺打的。零件
勝率統計對 3on3 改成逐分歸屬（隊伍贏不代表三隻陀螺都贏，只有實際打贏那
一場的陀螺才算勝場）。新增 `TeamBattleLog.tsx` 元件處理 3on3 選裝＋計分，
`BattleLogPage.tsx` 加「1v1／3on3」模式切換，歷史紀錄／零件勝率表兩種
模式共用同一份渲染。IndexedDB v7→v8，migration 幫舊 1v1 紀錄補
`mode: '1v1'`（匯入舊備份也一樣補）。

**整輪都已完整完成並上線。** 沒有下一步待辦，只有下面「已知缺口」列的
刻意排除範圍（延伸賽換陀螺順序的演算法本身官方沒寫死，這輪不模擬）。

## 發布狀態

| 層級 | 狀態 |
|---|---|
| 工作區 | 乾淨，僅一個跟本輪無關的既有殘留（見下方「已知缺口」最後一條） |
| 本機 HEAD | `1a813af` |
| `origin/main` | `1a813af`（一致） |
| 線上 Pages | `d7d1b9b`（本輪已部署） |

## 已驗證與未驗證

- `npx tsc -b`：通過，乾淨無輸出。
- `npm test`：**489/489 全過**（final review 修復後再次確認）。
- `npm run test:e2e` 全套（非過濾，final review 修復後跑的最新一次）：
  **97 passed, 1 skipped**（skip 是既有 WebKit 離線測試已知 flake，跟本輪
  無關）。
- `npm run shots`：final review 修復前跑的（修復只動 `db.ts`／測試檔，
  沒動任何畫面），已用 Read 工具確認
  `desktop-battle-log-3on3.png`／`phone-battle-log-3on3.png`（3on3 計分
  畫面）跟 `battle-log.png`（選裝畫面新增的 1v1／3on3 切換按鈕）都正常
  顯示，沒跑版，跟 1v1 視覺語言一致。
- `npm run deploy:pages`：完成，gh-pages `d7d1b9b`。
- `npm run test:live`：**6/6 全過**（phone/desktop 各 3 條：可開啟＋加商品、
  service worker 註冊、圖片路徑）。

## 阻塞

無。

## 下一個具體動作

無待辦。若要繼續優化，可以考慮 final review 記錄的 deferred Minor 項目
（見下方「Final review 發現與修復」），或使用者提出的新需求。

## Final review 發現與修復（這輪新增）

派 fresh opus subagent 對照 plan 的 Review Focus 段落審查
`5e089f0..0ae4a9a`（Task 1-5 全部 commit），結論：無 Critical，1 個
Important 已修，6 個 Minor 記錄 deferred：

- **Important（真 bug，且是自己記錄過的坑又踩一次）**：`db.ts` 加了
  `db.version(8)` 卻忘記把 `export const DB_SCHEMA_VERSION` 從 7 改成
  8——這正是本檔案「踩過的坑（沿用既有）」那條「兩者是分開的兩個地方」
  講的事，這輪自己又犯了一次。後果：`exportBackup()` 的 `schemaVersion`
  是拿這個常數蓋章，蓋成 7 會讓「備份版本過新」防呆失效（舊版 v7 app，
  例如另一台裝置上還沒更新的 PWA 快取，會被騙去讀含 3on3 陣列形狀
  `a`／`b` 的備份，`comboLabel()` 會印出 `[object Object]`、零件勝率會
  悄悄漏算）。已修：常數改成 8，新增測試
  `exportBackup 的 schemaVersion 要跟最新的 db.version() 一致`
  （`expect(backup.schemaVersion).toBe(db.verno)`），先紅（7≠8）後綠。
- Minor 記錄到 ledger 當 deferred（不修）：匯入時陣列型別檢查順序在
  `.map()` 之後，格式錯的備份會噴原始 TypeError 而不是友善訊息；切換
  1v1／3on3 模式會無聲丟掉 3on3 進行中的分數（1v1 端反而完全不清狀態，
  兩邊不對稱）；某一隻陀螺打完那一場後配裝還能再改，存檔時會把那一分
  歸屬到改過的新配裝；延伸賽按鈕有一個永遠不會是 `true` 的
  `disabled={complete}` 死程式碼；延伸賽 e2e 測試標題講零件勝率但測試本身
  沒斷言勝率表；點擊「已經選中」的結構按鈕還是會清空那隻陀螺（跟 1v1
  既有行為一致）。

## 怎麼跑（非顯而易見的）

- 這輪走 `superpowers:brainstorming` architectural path（先寫 spec、再
  `writing-plans`、再 `executing-plans`），直接在 `main` 上做（沒有開
  worktree／分支）。Ledger 在
  `.superpowers/sdd/2026-09-28-3on3-team-battle-log/progress.md`，final
  review 還沒跑，ledger 裡還沒有 `Final:` 開頭的行。
- 3on3 計分畫面「每場只有一個終結技就分勝負、自動前進下一場」跟 1v1
  「同一套配裝連續得分到 4 分」是兩套完全不同的操作邏輯，不要憑印象套用
  1v1 的 UI 慣例——`TeamBattleLog.tsx` 是獨立元件，不是 `BattleLogPage`
  裡加個 if 分支硬塞。

## 踩過的坑（這輪新增）

- **`points.length < 3` 不能單獨當作「還在排定中的前三場」的判斷式，要
  跟 `isMatchComplete` 一起看**——3on3 計分畫面的 `scheduledIndex` 一開始
  只寫 `points.length < 3 ? points.length : undefined`，沒考慮到極限
  （+3）常常讓累計分數在第 2 場就衝過 4 分：這時 `complete` 已經是
  `true`，但 `points.length` 還是 2（< 3），畫面會繼續顯示「第 3 場」，
  不會跳去顯示贏家／存檔區。已修成 `!complete && points.length < 3`。
  這是自己寫的 e2e 測試在紅燈階段抓到的，不是憑空想到——任何「用 points
  數量推算目前在第幾場」的邏輯，都要先跟「比賽是否已經結束」交叉確認。
- **TypeScript 標準庫的 `Omit<T, K>` 對 discriminated union 不會分流**——
  `keyof (A|B)` 只取兩者共同鍵，`Pick` 會把每個鍵的型別攤平成聯集，
  `Omit<BattleMatch,'id'>` 會讓 `mode`／`a`／`b` 三個欄位互相脫鉤（型別上
  允許 `mode:'1v1'` 卻配 `a: [ComboSlots,ComboSlots,ComboSlots]` 這種不合法
  組合）。要保留「哪個 mode 對應哪種形狀」的關聯，得自己定義
  `type DistributiveOmit<T,K> = T extends unknown ? Omit<T,K> : never`。
  用在 `Repository.saveBattleMatch` 的輸入型別。
- **對「型別上一定存在的必填欄位」用 `'key' in obj` 判斷式來偵測「執行期
  可能缺欄位的舊資料」會被 TS 判斷式窄化成 `never`，導致 spread 報
  `Spread types may only be created from object types`**——`importBackup`
  幫 v7 舊備份的 `battleMatches` 補 `mode` 時，第一版寫
  `'mode' in match ? match : {...match, mode:'1v1'}`，因為 `BattleMatch`
  型別宣告 `mode` 必填，TS 認定 `'mode' in match` 恆真，把 else 分支推導成
  `never`。改用寬鬆型別（`Partial<BattleMatch> & Record<string,unknown>`）
  讀 `match.mode` 再整個 cast 回 `BattleMatch` 才繞得過去——遇到「型別說
  一定有、但舊資料實際上可能沒有」的欄位，判斷式要透過寬鬆型別讀，不能
  靠 `in` 運算子。
- **改 IndexedDB schema 版本時，除了 `DB_SCHEMA_VERSION` 常數，測試檔案裡
  任何寫死 `expect(db.verno).toBe(N)` 的既有斷言都要一起找出來改**——這輪
  只顧著改 v6→v7 那條 migration 測試的 `verno` 期望值，漏掉另一條完全獨立
  的「IndexedDB v5 migration」測試也寫死 `toBe(7)`，被 `npm test` 全套跑
  才抓到。以後升版本，先 `grep "verno).toBe("` 抓出全部要改的地方，不要
  只改自己這輪新寫的那條。

## 踩過的坑（沿用既有，仍然有效）

- **`Row` 元件本身沒有上下 margin，只有 `Section` 有**——`ui.tsx` 的
  `Row()` 只是 `display:flex; gap; flexWrap`，垂直間距全靠外層
  `Section` 的 `marginBottom: 22` 或父層 `.stack`／`.card` 的 grid
  `gap`。在 `Section` 外面裸放連續好幾個 `Row` 或自訂 `div`，中間會是
  0 間距、疊在一起。新畫面／新區塊只要沒包在 `Section` 或帶 gap 的容器
  裡，一定要自己補間距，寫完務必截圖核對，不能只看 `tsc`／單元測試過。
- **`fullPage: true` 的截圖會把 `position: fixed` 的底部 tabbar 畫在畫面
  中段，疊住底下的按鈕**——純粹是全頁截圖的算圖方式問題，實機不會有這個
  現象，看截圖核對版面時記得這一條，不要誤判成真的 bug。
- **改 IndexedDB schema 版本時，`DB_SCHEMA_VERSION` 常數要跟 `db.version(N)`
  同步升級，兩者是分開的兩個地方**——改完可以直接 `grep DB_SCHEMA_VERSION`
  確認只有一個數字、跟最新的 `db.version()` 一致。

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

- **3on3 延伸賽（三場打完仍未到 4 分）不模擬官方的換陀螺順序演算法**——
  官方規則本身沒寫死怎麼換順序（比賽現場由雙方協調），這輪延伸賽只給
  通用、不綁定特定陀螺的加分介面，見
  `docs/superpowers/specs/2026-09-28-3on3-team-battle-log-design.md`
  第 7 節。
- **3on3 選裝不檢查「同一隊三隻陀螺不能用重複零件」**——那是
  `DecksPage` 隊伍組建階段的責任，`BattleLogPage`／`TeamBattleLog` 是
  現場記分工具，不重新做一次驗證，刻意排除。
- **不整合已存的 `Deck`（3on3 隊伍）快速選裝**——3on3 對戰紀錄跟 1v1
  一樣現場選 6 套配裝，不會從 `DecksPage` 已存的隊伍清單挑一組直接帶入。
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

個人對戰紀錄：`BattleLogPage`（1v1，現場選 A／B 兩套零件）／
`TeamBattleLog`（3on3，現場選 A／B 各 3 套零件）→ `points: BattlePoint[]`
逐分記錄（`domain/battleRecords.ts` 的 `FINISH_POINTS` 算分、
`isMatchComplete()`／`matchWinner()` 判定，兩種模式共用）→
`repository.saveBattleMatch()`（未達 4 分擋存檔）→ IndexedDB
`battleMatches` 表（schema v8，`mode: '1v1'|'3on3'` 判斷形狀）→
`computePartWinRateIndex()` 算每顆零件勝率（1v1 整場歸屬、3on3 逐分
歸屬——見 `docs/superpowers/specs/2026-09-28-3on3-team-battle-log-design.md`
第 4 節）→ `deck.ts` 的 `personalWinRateGain`（減 0.5 置中之後才加總，
只用在 `balanced`／`vs_attack`／`vs_stamina` 三種策略，`evidence` 策略
排除）→ `BuilderPage` 狀態行與 `BattleLogPage` 零件勝率簡表。

CX 拆件：`scripts/buildCatalog.mjs` 的 `decomposeCxBlade()` 比對紋章＋主刃中文名
能不能拼出合併名稱，能拆就拆並用 `addAliasZhTW()` 把合併名稱補進兩顆零件的
`aliasesZhTW` → `catalog-audit.json` 的 `cxSplitBlades` 記錄拆件對照表 →
`domain/search.ts` 的 `searchParts()` 吃 `aliasesZhTW` 做比對。

零件類型比重：`analysis.ts` 的 `estimateTypeWeight()` 直接把零件 `type` 標籤
按槽位權重（上蓋 0.5／軸心 0.3／固鎖 0.2）加權混合成四個百分比
（`distributeToHundred()` 用最大餘數法保證加總剛好 100）→
`ComboAnalysis.typeWeight` → `builder.ts`／`buildableRows.ts`／`deck.ts`／
`recommendations.ts`／`reasons.ts`／`BuilderPage.tsx` 全部消費端。
