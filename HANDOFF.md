# 交接筆記

最後更新：2026-09-25 UTC+08:00
交接原因：一般交接（個人對戰紀錄功能已完成、通過全分支審查修正、驗證、上線）

## 目前目標

新增「個人對戰紀錄」功能：使用者在配裝器記錄自己（或跟朋友）的 1v1 練習
對戰結果，累積成每顆零件的勝率，當成配裝評分第四種獨立訊號（跟賽事證據、
零件強度 fallback、高手 T 表評級並列，不合併）。純本機 IndexedDB，刻意不做
跨裝置同步或多人資料匯聚。Spec／Plan：
`docs/superpowers/specs/2026-09-24-personal-battle-log-design.md`／
`docs/superpowers/plans/2026-09-24-personal-battle-log.md`。

Task 1-6 做完後跑了全分支 review（opus），抓到 4 個 Important，全部修完：
零件輸多贏少反而加分的反向訊號、歷史列表看不出是哪兩套配裝打的、對戰紀錄
沒被匯出匯入、配裝器缺狀態行跟日期改成寫死 UTC（該用本地時區）。細節見
「踩過的坑」。**已完整走完收尾流程（commit → push → e2e → shots → deploy →
test:live）**。下一步是用 `superpowers:finishing-a-development-branch`
收尾這支 SDD（直接在 `main` 上做，不是獨立分支）。

## 發布狀態

| 層級 | 狀態 |
|---|---|
| 工作區 | 乾淨 |
| 本機 HEAD | `3e7974c` |
| `origin/main` | `3e7974c`（同步） |
| 線上 Pages | 已部署，`gh-pages` commit `522b174`，`npm run test:live` 6/6 通過 |

## 已驗證與未驗證

- `npx tsc -b`：通過，乾淨無輸出。
- `npm test`：477/477 全過。
- `npm run test:e2e`：87 passed / 1 skipped（含新增與擴充的個人對戰紀錄
  測試，涵蓋狀態行三種狀態、日期可改、歷史列表顯示配裝名稱）。
- `npm run shots`：已跑，已用 Read 工具看過
  `test-results/shots/desktop-builder.png`／`desktop-battle-log.png`，
  配裝器狀態行、歷史列表配裝名稱、日期欄位都正常顯示。
- `npm run test:live`：6/6 通過。

## 阻塞

無。

## 下一個具體動作

用 `superpowers:finishing-a-development-branch` 收尾這支 SDD——這輪全程在
`main` 上做（沒有分支／worktree），收尾時要處理的是這件事本身怎麼標記完成，
不是合併分支。

## 怎麼跑（非顯而易見的）

- 這是用 `superpowers:executing-plans` 執行的 SDD 計畫，直接在 `main` 上做
  （沒有開 worktree／分支，延續本 session 一路的慣例）。Ledger 在
  `.superpowers/sdd/2026-09-24-personal-battle-log/progress.md`，裡面記著
  兩個 ruling（Task 1：`buildPartStrength.mjs` 那種 import 副作用問題這次
  沒有重演；Task 4：測試用檔案裡既有的 `memberFor()`/`threeDistinct`
  fixture 取代 brief 裡不存在的 `baseAnalysis`）。
- 其餘沿用既有規則（見 `CLAUDE.md`）。

## 踩過的坑（這輪新增）

- **加分訊號的原始值域不含負數時，直接加總等於「有資料就加分，不管資料
  說的是好是壞」**——`personalWinRateGain` 一開始直接加總 `winRate`
  （0～1，恆為正），導致一套配裝只要有紀錄、就算輸多贏少也比完全沒紀錄的
  配裝分數高，等於使用者記錄「這套很爛」反而讓系統更推薦它，是全分支
  審查抓到的 Important finding，不是邊角案例。修法是先找出這個值域裡
  代表「中性、沒有訊號」的那個點（這裡是 0.5，不輸不贏），加總前先減掉
  那個基準點，讓負面資料真的能扣分。以後任何新的「零件層級加分訊號」，
  上線前都要先問一句「這個訊號的值域裡，0 分／中性點在哪裡？」，不能預設
  「有資料 = 加分」。
- **新增一個會員本機資料型別（IndexedDB 新表）時，匯出／匯入備份
  （`exportBackup`／`importBackup`）不會自動涵蓋，要自己記得補**——這次
  `battleRounds` 表 Task 2 就建好了，但一路到全分支審查才發現備份流程完全
  沒碰它，使用者換裝置或重置手機會整批對戰紀錄消失不見。以後只要在
  `db.ts` 加新表，`BackupPayload`／`exportBackup`／`importBackup` 三處
  要一起檢查，不能假設「資料存進 IndexedDB 就等於安全」。
- **舊表被刪除後又因為完全不同的新功能重新建立、還沿用同一個表名時，
  舊備份裡同名欄位的資料形狀可能不相容**——`battleRounds` 這個名字在
  v4 對應的是已刪除的「人工逐局紀錄」功能（完全不同的欄位），v6 對應的是
  這次全新的個人對戰紀錄功能。匯入舊備份時如果沒有先判斷 `schemaVersion`，
  舊格式的資料會被當新格式硬塞進去。表名重複使用前，要先想清楚匯入路徑
  會不會把「同名但語意不同」的舊資料誤當新資料吃進來。
- **寫 plan 時沒有實際讀 `ui.tsx` 元件的真實 prop 名稱，直接照 spec 討論時
  的口語命名寫程式碼範例**——plan 草稿一開始用了 `titleZhTW`／`messageZhTW`
  這種不存在的 prop（真正的是 `title`／`description`／`hint`），寫 plan 的
  self-review 階段才抓到、改掉。以後 plan 裡任何「用既有元件」的程式碼範例，
  寫之前一定要先讀那個元件的真實簽名，不能憑印象或憑語感編。
- **e2e 斷言用純文字比對（`getByText('A 贏')`）在畫面上有 `<option>` 或
  多筆重複資料時會撞到 strict mode violation**——這次配裝結果選單裡的
  `<option value="a">A 贏</option>` 跟歷史列表裡的「A 贏」撞在一起；零件
  勝率表 4 顆零件全部顯示「樣本不足」也撞了 4 次。兩個都不是功能壞了，是
  選擇器不夠精確；補 `data-testid="battle-round"` 到清單項目上、對表格斷言
  加 `.first()` 解決。新畫面只要有清單或表格，斷言前就該先想清楚會不會有
  多筆同文字，不要等測試紅了才發現。
- **裸 `<table>` 沒有任何樣式時，數字會直接貼著零件名稱擠成一團**（例如
  「蒼龍神劍1 0 0」看起來像同一個字串）——這個專案目前沒有既有的 table
  樣式可抄，是全站第一張表格。用 `var(--border)` 分隔線 + padding + 靠右對齊
  數字欄位修掉，包一層 `overflow-x: auto` 的 `card` 容器避免手機寬度爆版。
  之後如果要再加表格，先看這次 `BattleLogPage.tsx` 的寫法當範本，不用重新
  試錯。

## 踩過的坑（沿用既有，仍然有效）

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

- **個人對戰紀錄不做跨裝置同步／多人資料匯聚**——純本機 IndexedDB，別人裝
  這個 PWA 記錄的對戰你完全拿不到，是這輪 spec（第 1 節）刻意排除的範圍，
  不是遺漏。如果之後想把多人資料匯聚成共用訊號，需要匯出／匯入流程或
  後端，是完全獨立的一輪工作。
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
