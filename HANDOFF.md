# 交接筆記

最後更新：2026-09-25 UTC+08:00
交接原因：一般交接（對戰紀錄升級成逐分計分板，Task 1-6 完成，尚未收尾）

## 目前目標

把上一輪「個人對戰紀錄」的資料模型從「一局一個籠統結果」換成「一場個別
對戰、逐分記錄」，符合 Beyblade X 官方個別對戰規則（先到 4 分獲勝：轉停
1／出界爆裂 2／極限 3）。記錄畫面不再需要先存配裝，直接複用配裝器的零件
選擇器現場選零件記分；加了即時計分板（含復原上一分／清除重來）；主分頁
加了「對戰」。Spec／Plan：
`docs/superpowers/specs/2026-09-25-battle-match-scoreboard-design.md`／
`docs/superpowers/plans/2026-09-25-battle-match-scoreboard.md`。

Task 1-6（型別、IndexedDB v7、repository、appStore、`BattleLogPage` 全頁
重寫、e2e/截圖/文件）程式碼與測試都已完成，**尚未 commit 文件同步這批、
尚未 push、尚未部署**。

## 發布狀態

| 層級 | 狀態 |
|---|---|
| 工作區 | 有未 commit 的文件變更（見下方 Step） |
| 本機 HEAD | `220fa8a`（Task 5，程式碼部分） |
| `origin/main` | `fd2e2ef`，落後本機 5 個 commit（Task 1-5 全部只在本機） |
| 線上 Pages | 未變更，仍是 `522b174`（這輪還沒部署） |

## 已驗證與未驗證

- `npx tsc -b`：通過，乾淨無輸出。
- `npm test`：481/481 全過。
- `npm run test:e2e`：新增的兩條個人對戰紀錄測試都過（手機／桌機各一次，
  共 4 個），涵蓋：計分板要兩邊都選了零件才出現、復原上一分真的解鎖按鈕
  （不是只退分數）、極限造成的超額跳分、存檔後配裝保留可連續記錄。全套
  `npm run test:e2e` 這輪還沒跑。
- `npm run shots`：已跑，已用 Read 工具看過
  `test-results/shots/desktop-battle-log.png`／`phone-battle-log.png`，
  雙配裝選擇器、計分板、歷史列表、零件勝率表都正常顯示，「對戰」分頁也
  正確出現在底部導覽。
- push／deploy／test:live：**還沒做**，是下一步。

## 阻塞

無。

## 下一個具體動作

1. commit 這輪文件變更（`BEYBLADE_X_codex_prompt.md`、spec 狀態列、
   `tests/e2e/pwa.spec.ts`、`tests/e2e/screenshot.shots.ts`、這份 HANDOFF）。
2. `git push origin main`（會一次推上 Task 1-6 全部 6 個 commit）。
3. `npm run test:e2e` 跑一次全套（這輪只跑過過濾出個人對戰紀錄那兩條，
   還沒跑全套確認沒有連帶破壞）。
4. `npm run deploy:pages` → `npm run test:live`，結果補回 HANDOFF。
5. 全部驗證過、確認線上真的換版後，用
   `superpowers:finishing-a-development-branch` 收尾這支 SDD（直接在
   `main` 上做，不是獨立分支）。

## 怎麼跑（非顯而易見的）

- 這是用 `superpowers:executing-plans` 執行的 SDD 計畫，直接在 `main` 上做
  （沒有開 worktree／分支，延續本 session 一路的慣例）。Ledger 在
  `.superpowers/sdd/2026-09-25-battle-match-scoreboard/progress.md`，裡面
  記著幾個 ruling（Task 1：測試裡「同一顆零件跨場輸贏」案例一開始建構錯
  （兩批都放在贏方），修的是測試不是程式碼；Task 2：plan 預測的 `tsc`
  excess-property 錯誤實際上不會發生（`new Map([[...]])` 巢狀物件字面值
  不會觸發這個檢查，用 `tsc -b --force` 驗證過），還是照做清掉但跳過假紅燈；
  Task 3：plan 漏寫 `DB_SCHEMA_VERSION` 要從 6 跳到 7，被匯出匯入的回歸測試
  抓到）。
- 上一輪（個人對戰紀錄 v1）的 Ledger 在
  `.superpowers/sdd/2026-09-24-personal-battle-log/progress.md`，如果還在
  可以刪，這輪的功能已經整個取代它。
- 其餘沿用既有規則（見 `CLAUDE.md`）。

## 踩過的坑（這輪新增）

- **測試檔案自己的建構邏輯也會有 bug，紅燈／綠燈都要讀懂為什麼，不能只看
  過不過**——`computePartWinRateIndex` 的「同一顆零件跨場輸贏各自累加」
  測試，第一版用展開運算子覆寫 `a`／`b` 欄位時把兩批案例都覆寫成同一邊
  贏，實際測出 wins:6/losses:0，程式碼本身是對的，是測試資料建構錯了。
  綠燈／紅燈都要看懂數字為什麼是那樣，不能只看 pass/fail 兩個字。
- **plan 預測的編譯錯誤不一定真的會發生**——plan 寫「拿掉 `PartWinRateEntry`
  的 `ties` 欄位後，`deck.test.ts` 裡多餘的 `ties: 0` 會讓 `tsc` 報 excess
  property 錯誤」，但巢狀在 `new Map([[...]])` 陣列字面值裡的物件不會觸發
  這個檢查（用 `tsc -b --force` 全量重建驗證過，兩次都乾淨）。TDD 的
  「先看紅燈」步驟如果實測沒有紅燈，不要硬掰一個紅燈出來，誠實記录、
  還是照原本的目標做修正就好。
- **改 IndexedDB schema 版本時，`DB_SCHEMA_VERSION` 常數要跟 `db.version(N)`
  同步升級，两者是分開的兩個地方**——這次只顧著加 `db.version(7).stores({...})`，
  忘記把 `export const DB_SCHEMA_VERSION` 從 6 改成 7，被匯出匯入的
  round-trip 測試（`exportBackup()` 蓋章的版本號跟 `importBackup()` 的
  版本判斷對不起來）抓到。以後改 schema 版本，這兩個地方要一起改，改完
  可以直接 `grep DB_SCHEMA_VERSION` 確認只有一個數字、跟最新的
  `db.version()` 一致。

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
  strict mode violation**——這輪已經全面改用 `data-testid` 而不是
  `getByText()` 來定位互動元件跟需要唯一識別的清單項目，之後新畫面延續
  這個慣例，斷言前先想清楚會不會有多筆同文字。
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
  的比分會跟著重算變動**——這次沒有把每一分的實際點值存進 `BattlePoint`，
  歷史紀錄的比分是即時用目前的 `FINISH_POINTS` 常數算出來的，不是存檔當下
  凍結的快照。只要這個常數本身不變就沒事，但如果之後官方規則改了、要調
  這幾個數字，舊紀錄的比分顯示會跟著變，這輪沒有做版本化快照。
- **個人對戰紀錄不做跨裝置同步／多人資料匯聚**——純本機 IndexedDB，別人裝
  這個 PWA 記錄的對戰你完全拿不到，是上一輪 spec 刻意排除的範圍，不是
  遺漏。如果之後想把多人資料匯聚成共用訊號，需要匯出／匯入流程或後端，
  是完全獨立的一輪工作。
- **BBXHub 資料併進零件強度 fallback 已試過，兩種合併策略都沒通過回測，
  這輪沒有合併**（詳細設計見
  `docs/superpowers/specs/2026-09-24-bbxhub-part-strength-merge-design.md`）。
  背景：CX 配置目前完全沒有零件強度 fallback（`stan-yao` 資料只收 BX／UX
  三件式），bbxhub 天梯榜單同時收 BX/UX/CX，理論上可以填補這塊空白，
  也能給 BX/UX 已有資料的零件補第二個來源。實測結果：
  - **直接加總（sum 模式）**：長尾 Spearman 從純 stan-yao 版的 0.661
    掉到 0.567（n=53→54，差距 0.094），超過規格訂的 0.05 容忍值，判準沒過。
    bbxhub 規模遠大於 stan-yao（單一零件數千筆 vs 全部 14,743 筆），直接
    相加會被 bbxhub 的排名蓋過去，反而讓「猜中 stan-yao 未來賽果」的能力
    變差。
  - **百分位平均（percentile-average 模式，備案）**：長尾 Spearman
    0.661→0.610（差距 0.051），**只差一點點就過關**（容忍值是 0.05），
    判準嚴格來說還是沒過，但幅度比 sum 模式小很多。這個數字是全分支
    review 抓到一個 bug 之後修正過的——`bbxhubCountByPart` 原本用
    `.set()` 直接覆蓋，bbxhub-meta.json 裡有 20 筆同一個 partId 出現多次
    的條目（同一顆融合上蓋配不同輔助戰刃各算一筆，例如 `main_blade:Bl`
    有 8 筆），覆蓋掉前面的筆數會嚴重低估該零件的真實聲量，原本記錄的
    差距 0.066 是錯的，修完（`b0f08b6`）才是準確的 0.051。
  - 兩種模式都在自己的隨機打亂對照組之上（都超出 3 倍以上，不是雜訊），
    但「長尾 Spearman 沒有明顯低於基準」這個判準才是真正決定 fallback
    品質的關鍵，兩者都沒過。
  - **判準本身的一個已知限制**：這個 0.05 容忍值比較的是「合併版重新選出
    的長尾（依合併後分數排前 25% 排除）」跟「純 stan-yao 版原本的長尾
    （依 stan-yao 分數排前 25% 排除）」，兩邊的零件集合本身不完全一樣
    （n=53 vs n=54）。全分支 review 額外拿「固定用 stan-yao 原本那 53 個
    長尾零件」重算過一次：sum 模式還是沒過（0.578），但 percentile-average
    在這個算法下會**過關**（0.6213，差距 0.0395）。這代表 percentile-average
    「有沒有過」跟怎麼定義「長尾」這個判準本身有關，不是單純的過／不過，
    這輪維持照 spec 原本寫的判準（重新選長尾）判定沒過，不是實作 bug，
    是判準定義本身就有這個模糊地帶，之後要重試合併時先想清楚要用哪種
    長尾定義。
  - **結論**：`mergePodiumCounts()`（`scripts/buildPartStrength.mjs`）兩種
    模式都已經寫好、保留在檔案裡，但沒有接進 `main()`。CX 配置維持沒有
    fallback 的現狀。之後如果 bbxhub 或 stan-yao 累積更多資料、或有第三種
    合併策略的想法，可以直接重跑
    `node scripts/backtestPartStrength.mjs` 看數字，不用重新設計流程。
  - 這個結論本身的限制：只驗證過「bbxhub 訓練期 + stan-yao 驗證期」這個
    切分方式，沒有反過來驗證「stan-yao 訓練期 + bbxhub 驗證期」（bbxhub
    沒有逐筆日期，沒辦法切）。如果之後 bbxhub 開始提供逐場日期資料，值得
    重新設計一次更對稱的驗證。
- **`bbxhub-meta.json`（`scripts/fetchBbxhubMeta.mjs` 的輸出）本身沒有任何
  程式消費它**——`grep -rln "bbxhub-meta" src/` 沒有結果，前台的 T 表／高手
  評級走的是完全不同的 `beybladehub-tier-lists.json`／`beybladehub-tier-ratings.json`
  （見 `catalog/tierLists.ts`）。2026-09-24 這輪把它的比對成功率從 45/167
  修到 82/167（見下），但上面已經試過把它接進零件強度 fallback，沒通過
  回測；除非之後有別的接法（例如當一個完全獨立、不跟 stan-yao 合併的
  第三方訊號），這份資料目前還是孤兒管線，不影響任何使用者看得到的東西。
- **BBXHub 比對失敗根因已查清，不是「冷門零件沒對照表」這麼簡單**：
  1. 原本的比對邏輯把整個 BBXHub 條目字串（可能是「融合上蓋 輔助戰刃」兩段式，
     例：`PegasusBlast Heavy`）當一個名字去查橋接表，橋接表只收得到融合上蓋
     單獨的名字，兩段式的永遠查不到——這是 `no_bridge_entry` 的主因，已修
     （`fetchBbxhubMeta.mjs` 的 `splitAssistBladeSuffix()`，用圖鑑裡的
     `assist_blade.naming.nameEn` 判斷該不該拆、拆完的融合上蓋歸到
     `main_blade`／`lock_chip` 這個身分零件，跟 `deck.ts` 的
     `IDENTITY_SLOT_KEYS` 同一套優先序）。
  2. `applyHubStats()`（`buildCatalog.mjs`）本來就抓得到 BeybladeHub 零件頁的
     `nameEn`，但只拿去比對 `type`／`spinDirection`／`officialWeightG` 等
     數值欄位，從沒把 `nameEn` 寫回 `naming.nameEn`——固鎖／軸心／輔助戰刃
     這三類因此幾乎全部沒有英文名（例如 `assist_blade` 19 顆裡原本只有 1 顆
     有 `nameEn`），已修（`applyHubStats()` 補一段複製邏輯，`assist_blade`
     現在 19 顆有 18 顆、`over_blade` 4 顆全有）。
  3. 橋接表（stan-yao Google Sheet）的中文翻譯偶爾跟圖鑑自己的翻譯不一致
     （例：`UnicornSting` 橋接表譯「幻獸刺心」，圖鑑實際是「獨角刺心」），
     照中文名查會查不到——已修，改成先直接比對圖鑑自己的 `naming.nameEn`
     （108 顆上蓋家族零件裡 95 顆已有），查不到才退回橋接表。
  - 修完後 45/167 → 82/167。剩下 85 筆：6 筆是圖鑑真的沒收錄的零件（例：
    `MummyCurse`／`OrochiCluster`／`SamuraiSteel`——beybladehub.app 的零件頁
    確認存在日文名，但我們的圖鑑建置流程沒抓到這幾顆，來源缺口，不是比對
    邏輯問題，不確定是不是太新還沒被官方一覽頁收錄），79 筆是兩段式名稱裡
    融合上蓋本身圖鑑跟橋接表都沒有（同一種缺口，只是發生在融合上蓋而不是
    輔助戰刃）。**沒有嘗試補這 6 顆缺漏零件或擴充橋接表**——加一顆新零件要
    完整資料（type／旋向／來源／provenance），不確定的東西不能半套塞進圖鑑，
    留給下一輪有需要時再查證。
  - **驗證注意**：查過程中先用 WebFetch 摘要了一份「輔助戰刃中文名對照表」
    （斬擊／迴圈／緩衝…），後來直接 `curl` 原始 HTML 核對，發現那份表是
    AI 摘要**幻覺出來的**，頁面上根本沒有這些中文字——所以最後只採用了
    `beybladehub-stats.json` 裡本來就有、也在原始 HTML 逐一 grep 驗證過的
    `nameEn` 英文名，中文名維持原樣（代號本身）。以後查 beybladehub.app 這類
    頁面內容，WebFetch 摘要當線索可以，寫進圖鑑前一定要拿 `curl` 對原始
    HTML 逐字確認，不能只信 AI 摘要。
- 零件強度 fallback 的訊號方向已驗證有時間持續性，但只對這次的特定訓練／驗證
  切分成立，賽事 meta 會隨新品發售、規則調整改變，之後要重跑回測再確認。
- `TYPE_WEIGHT`（上蓋 0.5／軸心 0.3／固鎖 0.2 的槽位權重）已測試過不支持用
  零件強度那套方法校正（見規格第 5 節），維持現狀，不用再花時間。
- `.claude/worktrees/part-strength-fallback` 與根目錄 `context-audit-v2.md`
  是未追蹤檔案，跟本輪 SDD 無關（分別是另一支功能的 worktree、另一份審計
  請求），本輪沒有動它們，接手時不要誤以為是本輪產物。

## 資料管線表

`stanyao-raw-records.json`（14,743 筆逐場進前三名次，只有正例沒有負例）→
`scripts/buildPartStrength.mjs`（展開 comboPartIds、按零件聚合、套
`computePercentiles()`）→ `part-strength.generated.json` → `catalog/partStrength.ts`
的 `getPartStrengthIndex()`（模組層級快取）→ `deck.ts` 的
`estimateComboPartStrength()`（身分零件沒資料就回傳 `undefined`）→
`scoreDeck()`（真實證據優先、fallback 加下限不會輸）與 `recommendations.ts`
的獨立 `partStrengthGain`（只算淨新增可用零件）→ 前台三種文字狀態。

CX 拆件：`scripts/buildCatalog.mjs` 的 `decomposeCxBlade()` 比對紋章＋主刃中文名
能不能拼出合併名稱，能拆就拆並用 `addAliasZhTW()` 把合併名稱補進兩顆零件的
`aliasesZhTW` → `catalog-audit.json` 的 `cxSplitBlades` 記錄拆件對照表 →
`domain/search.ts` 的 `searchParts()` 吃 `aliasesZhTW` 做比對。

零件類型比重（這輪主線）：`analysis.ts` 的 `estimateTypeWeight()` 直接把零件
`type` 標籤按槽位權重（上蓋 0.5／軸心 0.3／固鎖 0.2）加權混合成四個百分比
（`distributeToHundred()` 用最大餘數法保證加總剛好 100）→
`ComboAnalysis.typeWeight` → `builder.ts`／`buildableRows.ts`／`deck.ts`／
`recommendations.ts`／`reasons.ts`／`BuilderPage.tsx` 全部消費端。
